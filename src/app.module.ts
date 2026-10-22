import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ConductorModule } from './modules/conductor/conductor.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PasajeroModule } from './modules/pasajero/pasajero.module.js';
import { SeguridadModule } from './modules/seguridad/seguridad.module.js';
import { TallerModule } from './modules/taller/taller.module.js';
import { TiendaModule } from './modules/tienda/tienda.module.js';

@Module({
  imports: [
    HealthModule,
    PasajeroModule,
    ConductorModule,
    TallerModule,
    TiendaModule,
    SeguridadModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
