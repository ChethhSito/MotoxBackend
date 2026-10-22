import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export type UserRole = 'client' | 'driver' | 'admin';

export interface Actor {
  uid: string;
  role: UserRole;
  active: boolean;
  displayName: string;
}

export type AuthenticatedRequest = Request & { actor?: Actor };

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().actor!;
  },
);

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
