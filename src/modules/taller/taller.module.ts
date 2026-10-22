import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { NegociosModule } from '../negocios/negocios.module.js';
import { SeguridadModule } from '../seguridad/seguridad.module.js';
import { TallerController } from './taller.controller.js';

@Module({
  imports: [DatabaseModule, NegociosModule, SeguridadModule],
  controllers: [TallerController],
})
export class TallerModule {}
