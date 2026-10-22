import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, UserRole } from './actor.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().actor;
    if (!actor || !roles.includes(actor.role)) {
      throw new ForbiddenException('Tu cuenta no tiene este permiso');
    }
    return true;
  }
}
