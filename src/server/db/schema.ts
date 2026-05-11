import {
  pgTable, text, boolean, timestamp, integer, jsonb, bigserial, index, uniqueIndex
} from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user').$type<'admin' | 'user'>(),
  hermesContainerName: text('hermes_container_name').unique(),
  hermesApiPort: integer('hermes_api_port').unique(),
  hermesDashboardPort: integer('hermes_dashboard_port').unique(),
  vaultRepo: text('vault_repo'),
  status: text('status').notNull().default('pending')
    .$type<'pending' | 'provisioning' | 'active' | 'suspended' | 'archived'>(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expiresAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('session_user_idx').on(t.userId),
}))

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const twoFactor = pgTable('twoFactor', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backupCodes').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  encrypted: boolean('encrypted').notNull().default(false),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  target: text('target'),
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userTime: index('audit_user_time').on(t.userId, t.createdAt),
  actionTime: index('audit_action_time').on(t.action, t.createdAt),
}))
