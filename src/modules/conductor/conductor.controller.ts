import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentActor, Roles } from '../seguridad/actor.js';
import type { Actor } from '../seguridad/actor.js';
import { FirebaseAuthGuard } from '../seguridad/firebase-auth.guard.js';
import { RolesGuard } from '../seguridad/roles.guard.js';
import {
  AcceptListedDto,
  DriverPositionDto,
  NearbyQueryDto,
  OfferDto,
  PaymentDto,
  RatingDto,
} from '../viajes/dto/viajes.dto.js';
import { ViajesService } from '../viajes/viajes.service.js';

@Controller('v1/conductor')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('driver')
export class ConductorController {
  constructor(private readonly rides: ViajesService) {}

  @Get('solicitudes')
  pending(@CurrentActor() actor: Actor, @Query() query: NearbyQueryDto) {
    return this.rides.pendingNearby(
      actor,
      query.lat,
      query.lng,
      query.radiusKm,
    );
  }

  @Get('solicitudes/:id')
  pendingDetail(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rides.pendingDetail(actor, id);
  }

  @Post('solicitudes/:id/aceptar')
  acceptListed(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptListedDto,
  ) {
    return this.rides.acceptListed(actor, id, dto);
  }

  @Post('solicitudes/:id/ofertas')
  offer(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OfferDto,
  ) {
    return this.rides.offer(actor, id, dto);
  }

  @Post('solicitudes/:id/ofertas/:offerId/retirar')
  withdrawOffer(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.rides.withdrawOffer(actor, id, offerId);
  }

  @Get('viajes')
  history(
    @CurrentActor() actor: Actor,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.rides.history(actor, 'driver', limit);
  }

  @Get('viajes/:id')
  one(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.rides.one(actor, id);
  }

  @Post('viajes/:id/llegada')
  arrived(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rides.transition(actor, id, 'arrived');
  }

  @Post('viajes/:id/iniciar')
  start(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.rides.transition(actor, id, 'ongoing');
  }

  @Post('viajes/:id/finalizar')
  complete(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rides.transition(actor, id, 'completed');
  }

  @Post('viajes/:id/esperar-verificacion')
  deliveryArrived(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rides.transition(actor, id, 'waiting_verification');
  }

  @Post('viajes/:id/cancelar')
  cancel(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.rides.transition(actor, id, 'canceled');
  }

  @Post('viajes/:id/pago')
  confirmPayment(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentDto,
  ) {
    return this.rides.confirmPayment(actor, id, dto);
  }

  @Put('ubicacion')
  updatePosition(@CurrentActor() actor: Actor, @Body() dto: DriverPositionDto) {
    return this.rides.updatePosition(actor, dto);
  }

  @Post('viajes/:id/resenas')
  rate(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RatingDto,
  ) {
    return this.rides.rate(actor, id, dto);
  }

  @Get('viajes/:id/resenas')
  ratings(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rides.ratings(actor, id);
  }
}
