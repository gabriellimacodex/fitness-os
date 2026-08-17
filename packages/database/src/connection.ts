import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export interface PostgresConnection {
  db: PostgresJsDatabase<typeof schema>;
  close(): Promise<void>;
}

export function createPostgresConnection(
  connectionString: string,
): PostgresConnection {
  const client = postgres(connectionString);

  return {
    db: drizzle(client, { schema }),
    close: async () => client.end({ timeout: 5 }),
  };
}
