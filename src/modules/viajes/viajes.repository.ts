import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type RideStatus =
  | 'pending'
  | 'accepted'
  | 'arrived'
  | 'ongoing'
  | 'waiting_verification'
  | 'completed'
  | 'canceled';

export interface RideRow extends QueryResultRow {
  id: string;
  client_uid: string;
  driver_uid: string | null;
  ride_type: 'taxi' | 'delivery';
  status: RideStatus;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  start_name: string;
  end_name: string;
  waypoints: unknown[];
  comment: string;
  initial_price: string;
  final_price: string | null;
  price_version: number;
  auto_accept_offer: boolean;
  route_distance_m: number | null;
  delivery_details: unknown;
  delivery_pin_hash: string | null;
  payment_status: 'unpaid' | 'paid';
  payment_method: string | null;
  created_at: Date;
  updated_at: Date;
  accepted_at: Date | null;
  completed_at: Date | null;
  paid_at: Date | null;
  canceled_by: string | null;
}

export interface OfferRow extends QueryResultRow {
  id: string;
  ride_id: string;
  driver_uid: string;
  price: string;
  price_version: number;
  status: string;
  created_at: Date;
  expires_at: Date;
}

@Injectable()
export class ViajesRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }

  async lockedRide(client: PoolClient, id: string): Promise<RideRow | null> {
    const result = await client.query<RideRow>(
      'SELECT * FROM rides WHERE id = $1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  }

  async ride(id: string): Promise<RideRow | null> {
    const result = await this.database.query<RideRow>(
      'SELECT * FROM rides WHERE id = $1',
      [id],
    );
    return result.rows[0] ?? null;
  }

  async lockedOffer(client: PoolClient, id: string): Promise<OfferRow | null> {
    const result = await client.query<OfferRow>(
      'SELECT * FROM offers WHERE id = $1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  }

  async offers(rideId: string): Promise<OfferRow[]> {
    const result = await this.database.query<OfferRow>(
      `SELECT * FROM offers WHERE ride_id = $1 ORDER BY created_at DESC`,
      [rideId],
    );
    return result.rows;
  }

  async history(uid: string, side: 'client' | 'driver', limit: number) {
    const column = side === 'client' ? 'client_uid' : 'driver_uid';
    const result = await this.database.query<RideRow>(
      `SELECT * FROM rides WHERE ${column} = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [uid, limit],
    );
    return result.rows;
  }

  async pendingNearby(latitude: number, longitude: number, radiusKm: number) {
    const result = await this.database.query<RideRow & { distance_km: number }>(
      `SELECT r.*,
        6371 * acos(least(1, greatest(-1,
          sin(radians($1)) * sin(radians(start_lat)) +
          cos(radians($1)) * cos(radians(start_lat)) *
          cos(radians(start_lng) - radians($2))
        ))) AS distance_km
       FROM rides r WHERE r.status = 'pending'
       AND start_lat BETWEEN $1 - ($3 / 111.2) AND $1 + ($3 / 111.2)
       AND start_lng BETWEEN $2 - ($3 / 111.2 / greatest(0.1, cos(radians($1))))
                         AND $2 + ($3 / 111.2 / greatest(0.1, cos(radians($1))))
       ORDER BY distance_km, r.created_at DESC LIMIT 100`,
      [latitude, longitude, radiusKm],
    );
    return result.rows.filter((ride) => ride.distance_km <= radiusKm);
  }

  async position(driverUid: string) {
    const result = await this.database.query<{
      latitude: number;
      longitude: number;
      updated_at: Date;
    }>(
      'SELECT latitude, longitude, updated_at FROM driver_positions WHERE driver_uid = $1',
      [driverUid],
    );
    return result.rows[0] ?? null;
  }

  async event(
    client: PoolClient,
    rideId: string,
    actorUid: string,
    eventType: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await client.query(
      'INSERT INTO ride_events (ride_id, actor_uid, event_type, payload) VALUES ($1, $2, $3, $4)',
      [rideId, actorUid, eventType, JSON.stringify(payload)],
    );
  }
}
