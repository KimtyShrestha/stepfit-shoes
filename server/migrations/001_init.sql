-- ============================================================
-- StepFit Shoes - initial database schema
-- ============================================================

-- ---------- Users ----------
CREATE TABLE IF NOT EXISTS users (
    id                    SERIAL PRIMARY KEY,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    full_name             VARCHAR(120) NOT NULL,
    role                  VARCHAR(20)  NOT NULL DEFAULT 'customer'
                          CHECK (role IN ('customer', 'admin')),

    -- Multi-factor authentication
    mfa_secret            TEXT,
    mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,

    -- Brute-force protection
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    lock_until            TIMESTAMPTZ,

    -- Session invalidation
    token_version         INTEGER NOT NULL DEFAULT 0,

    password_changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Password history (reuse prevention) ----------
CREATE TABLE IF NOT EXISTS password_history (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_history_user
    ON password_history(user_id, created_at DESC);

-- ---------- Products ----------
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    brand       VARCHAR(80)  NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    price_cents INTEGER      NOT NULL CHECK (price_cents >= 0),
    stock       INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
    image_url   TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- ---------- Cart ----------
CREATE TABLE IF NOT EXISTS cart_items (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_id)
);

-- ---------- Orders ----------
CREATE TABLE IF NOT EXISTS orders (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    total_cents      INTEGER NOT NULL CHECK (total_cents >= 0),
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    shipping_address TEXT NOT NULL,
    payment_ref      VARCHAR(64),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
    id               SERIAL PRIMARY KEY,
    order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name     VARCHAR(150) NOT NULL,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    quantity         INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ---------- Activity log ----------
CREATE TABLE IF NOT EXISTS activity_logs (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     VARCHAR(60) NOT NULL,
    status     VARCHAR(20) NOT NULL DEFAULT 'success'
               CHECK (status IN ('success', 'failure')),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action  ON activity_logs(action);