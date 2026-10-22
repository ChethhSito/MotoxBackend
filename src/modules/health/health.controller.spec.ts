import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

describe('HealthController', () => {
  it('responde como activo aunque la base de datos no esté disponible', () => {
    const database = {
      version: async () => {
        throw new Error('sin conexión');
      },
    };
    const controller = new HealthController(database as DatabaseService);
    expect(controller.live()).toEqual({ status: 'ok', service: 'motox-api' });
  });

  it('marca la API como no preparada si PostgreSQL deja de responder', async () => {
    const database = {
      version: async () => {
        throw new Error('sin conexión');
      },
    };
    const controller = new HealthController(database as DatabaseService);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
