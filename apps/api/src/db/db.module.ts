import { Module, Global } from '@nestjs/common';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { schema } from './relations';

@Global()
@Module({
  providers: [
    {
      provide: 'DB',
      useFactory: () => {
        const sql = neon(process.env.DATABASE_URL!);
        return drizzle({ client: sql, relations: schema });
      },
    },
  ],
  exports: ['DB'],
})
export class DbModule {}
