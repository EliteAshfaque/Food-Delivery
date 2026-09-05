import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { AccountStatus, UserRole } from '@food-delivery/types';
import { schema } from '../db/relations';
import { user } from '../db/schema';

/**
 * Securely bootstraps the first administrator from deployment configuration.
 * Set ADMIN_BOOTSTRAP_EMAIL to an already-registered email, restart once, and
 * remove the variable. There is intentionally no public HTTP endpoint for it.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof schema>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const bootstrapEmail = this.configService
      .get<string>('ADMIN_BOOTSTRAP_EMAIL')
      ?.trim()
      .toLowerCase();

    if (!bootstrapEmail) return;

    const [target] = await this.db
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user)
      // Do not use ILIKE here: a % or _ in deployment config would be a
      // wildcard and could promote an unintended account.
      .where(sql`lower(${user.email}) = ${bootstrapEmail}`);

    if (!target) {
      this.logger.warn(
        'ADMIN_BOOTSTRAP_EMAIL did not match an existing account; no administrator was changed.',
      );
      return;
    }

    // Bootstrap must not silently dismantle an operating driver or restaurant
    // owner account. Create a dedicated customer/support account first, then
    // promote it with the deployment-only bootstrap setting.
    if (target.role !== UserRole.CUSTOMER && target.role !== UserRole.ADMIN) {
      this.logger.warn(
        'ADMIN_BOOTSTRAP_EMAIL matched an operational account; no administrator was changed. Use a dedicated customer account instead.',
      );
      return;
    }

    await this.db
      .update(user)
      .set({
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        accountStatusReason: 'Initial administrator bootstrap',
        accountStatusUpdatedAt: new Date(),
        isOnline: false,
        updatedAt: new Date(),
      })
      .where(sql`lower(${user.email}) = ${bootstrapEmail}`);

    this.logger.warn(
      'An administrator was bootstrapped from ADMIN_BOOTSTRAP_EMAIL. Remove this variable after the initial setup.',
    );
  }
}
