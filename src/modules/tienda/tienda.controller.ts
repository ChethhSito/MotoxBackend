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

@Controller('v1/tienda')
export class TiendaController {
  constructor(private readonly businesses: NegociosService) {}

  @Get()
  nearby(@Query() query: BuscarNegociosDto) {
    return this.businesses.nearby('store', query);
  }

  @Get('mias')
  @UseGuards(FirebaseAuthGuard)
  mine(@CurrentActor() actor: Actor) {
    return this.businesses.mine(actor, 'store');
  }

  @Post()
  @UseGuards(FirebaseAuthGuard)
  create(@CurrentActor() actor: Actor, @Body() dto: NegocioDto) {
    return this.businesses.create(actor, 'store', dto);
  }

  @Put(':id')
  @UseGuards(FirebaseAuthGuard)
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NegocioDto,
  ) {
    return this.businesses.update(actor, 'store', id, dto);
  }
}
