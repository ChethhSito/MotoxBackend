import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentActor, Roles } from '../seguridad/actor.js';
import type { Actor } from '../seguridad/actor.js';
import { FirebaseAuthGuard } from '../seguridad/firebase-auth.guard.js';
import { RolesGuard } from '../seguridad/roles.guard.js';
import {
  ConfirmDeliveryDto,
  CreateRideDto,
  RaisePriceDto,
  RatingDto,
} from '../viajes/dto/viajes.dto.js';
import { ViajesService } from '../viajes/viajes.service.js';

@Controller('v1/pasajero/viajes')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('client')
export class PasajeroController {
  constructor(private readonly rides: ViajesService) {}

  @Post()
  create(@CurrentActor() actor: Actor, @Body() dto: CreateRideDto) {
    return this.rides.create(actor, dto);
  }

  @Get()
  history(
    @CurrentActor() actor: Actor,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.rides.history(actor, 'client', limit);
  }

  @Get(':id')
  one(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.rides.one(actor, id);
  }

  @Patch(':id/tarifa')
  raisePrice(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RaisePriceDto,
  ) {
    return this.rides.raisePrice(actor, id, dto);
  }

  @Get(':id/ofertas')
  offers(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.rides.offers(actor, id);
  }

  @Post(':id/ofertas/:offerId/aceptar')
  acceptOffer(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.rides.acceptOffer(actor, id, offerId);
  }

  @Post(':id/ofertas/:offerId/rechazar')
  rejectOffer(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.rides.rejectOffer(actor, id, offerId);
  }

  @Post(':id/cancelar')
  cancel(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.rides.transition(actor, id, 'canceled');
  }

  @Post(':id/confirmar-entrega')
  confirmDelivery(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDeliveryDto,
  ) {
    return this.rides.confirmDelivery(actor, id, dto);
  }

  @Get(':id/conductor/ubicacion')
  driverPosition(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rides.driverPosition(actor, id);
  }

  @Post(':id/resenas')
  rate(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RatingDto,
  ) {
    return this.rides.rate(actor, id, dto);
  }

  @Get(':id/resenas')
  ratings(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rides.ratings(actor, id);
  }
}
