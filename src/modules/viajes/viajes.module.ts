import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ViajesRepository } from './viajes.repository.js';
import { ViajesService } from './viajes.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ViajesRepository, ViajesService],
  exports: [ViajesService],
})
export class ViajesModule {}
