import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';

/** Marks a route as requiring an authenticated, active ADMIN account. */
export const AdminOnly = () =>
  applyDecorators(UseGuards(JwtAuthGuard, AdminGuard));
