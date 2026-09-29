import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const checkStatusEnum = pgEnum('check_status', [
  'up',
  'degraded',
  'down',
]);

export const endpoints = pgTable('endpoints', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull().unique(),
  latencyThresholdMs: integer('latency_threshold_ms').notNull().default(500),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const checks = pgTable(
  'checks',
  {
    id: serial('id').primaryKey(),
    endpointId: integer('endpoint_id')
      .notNull()
      .references(() => endpoints.id, { onDelete: 'cascade' }),
    checkedAt: timestamp('checked_at').notNull().defaultNow(),
    statusCode: integer('status_code'),
    latencyMs: integer('latency_ms'),
    success: boolean('success').notNull(),
    status: checkStatusEnum('status').notNull(),
    errorType: text('error_type'),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('checks_endpoint_id_checked_at_idx').on(
      table.endpointId,
      table.checkedAt.desc()
    ),
  ]
);

export const endpointsRelations = relations(endpoints, ({ many }) => ({
  checks: many(checks),
}));

export const checksRelations = relations(checks, ({ one }) => ({
  endpoint: one(endpoints, {
    fields: [checks.endpointId],
    references: [endpoints.id],
  }),
}));

export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;
export type Check = typeof checks.$inferSelect;
export type NewCheck = typeof checks.$inferInsert;
export type CheckStatus = (typeof checkStatusEnum.enumValues)[number];
