import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { FirebaseAuthGuard } from './firebase-auth.guard.js';
import { FirebaseTokenService } from './firebase-token.service.js';
import { RolesGuard } from './roles.guard.js';
import { SeguridadController } from './seguridad.controller.js';
import { SeguridadRepository } from './seguridad.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [SeguridadController],
  providers: [
    FirebaseTokenService,
    SeguridadRepository,
    FirebaseAuthGuard,
    RolesGuard,
  ],
  exports: [
    FirebaseAuthGuard,
    FirebaseTokenService,
    RolesGuard,
    SeguridadRepository,
  ],
})
export class SeguridadModule {}
