import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

export const eventCategory = pgEnum('event_category', [
  'music',
  'nightlife',
  'festival',
  'show',
  'comedy',
  'other'
]);
export const eventStatus = pgEnum('event_status', [
  'scheduled',
  'cancelled',
  'postponed'
]);

export const venues = pgTable('venues', {
  id: uuid().primaryKey(),
  name: text().notNull(),
  address: text().notNull()
  // The PostGIS point and its indexes are added by reviewed SQL migration 0001.
});

export const events = pgTable(
  'events',
  {
    id: uuid().primaryKey(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    title: text().notNull(),
    category: eventCategory().notNull(),
    status: eventStatus().notNull().default('scheduled'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    timezone: text().notNull(),
    sourceName: text('source_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    description: text(),
    organizerName: text('organizer_name'),
    accessInformation: text('access_information').notNull(),
    externalDestinationLabel: text('external_destination_label'),
    externalDestinationUrl: text('external_destination_url'),
    externalDestinationStatus: text('external_destination_status'),
    trustLabel: text('trust_label').notNull(),
    freshness: text().notNull(),
    locationConfidence: text('location_confidence').notNull(),
    priceKind: text('price_kind').notNull()
  },
  (table) => [index('events_starts_at_idx').on(table.startsAt)]
);
