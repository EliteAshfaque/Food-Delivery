import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthCheckResponse } from '@food-delivery/types';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { schema } from './db/relations';
import { user } from './db/schema';

@Controller()
export class AppController {
  constructor(
    @Inject('DB') private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  @Get('db-test')
  async dbTest() {
    const result = await this.db.select().from(user);
    return { users: result, count: result.length };
  }

  @Get('health') //api/health
  health(): HealthCheckResponse {
    return {
      status: 'ok',
      timestamp: new Date(),
    };
  }
}
