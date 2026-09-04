import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Persist the database connection pool on the NodeJS global object in development
// to prevent connection leaks during NestJS hot-reloads.
const globalForPrisma = global as unknown as {
  prismaPool?: Pool;
  prismaAdapter?: PrismaPg;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor() {
    const isLocal =
      process.env.DATABASE_URL?.includes('localhost') ||
      process.env.DATABASE_URL?.includes('127.0.0.1');

    let pool: Pool;
    let adapter: PrismaPg;

    if (process.env.NODE_ENV === 'production') {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 3,
        idleTimeoutMillis: 10000,
        keepAlive: true,
      });
      adapter = new PrismaPg(pool);
    } else {
      // In development, reuse the existing pool/adapter to prevent connection leaks
      if (!globalForPrisma.prismaPool) {
        globalForPrisma.prismaPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          max: 2, // Keep connection pool size very small (2) for Supabase Pooler compatibility
          idleTimeoutMillis: 10000, // Proactively close idle connections after 10s to stay clean
          connectionTimeoutMillis: 5000, // Timeout if DB is unreachable
          keepAlive: true, // Enable TCP keepalive to prevent Supabase Pooler from closing idle connections
        });

        // Suppress unhandled errors on idle database clients to prevent app crashes
        globalForPrisma.prismaPool.on('error', (err) => {
          console.warn('Unexpected error on idle pg client:', err.message);
        });
      }
      if (!globalForPrisma.prismaAdapter) {
        globalForPrisma.prismaAdapter = new PrismaPg(
          globalForPrisma.prismaPool,
        );
      }
      pool = globalForPrisma.prismaPool;
      adapter = globalForPrisma.prismaAdapter;
    }

    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    // Only close the pool in production, keep it active for hot-reload in development
    if (process.env.NODE_ENV === 'production') {
      await this.pool.end();
    }
  }
}
