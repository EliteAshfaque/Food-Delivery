import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import WebSocket from 'ws';
import { schema } from './relations';

export const DB_POOL = 'DB_POOL';

/** Closes the WebSocket pool during a graceful Nest shutdown. */
@Injectable()
class DatabasePoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      useFactory: () => {
        // Transactions are required when an order, its line items, and an offer
        // reservation are created together. The HTTP Neon driver cannot provide
        // that guarantee; the WebSocket Pool driver can.
        neonConfig.webSocketConstructor = WebSocket;
        return new Pool({ connectionString: process.env.DATABASE_URL! });
      },
    },
    {
      provide: 'DB',
      useFactory: (pool: Pool) => {
        return drizzle({ client: pool, relations: schema });
      },
      inject: [DB_POOL],
    },
    DatabasePoolLifecycle,
  ],
  exports: ['DB'],
})
export class DbModule {}
