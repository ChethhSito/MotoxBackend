import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentActor, Roles } from './actor.js';
import type { Actor } from './actor.js';
import { FirebaseAuthGuard } from './firebase-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { SeguridadRepository } from './seguridad.repository.js';
import { SetRoleDto } from './dto/set-role.dto.js';

@Controller('v1/seguridad')
@UseGuards(FirebaseAuthGuard)
export class SeguridadController {
  constructor(private readonly users: SeguridadRepository) {}

  @Get('me')
  me(@CurrentActor() actor: Actor) {
    return this.users.profile(actor.uid);
  }

  @Get('usuarios/:uid/resenas')
  reviews(
    @Param('uid') uid: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.users.reviews(uid, limit);
  }

  @Patch('usuarios/:uid/rol')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setRole(
    @CurrentActor() actor: Actor,
    @Param('uid') uid: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.users.setRole(actor.uid, uid, dto.role);
  }
}
