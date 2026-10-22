import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentActor, Roles } from '../seguridad/actor.js';
import type { Actor } from '../seguridad/actor.js';
import { FirebaseAuthGuard } from '../seguridad/firebase-auth.guard.js';
import { RolesGuard } from '../seguridad/roles.guard.js';
import { NegociosService } from './negocios.service.js';

@Controller('v1/seguridad/negocios')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class NegociosAdminController {
  constructor(private readonly businesses: NegociosService) {}

  @Post(':id/aprobar')
  approve(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.businesses.approve(actor, id);
  }
}
