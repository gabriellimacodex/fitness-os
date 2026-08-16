# `@fitness-os/database`

This package owns the Fitness OS PostgreSQL schema boundary and Drizzle Kit
configuration.

Epic 00 intentionally provides no database client, connection pool, product
tables, or migrations. Add tables to `src/schema.ts` only when a product epic
defines their domain contracts. Runtime applications should own connection
lifecycle decisions when persistence is introduced.

## Drizzle Kit

`DATABASE_URL` is read only when Drizzle Kit loads `drizzle.config.ts`; importing
`@fitness-os/database` does not read environment variables or open a connection.

From this package, a future schema change can be generated with:

```sh
DATABASE_URL=postgresql://... pnpm db:generate
```

Do not commit a real database URL.
