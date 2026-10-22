import { IsIn } from 'class-validator';

export class SetRoleDto {
  @IsIn(['client', 'driver'])
  role!: 'client' | 'driver';
}
