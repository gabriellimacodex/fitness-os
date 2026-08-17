export function requireDisposableDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  }

  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    databaseName !== 'fitness_os_prd02_test'
  ) {
    throw new Error(
      'PostgreSQL tests require the local fitness_os_prd02_test database.',
    );
  }

  return value;
}
