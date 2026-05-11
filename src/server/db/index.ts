import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set')
}

const isSslDisabled = process.env.DATABASE_URL.includes('sslmode=disable')

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: isSslDisabled ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
})

export const db = drizzle(pool, { schema, logger: process.env.DB_LOG === '1' })
export { schema }
