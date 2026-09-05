import { ForbiddenException } from '@nestjs/common';
import { UserRole, type JwtPayload } from '@food-delivery/types';
import type { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function contextFor(user?: JwtPayload): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows only an ADMIN role resolved by JwtAuthGuard', () => {
    expect(
      guard.canActivate(
        contextFor({
          sub: '00000000-0000-4000-8000-000000000001',
          email: 'admin@example.com',
          role: UserRole.ADMIN,
        }),
      ),
    ).toBe(true);
  });

  it('rejects unauthenticated and non-admin callers', () => {
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        contextFor({
          sub: '00000000-0000-4000-8000-000000000002',
          email: 'customer@example.com',
          role: UserRole.CUSTOMER,
        }),
      ),
    ).toThrow('Administrator access is required');
  });
});
