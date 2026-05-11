import type { Config } from 'drizzle-kit'

export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://hermes_os:dev@localhost:5432/hermes_os',
  },
  strict: true,
  verbose: true,
} satisfies Config
