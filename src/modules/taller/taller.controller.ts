import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentActor } from '../seguridad/actor.js';
import type { Actor } from '../seguridad/actor.js';
import { FirebaseAuthGuard } from '../seguridad/firebase-auth.guard.js';
import { BuscarNegociosDto, NegocioDto } from '../negocios/dto/negocio.dto.js';
import { NegociosService } from '../negocios/negocios.service.js';

@Controller('v1/taller')
export class TallerController {
  constructor(private readonly businesses: NegociosService) {}

  @Get()
  nearby(@Query() query: BuscarNegociosDto) {
    return this.businesses.nearby('workshop', query);
  }

  @Get('mios')
  @UseGuards(FirebaseAuthGuard)
  mine(@CurrentActor() actor: Actor) {
    return this.businesses.mine(actor, 'workshop');
  }

  @Post()
  @UseGuards(FirebaseAuthGuard)
  create(@CurrentActor() actor: Actor, @Body() dto: NegocioDto) {
    return this.businesses.create(actor, 'workshop', dto);
  }

  @Put(':id')
  @UseGuards(FirebaseAuthGuard)
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NegocioDto,
  ) {
    return this.businesses.update(actor, 'workshop', id, dto);
  }
}
