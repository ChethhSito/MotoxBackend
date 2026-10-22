import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PointDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class WaypointDto extends PointDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class ContactDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class DeliveryDetailsDto {
  @ValidateNested()
  @Type(() => ContactDto)
  sender!: ContactDto;

  @ValidateNested()
  @Type(() => ContactDto)
  recipient!: ContactDto;

  @IsString()
  @MaxLength(300)
  packageDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  packagePhotoUrl?: string;
}

export class CreateRideDto {
  @IsIn(['taxi', 'delivery'])
  rideType!: 'taxi' | 'delivery';

  @ValidateNested()
  @Type(() => PointDto)
  startLocation!: PointDto;

  @ValidateNested()
  @Type(() => PointDto)
  endLocation!: PointDto;

  @IsString()
  @MaxLength(200)
  namedStartLocation!: string;

  @IsString()
  @MaxLength(200)
  namedEndLocation!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => WaypointDto)
  waypoints!: WaypointDto[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(999)
  initialPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  autoAcceptOffer?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  routeDistance?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDetailsDto)
  deliveryDetails?: DeliveryDetailsDto;

  @IsOptional()
  @Matches(/^\d{4,8}$/)
  deliveryPin?: string;
}

export class RaisePriceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(999)
  price!: number;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class OfferDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(999)
  price!: number;

  @IsInt()
  @Min(0)
  priceVersion!: number;
}

export class AcceptListedDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(999)
  expectedPrice!: number;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class ConfirmDeliveryDto {
  @Matches(/^\d{4,8}$/)
  pin!: string;
}

export class PaymentDto {
  @IsIn(['cash', 'yape'])
  method!: 'cash' | 'yape';
}

export class DriverPositionDto extends PointDto {}

export class NearbyQueryDto extends PointDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  radiusKm = 10;
}

export class RatingDto {
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  badges?: string[];
}
