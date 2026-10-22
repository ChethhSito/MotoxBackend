import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { SeguridadModule } from '../seguridad/seguridad.module.js';
import { NegociosAdminController } from './negocios-admin.controller.js';
import { NegociosRepository } from './negocios.repository.js';
import { NegociosService } from './negocios.service.js';

@Module({
  imports: [DatabaseModule, SeguridadModule],
  controllers: [NegociosAdminController],
  providers: [NegociosRepository, NegociosService],
  exports: [NegociosService],
})
export class NegociosModule {}
