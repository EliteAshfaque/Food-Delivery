import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole, type JwtPayload } from '@food-delivery/types';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    if (user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access is required');
    }

    return true;
  }
}
