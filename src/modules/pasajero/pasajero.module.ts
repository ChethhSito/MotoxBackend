import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { SeguridadModule } from '../seguridad/seguridad.module.js';
import { ViajesModule } from '../viajes/viajes.module.js';
import { PasajeroController } from './pasajero.controller.js';

@Module({
  imports: [DatabaseModule, SeguridadModule, ViajesModule],
  controllers: [PasajeroController],
})
export class PasajeroModule {}
