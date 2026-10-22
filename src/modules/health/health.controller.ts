import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'motox-api' };
  }

  @Get('ready')
  async ready() {
    try {
      const version = await this.database.version();
      if (version.major !== 18) throw new Error('Versión no compatible');
      const schemaVersion = await this.database.schemaVersion();
      if (schemaVersion !== '003_user_role_events.sql') {
        throw new Error('Esquema pendiente');
      }
      return {
        status: 'ok',
        checks: {
          database: { status: 'up', engine: 'postgresql', majorVersion: 18 },
        },
        schemaVersion,
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: { status: 'down' } },
      });
    }
  }

  @Get()
  async health() {
    const ready = await this.ready();
    return {
      status: ready.status,
      database: ready.checks.database.engine,
      majorVersion: ready.checks.database.majorVersion,
    };
  }
}
