import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/infrastructure/database/database.service.js';
import { FirebaseAuthGuard } from '../src/modules/seguridad/firebase-auth.guard.js';
import type {
  Actor,
  AuthenticatedRequest,
} from '../src/modules/seguridad/actor.js';

describe('Flujos de MotoX (e2e)', () => {
  let app: INestApplication<App>;
  let database: DatabaseService;
  const suffix = randomUUID();
  const actors: Record<string, Actor> = {
    client: {
      uid: `test-client-${suffix}`,
      role: 'client',
      active: true,
      displayName: 'Pasajero de prueba',
    },
    driver: {
      uid: `test-driver-${suffix}`,
      role: 'driver',
      active: true,
      displayName: 'Conductor de prueba',
    },
    other: {
      uid: `test-other-${suffix}`,
      role: 'driver',
      active: true,
      displayName: 'Otro conductor',
    },
    admin: {
      uid: `test-admin-${suffix}`,
      role: 'admin',
      active: true,
      displayName: 'Administrador',
    },
    candidate: {
      uid: `test-candidate-${suffix}`,
      role: 'client',
      active: true,
      displayName: 'Candidato a conductor',
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => AuthenticatedRequest };
        }) => {
          const req = context.switchToHttp().getRequest();
          const key = req.headers['x-test-actor'];
          const actor = typeof key === 'string' ? actors[key] : undefined;
          if (!actor) return false;
          req.actor = actor;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    database = app.get(DatabaseService);
    for (const actor of Object.values(actors)) {
      await database.query(
        'INSERT INTO users (uid, display_name, role) VALUES ($1,$2,$3)',
        [actor.uid, actor.displayName, actor.role],
      );
    }
  });

  afterAll(async () => {
    const uids = Object.values(actors).map((actor) => actor.uid);
    await database.query(
      'DELETE FROM user_role_events WHERE target_uid = ANY($1::text[])',
      [uids],
    );
    await database.query(
      'DELETE FROM businesses WHERE owner_uid = ANY($1::text[])',
      [uids],
    );
    await database.query(
      'DELETE FROM ratings WHERE from_uid = ANY($1::text[])',
      [uids],
    );
    await database.query(
      'DELETE FROM ride_events WHERE ride_id IN (SELECT id FROM rides WHERE client_uid = $1)',
      [actors.client.uid],
    );
    await database.query(
      'DELETE FROM offers WHERE ride_id IN (SELECT id FROM rides WHERE client_uid = $1)',
      [actors.client.uid],
    );
    await database.query('DELETE FROM rides WHERE client_uid = $1', [
      actors.client.uid,
    ]);
    await database.query(
      'DELETE FROM driver_positions WHERE driver_uid = ANY($1::text[])',
      [uids],
    );
    await database.query('DELETE FROM users WHERE uid = ANY($1::text[])', [
      uids,
    ]);
    await app.close();
  });

  const rideBody = {
    rideType: 'taxi',
    startLocation: { lat: -12.0464, lng: -77.0428 },
    endLocation: { lat: -12.053, lng: -77.035 },
    namedStartLocation: 'Inicio',
    namedEndLocation: 'Destino',
    waypoints: [],
    initialPrice: 12,
    comment: 'Casco disponible',
  };

  it('crea, actualiza tarifa, acepta oferta, completa, cobra y califica', async () => {
    await request(app.getHttpServer())
      .post('/v1/pasajero/viajes')
      .set('x-test-actor', 'client')
      .send({ ...rideBody, startLocation: { lat: 999, lng: 0 } })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/v1/pasajero/viajes')
      .set('x-test-actor', 'client')
      .send(rideBody)
      .expect(201);
    const rideId: string = created.body.id;
    expect(created.body.status).toBe('pending');

    const nearby = await request(app.getHttpServer())
      .get('/v1/conductor/solicitudes?lat=-12.0464&lng=-77.0428&radiusKm=10')
      .set('x-test-actor', 'driver')
      .expect(200);
    expect(nearby.body.some((ride: { id: string }) => ride.id === rideId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .post(`/v1/conductor/solicitudes/${rideId}/ofertas`)
      .set('x-test-actor', 'client')
      .send({ price: 14, priceVersion: 0 })
      .expect(403);
    const firstOffer = await request(app.getHttpServer())
      .post(`/v1/conductor/solicitudes/${rideId}/ofertas`)
      .set('x-test-actor', 'driver')
      .send({ price: 14, priceVersion: 0 })
      .expect(201);

    const raised = await request(app.getHttpServer())
      .patch(`/v1/pasajero/viajes/${rideId}/tarifa`)
      .set('x-test-actor', 'client')
      .send({ price: 15, expectedVersion: 0 })
      .expect(200);
    expect(raised.body.priceVersion).toBe(1);
    await request(app.getHttpServer())
      .post(
        `/v1/pasajero/viajes/${rideId}/ofertas/${firstOffer.body.id}/aceptar`,
      )
      .set('x-test-actor', 'client')
      .expect(409);

    const offer = await request(app.getHttpServer())
      .post(`/v1/conductor/solicitudes/${rideId}/ofertas`)
      .set('x-test-actor', 'driver')
      .send({ price: 16, priceVersion: 1 })
      .expect(201);
    const accepted = await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/ofertas/${offer.body.id}/aceptar`)
      .set('x-test-actor', 'client')
      .expect(201);
    expect(accepted.body.driverId).toBe(actors.driver.uid);
    expect(accepted.body.finalPrice).toBe(16);

    await request(app.getHttpServer())
      .post(`/v1/conductor/solicitudes/${rideId}/aceptar`)
      .set('x-test-actor', 'other')
      .send({ expectedPrice: 15, expectedVersion: 1 })
      .expect(409);

    await request(app.getHttpServer())
      .put('/v1/conductor/ubicacion')
      .set('x-test-actor', 'driver')
      .send({ lat: -12.046, lng: -77.042 })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/v1/pasajero/viajes/${rideId}/conductor/ubicacion`)
      .set('x-test-actor', 'client')
      .expect(200);

    for (const [path, expected] of [
      ['llegada', 'arrived'],
      ['iniciar', 'ongoing'],
      ['finalizar', 'completed'],
    ]) {
      const response = await request(app.getHttpServer())
        .post(`/v1/conductor/viajes/${rideId}/${path}`)
        .set('x-test-actor', 'driver')
        .expect(201);
      expect(response.body.status).toBe(expected);
    }
    const payment = await request(app.getHttpServer())
      .post(`/v1/conductor/viajes/${rideId}/pago`)
      .set('x-test-actor', 'driver')
      .send({ method: 'yape' })
      .expect(201);
    expect(payment.body.paymentStatus).toBe('paid');

    await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/resenas`)
      .set('x-test-actor', 'client')
      .send({ score: 5, comment: 'Buen viaje', badges: [] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/resenas`)
      .set('x-test-actor', 'client')
      .send({ score: 5, comment: 'Duplicada', badges: [] })
      .expect(409);
    const profile = await request(app.getHttpServer())
      .get('/v1/seguridad/me')
      .set('x-test-actor', 'driver')
      .expect(200);
    expect(profile.body.ratings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'client_to_driver',
          average: 5,
          count: 1,
        }),
      ]),
    );
    const reviews = await request(app.getHttpServer())
      .get(`/v1/seguridad/usuarios/${actors.driver.uid}/resenas`)
      .set('x-test-actor', 'client')
      .expect(200);
    expect(reviews.body[0]).toEqual(
      expect.objectContaining({ comment: 'Buen viaje', score: 5 }),
    );
  });

  it('exige PIN para delivery y aprobación antes de publicar una tienda', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/pasajero/viajes')
      .set('x-test-actor', 'client')
      .send({
        ...rideBody,
        rideType: 'delivery',
        deliveryPin: '123456',
        deliveryDetails: {
          sender: { name: 'A', phone: '999111222', reference: '' },
          recipient: { name: 'B', phone: '999333444', reference: '' },
          packageDescription: 'Sobre',
        },
      })
      .expect(201);
    const rideId: string = created.body.id;
    await request(app.getHttpServer())
      .post(`/v1/conductor/solicitudes/${rideId}/aceptar`)
      .set('x-test-actor', 'driver')
      .send({ expectedPrice: 12, expectedVersion: 0 })
      .expect(201);
    for (const path of ['llegada', 'iniciar', 'esperar-verificacion']) {
      await request(app.getHttpServer())
        .post(`/v1/conductor/viajes/${rideId}/${path}`)
        .set('x-test-actor', 'driver')
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/confirmar-entrega`)
      .set('x-test-actor', 'client')
      .send({ pin: '000000' })
      .expect(400);
    const delivered = await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/confirmar-entrega`)
      .set('x-test-actor', 'client')
      .send({ pin: '123456' })
      .expect(201);
    expect(delivered.body.status).toBe('completed');

    const business = await request(app.getHttpServer())
      .post('/v1/tienda')
      .set('x-test-actor', 'client')
      .send({
        name: 'Tienda de prueba',
        phone: '999000111',
        latitude: -12.04,
        longitude: -77.04,
        hours: '9 a 18',
        services: ['repuestos'],
      })
      .expect(201);
    expect(business.body.status).toBe('pending');
    const before = await request(app.getHttpServer())
      .get('/v1/tienda?lat=-12.04&lng=-77.04')
      .expect(200);
    expect(
      before.body.some((item: { id: string }) => item.id === business.body.id),
    ).toBe(false);
    await request(app.getHttpServer())
      .post(`/v1/seguridad/negocios/${business.body.id}/aprobar`)
      .set('x-test-actor', 'admin')
      .expect(201);
    const after = await request(app.getHttpServer())
      .get('/v1/tienda?lat=-12.04&lng=-77.04')
      .expect(200);
    expect(
      after.body.some((item: { id: string }) => item.id === business.body.id),
    ).toBe(true);
  });

  it('acepta automáticamente una oferta igual a la tarifa y permite habilitar conductores', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/pasajero/viajes')
      .set('x-test-actor', 'client')
      .send({ ...rideBody, autoAcceptOffer: true })
      .expect(201);
    const rideId: string = created.body.id;
    const offer = await request(app.getHttpServer())
      .post(`/v1/conductor/solicitudes/${rideId}/ofertas`)
      .set('x-test-actor', 'other')
      .send({ price: 12, priceVersion: 0 })
      .expect(201);
    expect(offer.body.status).toBe('accepted');
    const ride = await request(app.getHttpServer())
      .get(`/v1/pasajero/viajes/${rideId}`)
      .set('x-test-actor', 'client')
      .expect(200);
    expect(ride.body.status).toBe('accepted');
    expect(ride.body.driverId).toBe(actors.other.uid);

    await request(app.getHttpServer())
      .patch(`/v1/seguridad/usuarios/${actors.candidate.uid}/rol`)
      .set('x-test-actor', 'client')
      .send({ role: 'driver' })
      .expect(403);
    const enabled = await request(app.getHttpServer())
      .patch(`/v1/seguridad/usuarios/${actors.candidate.uid}/rol`)
      .set('x-test-actor', 'admin')
      .send({ role: 'driver' })
      .expect(200);
    expect(enabled.body.role).toBe('driver');

    await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/cancelar`)
      .set('x-test-actor', 'client')
      .expect(201);
  });

  it('muestra una oferta vencida y evita aceptarla', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/pasajero/viajes')
      .set('x-test-actor', 'client')
      .send(rideBody)
      .expect(201);
    const rideId: string = created.body.id;
    const offered = await request(app.getHttpServer())
      .post(`/v1/conductor/solicitudes/${rideId}/ofertas`)
      .set('x-test-actor', 'driver')
      .send({ price: 14, priceVersion: 0 })
      .expect(201);
    await database.query(
      "UPDATE offers SET expires_at=now()-interval '1 second' WHERE id=$1",
      [offered.body.id],
    );
    const offers = await request(app.getHttpServer())
      .get(`/v1/pasajero/viajes/${rideId}/ofertas`)
      .set('x-test-actor', 'client')
      .expect(200);
    expect(offers.body[0].status).toBe('expired');
    await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/ofertas/${offered.body.id}/aceptar`)
      .set('x-test-actor', 'client')
      .expect(409);
    await request(app.getHttpServer())
      .post(`/v1/pasajero/viajes/${rideId}/cancelar`)
      .set('x-test-actor', 'client')
      .expect(201);
  });
});
