-- DEC-0022 §1: Stripe Connect Express, direct charges, test mode only.
--
-- The organizer is the merchant of record. Nothing here holds a balance, a
-- payout schedule or a card: Pulso stores the connected account's id and the
-- two booleans Stripe reports about it, and asks Stripe for everything else.
-- A second copy of an account's state is a second thing to be wrong.

CREATE TABLE IF NOT EXISTS stripe_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- acct_… on the platform. Unique because one Stripe account belongs to one
  -- Pulso organizer; two rows pointing at the same one would let either
  -- collect for the other.
  stripe_account_id text NOT NULL UNIQUE,
  -- Mirrors of Stripe's own flags, refreshed whenever we ask. Never inferred:
  -- an organizer who completed onboarding still has charges_enabled false
  -- until Stripe says otherwise, and guessing publishes an event whose
  -- checkout would fail.
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  -- What Stripe still wants, verbatim, so the console can tell an organizer
  -- why they are not enabled yet instead of "pending".
  requirements jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_accounts_enabled_idx
  ON stripe_accounts (user_id)
  WHERE charges_enabled;

COMMENT ON TABLE stripe_accounts IS
  'DEC-0022 §1. One Stripe Connect Express account per organizer. The organizer is the merchant of record; Pulso takes an application fee on direct charges.';

-- Idempotency for the webhook.
--
-- Stripe redelivers. It redelivers on its own retry schedule, it redelivers
-- when our response is slow, and a replayed delivery is indistinguishable
-- from a first one apart from this id. Recording it *before* the work, inside
-- the same transaction as the work, is what makes "a duplicated webhook
-- issues no extra ticket" (DEC-0022 acceptance criterion 2) true rather than
-- likely.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Orders gain what a paid one needs. The two stripe_* columns already exist
-- from migration 0047, which anticipated this.
ALTER TABLE ticket_orders
  -- Which connected account the charge was made on. Kept on the order rather
  -- than looked up through the event's organizer, because an organizer may
  -- reconnect a different Stripe account later and an old order must still
  -- name the account that actually took the money.
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  -- Pulso's cut, in minor units, as sent to Stripe. Stored so a fee that
  -- changes later does not silently rewrite what past orders were charged.
  ADD COLUMN IF NOT EXISTS application_fee_cents integer
    CHECK (application_fee_cents IS NULL OR application_fee_cents >= 0),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  -- The ticket type a pending order is holding seats for, so an abandoned
  -- checkout can be cleaned up and its seats released.
  ADD COLUMN IF NOT EXISTS ticket_type_id uuid
    REFERENCES event_ticket_types(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quantity integer
    CHECK (quantity IS NULL OR quantity > 0),
  -- A pending order holds its seats only for a while. Without this a single
  -- abandoned checkout would hold a seat out of sale forever.
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- The two hot reads: "does this session belong to an order" on webhook, and
-- "what is still holding seats for this type" on issuance.
CREATE INDEX IF NOT EXISTS ticket_orders_pending_idx
  ON ticket_orders (ticket_type_id, expires_at)
  WHERE status = 'pending';
