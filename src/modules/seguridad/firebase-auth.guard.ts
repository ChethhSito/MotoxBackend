import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseTokenService } from './firebase-token.service.js';
import { SeguridadRepository } from './seguridad.repository.js';
import { AuthenticatedRequest } from './actor.js';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: FirebaseTokenService,
    private readonly users: SeguridadRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de Firebase requerido');
    }
    let decoded;
    try {
      decoded = await this.tokens.verify(header.slice(7));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException('Token no válido');
    }
    const actor = await this.users.findOrCreate(
      decoded.uid,
      decoded.email,
      decoded.name,
      decoded.phone_number,
    );
    if (!actor.active) throw new UnauthorizedException('Cuenta deshabilitada');
    request.actor = actor;
    return true;
  }
}
