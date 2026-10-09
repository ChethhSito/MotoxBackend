import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Controller()
export class AppController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  info() {
    return { service: 'motox-api', status: 'running' };
  }

  @Get('health')
  async health() {
    const version = await this.database.version();
    return {
      status: 'ok',
      database: 'postgresql',
      majorVersion: version.major,
    };
  }
}
