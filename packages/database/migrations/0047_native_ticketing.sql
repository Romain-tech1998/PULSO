-- DEC-0022 §2 and §3: ticket types, orders, tickets, and the door.
--
-- No Stripe column anywhere in this migration except the two nullable
-- references an order will need in phase 3. Everything here works with a
-- zero-priced ticket type and no payment processor at all, which is what
-- makes the ticketing system usable before live mode is ever considered
-- (DEC-0022 §8).

-- A ticket type belongs to an event and is what an attendee actually claims.
-- Separate from the event's `price_kind`, which is the directory's coarse
-- free/paid/unknown signal for filtering and says nothing about inventory.
CREATE TABLE IF NOT EXISTS event_ticket_types (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Integer minor units, CAD. DEC-0022 §1: no float ever represents money.
  -- Zero is a first-class value, not a special case - it is the whole of
  -- phase 2.
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  -- NULL means unlimited. A door with no cap is a real thing an organizer
  -- wants, and 2147483647 would be a lie dressed as a number.
  quantity integer CHECK (quantity IS NULL OR quantity > 0),
  -- Per account, so one person cannot claim the whole room.
  max_per_account integer NOT NULL DEFAULT 4 CHECK (max_per_account > 0),
  sales_open_at timestamptz,
  sales_close_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    sales_open_at IS NULL
    OR sales_close_at IS NULL
    OR sales_open_at < sales_close_at
  )
);

CREATE INDEX IF NOT EXISTS event_ticket_types_event_idx
  ON event_ticket_types (event_id, created_at);

-- One purchase attempt by one account. Exists even when nothing is paid, so
-- that phase 3 adds two column values rather than a table and a rewrite of
-- everything that reads a ticket.
CREATE TABLE IF NOT EXISTS ticket_orders (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  -- Phase 3 (DEC-0022 §1). Null for every free order, which is every order
  -- phase 2 can create.
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS ticket_orders_user_idx
  ON ticket_orders (user_id, created_at DESC);

-- One admittance. A ticket is a row, not a PDF and not a QR: the QR encodes
-- a signature over this row's id (DEC-0022 §3), and this row is the only
-- thing that decides whether someone gets in.
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES ticket_orders(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES event_ticket_types(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- The holder. DEC-0022's boundary list forbids transfer, so this never
  -- changes after issuance.
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('valid', 'used', 'refunded', 'cancelled')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  -- Which account scanned it, so a disputed admission has an author.
  used_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK ((status = 'used') = (used_at IS NOT NULL))
);

-- "My tickets", newest first.
CREATE INDEX IF NOT EXISTS tickets_user_idx ON tickets (user_id, issued_at DESC);

-- The two questions issuance asks: how many of this type exist, and how many
-- does this account already hold. Both are counted under a row lock on the
-- ticket type (see the repository), so the index is for speed, not safety.
CREATE INDEX IF NOT EXISTS tickets_type_idx ON tickets (ticket_type_id);
CREATE INDEX IF NOT EXISTS tickets_type_user_idx
  ON tickets (ticket_type_id, user_id);

-- The organizer's door list.
CREATE INDEX IF NOT EXISTS tickets_event_idx ON tickets (event_id, status);

COMMENT ON TABLE tickets IS
  'DEC-0022 §2. One admittance. Never transferable (DEC-0022 §7), so user_id is fixed at issuance.';
