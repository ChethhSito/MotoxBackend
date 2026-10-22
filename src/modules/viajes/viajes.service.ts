import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Actor } from '../seguridad/actor.js';
import {
  AcceptListedDto,
  ConfirmDeliveryDto,
  CreateRideDto,
  DriverPositionDto,
  OfferDto,
  PaymentDto,
  RaisePriceDto,
  RatingDto,
} from './dto/viajes.dto.js';
import {
  OfferRow,
  RideRow,
  RideStatus,
  ViajesRepository,
} from './viajes.repository.js';

@Injectable()
export class ViajesService {
  constructor(private readonly rides: ViajesRepository) {}

  async create(actor: Actor, dto: CreateRideDto) {
    if (
      dto.rideType === 'delivery' &&
      (!dto.deliveryDetails || !dto.deliveryPin)
    ) {
      throw new BadRequestException('El envío requiere datos y PIN de entrega');
    }
    if (dto.rideType === 'taxi' && (dto.deliveryDetails || dto.deliveryPin)) {
      throw new BadRequestException(
        'Un viaje normal no lleva datos de entrega',
      );
    }
    try {
      return await this.rides.transaction(async (client) => {
        const result = await client.query<RideRow>(
          `INSERT INTO rides (
             client_uid, ride_type, start_lat, start_lng, end_lat, end_lng,
             start_name, end_name, waypoints, comment, initial_price,
             route_distance_m, delivery_details, delivery_pin_hash,
             auto_accept_offer
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING *`,
          [
            actor.uid,
            dto.rideType,
            dto.startLocation.lat,
            dto.startLocation.lng,
            dto.endLocation.lat,
            dto.endLocation.lng,
            dto.namedStartLocation,
            dto.namedEndLocation,
            JSON.stringify(dto.waypoints),
            dto.comment ?? '',
            dto.initialPrice,
            dto.routeDistance ?? null,
            dto.deliveryDetails ? JSON.stringify(dto.deliveryDetails) : null,
            dto.deliveryPin ? this.hashPin(dto.deliveryPin) : null,
            dto.autoAcceptOffer ?? false,
          ],
        );
        const ride = result.rows[0];
        await this.rides.event(client, ride.id, actor.uid, 'created');
        return this.serialize(ride, actor);
      });
    } catch (error) {
      this.rethrowUnique(error, 'Ya tienes una solicitud activa');
    }
  }

  async one(actor: Actor, id: string) {
    const ride = await this.requireRide(id);
    if (ride.client_uid !== actor.uid && ride.driver_uid !== actor.uid) {
      throw new ForbiddenException('No participas en este viaje');
    }
    return this.serialize(ride, actor);
  }

  async history(actor: Actor, side: 'client' | 'driver', limit: number) {
    const rows = await this.rides.history(
      actor.uid,
      side,
      Math.min(Math.max(limit, 1), 50),
    );
    return rows.map((ride) => this.serialize(ride, actor));
  }

  async pendingNearby(
    actor: Actor,
    lat: number,
    lng: number,
    radiusKm: number,
  ) {
    this.requireDriver(actor);
    const rows = await this.rides.pendingNearby(lat, lng, radiusKm);
    return rows
      .filter((ride) => ride.client_uid !== actor.uid)
      .map((ride) => ({
        ...this.serialize(ride, actor),
        distanceKm: ride.distance_km,
      }));
  }

  async pendingDetail(actor: Actor, id: string) {
    this.requireDriver(actor);
    const ride = await this.requireRide(id);
    if (ride.status !== 'pending')
      throw new ConflictException('Solicitud no disponible');
    if (ride.client_uid === actor.uid) throw new ForbiddenException();
    return this.serialize(ride, actor);
  }

  async offers(actor: Actor, rideId: string) {
    const ride = await this.requireRide(rideId);
    if (
      actor.uid !== ride.client_uid &&
      actor.uid !== ride.driver_uid &&
      actor.role !== 'driver'
    ) {
      throw new ForbiddenException('No puedes ver estas ofertas');
    }
    const rows = await this.rides.offers(rideId);
    return rows
      .filter(
        (offer) =>
          actor.uid === ride.client_uid || offer.driver_uid === actor.uid,
      )
      .map((offer) => this.serializeOffer(offer));
  }

  async raisePrice(actor: Actor, rideId: string, dto: RaisePriceDto) {
    return this.rides.transaction(async (client) => {
      const ride = this.existing(await this.rides.lockedRide(client, rideId));
      if (ride.client_uid !== actor.uid) throw new ForbiddenException();
      if (ride.status !== 'pending')
        throw new ConflictException('La búsqueda ya terminó');
      if (ride.price_version !== dto.expectedVersion) {
        throw new ConflictException('La tarifa cambió; recarga la solicitud');
      }
      if (dto.price <= Number(ride.initial_price)) {
        throw new BadRequestException('La tarifa nueva debe ser mayor');
      }
      const result = await client.query<RideRow>(
        `UPDATE rides SET initial_price=$2, price_version=price_version+1,
         updated_at=now() WHERE id=$1 RETURNING *`,
        [rideId, dto.price],
      );
      await client.query(
        "UPDATE offers SET status='stale' WHERE ride_id=$1 AND status='pending'",
        [rideId],
      );
      await this.rides.event(client, rideId, actor.uid, 'price_raised', {
        price: dto.price,
        priceVersion: result.rows[0].price_version,
      });
      return this.serialize(result.rows[0], actor);
    });
  }

  async offer(actor: Actor, rideId: string, dto: OfferDto) {
    this.requireDriver(actor);
    try {
      return await this.rides.transaction(async (client) => {
        const ride = this.existing(await this.rides.lockedRide(client, rideId));
        if (ride.status !== 'pending')
          throw new ConflictException('Solicitud no disponible');
        if (ride.client_uid === actor.uid) throw new ForbiddenException();
        if (ride.price_version !== dto.priceVersion) {
          throw new ConflictException(
            'La tarifa cambió; actualiza la solicitud',
          );
        }
        await this.ensureDriverFree(client, actor.uid);
        const result = await client.query<OfferRow>(
          `INSERT INTO offers (ride_id, driver_uid, price, price_version)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (ride_id, driver_uid) DO UPDATE SET
           price=EXCLUDED.price, price_version=EXCLUDED.price_version,
           status='pending', created_at=now(), expires_at=now()+interval '2 minutes'
         RETURNING *`,
          [rideId, actor.uid, dto.price, dto.priceVersion],
        );
        if (
          ride.auto_accept_offer &&
          Number(ride.initial_price) === dto.price
        ) {
          await client.query(
            "UPDATE offers SET status='accepted' WHERE id=$1",
            [result.rows[0].id],
          );
          await client.query(
            "UPDATE offers SET status='stale' WHERE ride_id=$1 AND id<>$2 AND status='pending'",
            [rideId, result.rows[0].id],
          );
          await client.query(
            `UPDATE rides SET driver_uid=$2, final_price=$3,
           status='accepted', accepted_at=now(), updated_at=now()
           WHERE id=$1`,
            [rideId, actor.uid, dto.price],
          );
          await this.rides.event(
            client,
            rideId,
            actor.uid,
            'offer_auto_accepted',
            {
              offerId: result.rows[0].id,
            },
          );
          return this.serializeOffer({ ...result.rows[0], status: 'accepted' });
        }
        await this.rides.event(client, rideId, actor.uid, 'offer_created', {
          price: dto.price,
          priceVersion: dto.priceVersion,
        });
        return this.serializeOffer(result.rows[0]);
      });
    } catch (error) {
      this.rethrowUnique(error, 'El conductor ya tiene un viaje activo');
    }
  }

  async acceptListed(actor: Actor, rideId: string, dto: AcceptListedDto) {
    this.requireDriver(actor);
    try {
      return await this.rides.transaction(async (client) => {
        const ride = this.existing(await this.rides.lockedRide(client, rideId));
        if (ride.status !== 'pending')
          throw new ConflictException('Solicitud no disponible');
        if (ride.client_uid === actor.uid) throw new ForbiddenException();
        if (
          ride.price_version !== dto.expectedVersion ||
          Number(ride.initial_price) !== dto.expectedPrice
        )
          throw new ConflictException(
            'La tarifa cambió; actualiza la solicitud',
          );
        await this.ensureDriverFree(client, actor.uid);
        const result = await client.query<RideRow>(
          `UPDATE rides SET driver_uid=$2, final_price=initial_price,
           status='accepted', accepted_at=now(), updated_at=now()
           WHERE id=$1 RETURNING *`,
          [rideId, actor.uid],
        );
        await client.query(
          "UPDATE offers SET status='stale' WHERE ride_id=$1 AND status='pending'",
          [rideId],
        );
        await this.rides.event(
          client,
          rideId,
          actor.uid,
          'listed_price_accepted',
        );
        return this.serialize(result.rows[0], actor);
      });
    } catch (error) {
      this.rethrowUnique(error, 'Ya tienes un viaje activo');
    }
  }

  async acceptOffer(actor: Actor, rideId: string, offerId: string) {
    try {
      return await this.rides.transaction(async (client) => {
        const ride = this.existing(await this.rides.lockedRide(client, rideId));
        if (ride.client_uid !== actor.uid) throw new ForbiddenException();
        if (ride.status !== 'pending')
          throw new ConflictException('Solicitud no disponible');
        const offer = await this.rides.lockedOffer(client, offerId);
        if (!offer || offer.ride_id !== rideId || offer.status !== 'pending') {
          throw new ConflictException('Oferta no disponible');
        }
        if (
          offer.price_version !== ride.price_version ||
          offer.expires_at <= new Date()
        ) {
          throw new ConflictException('La oferta venció o la tarifa cambió');
        }
        await this.ensureDriverFree(client, offer.driver_uid);
        await client.query("UPDATE offers SET status='accepted' WHERE id=$1", [
          offerId,
        ]);
        await client.query(
          "UPDATE offers SET status='stale' WHERE ride_id=$1 AND id<>$2 AND status='pending'",
          [rideId, offerId],
        );
        const result = await client.query<RideRow>(
          `UPDATE rides SET driver_uid=$2, final_price=$3,
           status='accepted', accepted_at=now(), updated_at=now()
           WHERE id=$1 RETURNING *`,
          [rideId, offer.driver_uid, offer.price],
        );
        await this.rides.event(client, rideId, actor.uid, 'offer_accepted', {
          offerId,
          driverUid: offer.driver_uid,
        });
        return this.serialize(result.rows[0], actor);
      });
    } catch (error) {
      this.rethrowUnique(error, 'El conductor ya tiene un viaje activo');
    }
  }

  async rejectOffer(actor: Actor, rideId: string, offerId: string) {
    return this.rides.transaction(async (client) => {
      const ride = this.existing(await this.rides.lockedRide(client, rideId));
      if (ride.client_uid !== actor.uid) throw new ForbiddenException();
      if (ride.status !== 'pending')
        throw new ConflictException('Solicitud no disponible');
      const offer = await this.rides.lockedOffer(client, offerId);
      if (!offer || offer.ride_id !== rideId)
        throw new NotFoundException('Oferta no encontrada');
      if (offer.status === 'rejected') return this.serializeOffer(offer);
      if (offer.status !== 'pending')
        throw new ConflictException('Oferta no disponible');
      if (offer.expires_at <= new Date()) {
        throw new ConflictException('La oferta venció');
      }
      const result = await client.query<OfferRow>(
        "UPDATE offers SET status='rejected' WHERE id=$1 RETURNING *",
        [offerId],
      );
      await this.rides.event(client, rideId, actor.uid, 'offer_rejected', {
        offerId,
      });
      return this.serializeOffer(result.rows[0]);
    });
  }

  async withdrawOffer(actor: Actor, rideId: string, offerId: string) {
    this.requireDriver(actor);
    return this.rides.transaction(async (client) => {
      const ride = this.existing(await this.rides.lockedRide(client, rideId));
      const offer = await this.rides.lockedOffer(client, offerId);
      if (!offer || offer.ride_id !== rideId)
        throw new NotFoundException('Oferta no encontrada');
      if (offer.driver_uid !== actor.uid) throw new ForbiddenException();
      if (offer.status === 'withdrawn') return this.serializeOffer(offer);
      if (ride.status !== 'pending' || offer.status !== 'pending') {
        throw new ConflictException('La oferta ya no puede retirarse');
      }
      if (offer.expires_at <= new Date()) {
        throw new ConflictException('La oferta venció');
      }
      const result = await client.query<OfferRow>(
        "UPDATE offers SET status='withdrawn' WHERE id=$1 RETURNING *",
        [offerId],
      );
      await this.rides.event(client, rideId, actor.uid, 'offer_withdrawn', {
        offerId,
      });
      return this.serializeOffer(result.rows[0]);
    });
  }

  async transition(actor: Actor, rideId: string, status: RideStatus) {
    return this.rides.transaction(async (client) => {
      const ride = this.existing(await this.rides.lockedRide(client, rideId));
      const isClient = ride.client_uid === actor.uid;
      const isDriver = ride.driver_uid === actor.uid && actor.role === 'driver';
      if (!isClient && !isDriver) throw new ForbiddenException();
      if (ride.status === status) return this.serialize(ride, actor);
      const allowed =
        (status === 'arrived' && ride.status === 'accepted' && isDriver) ||
        (status === 'ongoing' && ride.status === 'arrived' && isDriver) ||
        (status === 'completed' &&
          ride.status === 'ongoing' &&
          ride.ride_type === 'taxi' &&
          isDriver) ||
        (status === 'waiting_verification' &&
          ride.status === 'ongoing' &&
          ride.ride_type === 'delivery' &&
          isDriver) ||
        (status === 'canceled' &&
          ['pending', 'accepted', 'arrived'].includes(ride.status) &&
          (isClient || isDriver));
      if (!allowed)
        throw new ConflictException('Transición de viaje no permitida');
      const result = await client.query<RideRow>(
        `UPDATE rides SET status=$2, updated_at=now(),
         completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END,
         canceled_by=CASE WHEN $2='canceled' THEN $3 ELSE canceled_by END
         WHERE id=$1 RETURNING *`,
        [rideId, status, isClient ? 'client' : 'driver'],
      );
      if (status === 'canceled') {
        await client.query(
          "UPDATE offers SET status='stale' WHERE ride_id=$1 AND status='pending'",
          [rideId],
        );
      }
      await this.rides.event(client, rideId, actor.uid, `status_${status}`);
      return this.serialize(result.rows[0], actor);
    });
  }

  async confirmDelivery(actor: Actor, rideId: string, dto: ConfirmDeliveryDto) {
    return this.rides.transaction(async (client) => {
      const ride = this.existing(await this.rides.lockedRide(client, rideId));
      if (ride.client_uid !== actor.uid) throw new ForbiddenException();
      if (
        ride.ride_type !== 'delivery' ||
        ride.status !== 'waiting_verification'
      ) {
        throw new ConflictException('La entrega no espera verificación');
      }
      if (
        !ride.delivery_pin_hash ||
        !this.verifyPin(dto.pin, ride.delivery_pin_hash)
      ) {
        throw new BadRequestException('PIN de entrega incorrecto');
      }
      const result = await client.query<RideRow>(
        "UPDATE rides SET status='completed', completed_at=now(), updated_at=now() WHERE id=$1 RETURNING *",
        [rideId],
      );
      await this.rides.event(client, rideId, actor.uid, 'delivery_confirmed');
      return this.serialize(result.rows[0], actor);
    });
  }

  async confirmPayment(actor: Actor, rideId: string, dto: PaymentDto) {
    this.requireDriver(actor);
    return this.rides.transaction(async (client) => {
      const ride = this.existing(await this.rides.lockedRide(client, rideId));
      if (ride.driver_uid !== actor.uid) throw new ForbiddenException();
      if (ride.status !== 'completed')
        throw new ConflictException('El viaje no terminó');
      if (ride.payment_status === 'paid') return this.serialize(ride, actor);
      const result = await client.query<RideRow>(
        `UPDATE rides SET payment_status='paid', payment_method=$2,
         payment_confirmed_by=$3, paid_at=now(), updated_at=now()
         WHERE id=$1 RETURNING *`,
        [rideId, dto.method, actor.uid],
      );
      await this.rides.event(client, rideId, actor.uid, 'payment_confirmed', {
        method: dto.method,
      });
      return this.serialize(result.rows[0], actor);
    });
  }

  async updatePosition(actor: Actor, dto: DriverPositionDto) {
    this.requireDriver(actor);
    return this.rides.transaction(async (client) => {
      await client.query(
        `INSERT INTO driver_positions (driver_uid, latitude, longitude)
         VALUES ($1,$2,$3) ON CONFLICT (driver_uid) DO UPDATE SET
         latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, updated_at=now()`,
        [actor.uid, dto.lat, dto.lng],
      );
      return { latitude: dto.lat, longitude: dto.lng };
    });
  }

  async driverPosition(actor: Actor, rideId: string) {
    const ride = await this.requireRide(rideId);
    if (ride.client_uid !== actor.uid && ride.driver_uid !== actor.uid) {
      throw new ForbiddenException();
    }
    if (!ride.driver_uid)
      throw new ConflictException('No hay conductor asignado');
    if (
      !['accepted', 'arrived', 'ongoing', 'waiting_verification'].includes(
        ride.status,
      )
    ) {
      throw new ConflictException('El seguimiento ya no está activo');
    }
    const position = await this.rides.position(ride.driver_uid);
    if (!position || Date.now() - position.updated_at.getTime() > 30_000) {
      throw new NotFoundException('Ubicación reciente no disponible');
    }
    return position;
  }

  async rate(actor: Actor, rideId: string, dto: RatingDto) {
    return this.rides.transaction(async (client) => {
      const ride = this.existing(await this.rides.lockedRide(client, rideId));
      if (
        ride.status !== 'completed' ||
        !ride.completed_at ||
        !ride.driver_uid
      ) {
        throw new ConflictException('El viaje debe estar terminado');
      }
      if (Date.now() - ride.completed_at.getTime() > 21 * 24 * 60 * 60 * 1000) {
        throw new ConflictException('El plazo para calificar terminó');
      }
      const isClient = ride.client_uid === actor.uid;
      const isDriver = ride.driver_uid === actor.uid && actor.role === 'driver';
      if (!isClient && !isDriver) throw new ForbiddenException();
      const role = isClient ? 'client_to_driver' : 'driver_to_client';
      const recipient = isClient ? ride.driver_uid : ride.client_uid;
      try {
        const result = await client.query(
          `INSERT INTO ratings (
             ride_id, from_uid, to_uid, role, service_type, score, comment, badges
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            rideId,
            actor.uid,
            recipient,
            role,
            ride.ride_type,
            dto.score,
            dto.comment ?? '',
            dto.badges ?? [],
          ],
        );
        await this.rides.event(client, rideId, actor.uid, 'rated', { role });
        return result.rows[0];
      } catch (error) {
        this.rethrowUnique(error, 'Ya calificaste este viaje');
      }
    });
  }

  async ratings(actor: Actor, rideId: string) {
    const ride = await this.requireRide(rideId);
    if (ride.client_uid !== actor.uid && ride.driver_uid !== actor.uid) {
      throw new ForbiddenException();
    }
    const result = await this.rides.transaction((client) =>
      client.query(
        'SELECT id, role, service_type, score, comment, badges, created_at FROM ratings WHERE ride_id=$1 ORDER BY created_at',
        [rideId],
      ),
    );
    return result.rows;
  }

  private async requireRide(id: string): Promise<RideRow> {
    return this.existing(await this.rides.ride(id));
  }

  private existing(ride: RideRow | null): RideRow {
    if (!ride) throw new NotFoundException('Viaje no encontrado');
    return ride;
  }

  private requireDriver(actor: Actor): void {
    if (actor.role !== 'driver') {
      throw new ForbiddenException('Cuenta de conductor no habilitada');
    }
  }

  private async ensureDriverFree(
    client: import('pg').PoolClient,
    driverUid: string,
  ) {
    const active = await client.query(
      `SELECT 1 FROM rides WHERE driver_uid=$1
       AND status IN ('accepted','arrived','ongoing','waiting_verification')
       LIMIT 1`,
      [driverUid],
    );
    if (active.rowCount)
      throw new ConflictException('El conductor tiene un viaje activo');
  }

  private hashPin(pin: string): string {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
  }

  private verifyPin(pin: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const calculated = scryptSync(pin, salt, 32);
    const expected = Buffer.from(hash, 'hex');
    return (
      calculated.length === expected.length &&
      timingSafeEqual(calculated, expected)
    );
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }

  private serializeOffer(offer: OfferRow) {
    return {
      id: offer.id,
      rideId: offer.ride_id,
      driverId: offer.driver_uid,
      price: Number(offer.price),
      priceVersion: offer.price_version,
      status:
        offer.status === 'pending' && offer.expires_at <= new Date()
          ? 'expired'
          : offer.status,
      timestamp: offer.created_at,
      expiresAt: offer.expires_at,
    };
  }

  private serialize(ride: RideRow, actor: Actor) {
    const canSeeContact =
      ride.client_uid === actor.uid || ride.driver_uid === actor.uid;
    const details = ride.delivery_details as Record<string, unknown> | null;
    return {
      id: ride.id,
      clientId: ride.client_uid,
      driverId: ride.driver_uid,
      rideType: ride.ride_type,
      status: ride.status,
      startLocation: { lat: ride.start_lat, lng: ride.start_lng },
      endLocation: { lat: ride.end_lat, lng: ride.end_lng },
      namedStartLocation: ride.start_name,
      namedEndLocation: ride.end_name,
      waypoints: ride.waypoints,
      comment: ride.comment,
      initialPrice: Number(ride.initial_price),
      finalPrice: ride.final_price === null ? null : Number(ride.final_price),
      priceVersion: ride.price_version,
      autoAcceptOffer: ride.auto_accept_offer,
      routeDistance: ride.route_distance_m,
      deliveryDetails: canSeeContact
        ? details
        : details
          ? {
              packageDescription: details.packageDescription,
            }
          : null,
      paymentStatus: ride.payment_status,
      paymentMethod: ride.payment_method,
      rideTimestamp: ride.created_at,
      updatedAt: ride.updated_at,
      acceptedAt: ride.accepted_at,
      completedAt: ride.completed_at,
      paidAt: ride.paid_at,
      canceledBy: ride.canceled_by,
    };
  }
}
