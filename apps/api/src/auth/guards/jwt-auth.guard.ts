import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { AccountStatus, type JwtPayload } from '@food-delivery/types';
import { schema } from '../../db/relations';
import { user } from '../../db/schema';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('DB') private readonly db: NeonDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    const authParts = request.headers.authorization?.trim().split(/\s+/) ?? [];
    const [scheme, token] = authParts;
    if (authParts.length !== 2 || scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Unauthorized no token provided');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      // Never rely on a role/status embedded in a long-lived JWT. An admin
      // suspension or role change must take effect on the very next request.
      const [dbUser] = await this.db
        .select({
          id: user.id,
          email: user.email,
          role: user.role,
          accountStatus: user.accountStatus,
        })
        .from(user)
        .where(eq(user.id, payload.sub));

      if (!dbUser) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      if (dbUser.accountStatus !== AccountStatus.ACTIVE) {
        throw new ForbiddenException('This account is not active');
      }

      request.user = {
        sub: dbUser.id,
        email: dbUser.email ?? payload.email,
        role: dbUser.role,
      };
      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
