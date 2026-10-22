CREATE TABLE sales (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_name      text        NOT NULL,
  product_image_url text        NOT NULL,
  price_cents       integer     NOT NULL CHECK (price_cents >= 0),
  total_stock       integer     NOT NULL CHECK (total_stock > 0),
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- Only settled purchases are stored here; PENDING lives in Redis until the worker
-- writes the row. The unique constraint is the last line of defence for the
-- one-purchase-per-user rule and is what makes worker retries idempotent.
CREATE TABLE purchases (
  id         uuid        PRIMARY KEY,
  sale_id    integer     NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  user_id    text        NOT NULL,
  status     text        NOT NULL CHECK (status IN ('CONFIRMED', 'FAILED')),
  created_at timestamptz NOT NULL,
  UNIQUE (sale_id, user_id)
);
