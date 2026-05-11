import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from '../src/server/db'

await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migrations applied')
await pool.end()
