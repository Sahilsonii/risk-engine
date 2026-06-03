-- ============================================================
-- NewEra AI — Risk Engine Database Initialization
-- ============================================================

-- Roles
CREATE ROLE app_user  NOLOGIN;
CREATE ROLE app_admin NOLOGIN;

-- Status enum
CREATE TYPE transaction_status AS ENUM
  ('PENDING', 'APPROVED', 'FLAGGED', 'REJECTED');

-- Core table
CREATE TABLE transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     VARCHAR(50) NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL,
  status        transaction_status DEFAULT 'PENDING',
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  customer_name VARCHAR(100),
  location      VARCHAR(150),
  merchant_name VARCHAR(100)
);

-- Indexes for performance
CREATE INDEX idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX idx_transactions_status    ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Admin: unrestricted
CREATE POLICY admin_all ON transactions
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- Tenant user: session-variable scoped
CREATE POLICY user_tenant ON transactions FOR ALL TO app_user
  USING     (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Grants
GRANT SELECT, INSERT, UPDATE ON transactions TO app_user;
GRANT ALL PRIVILEGES          ON transactions TO app_admin;

-- Grant connect to the roles via the api_service user
-- The application connects as 'api_service' and SET ROLE to app_user/app_admin
CREATE USER api_service WITH PASSWORD 'api_service_pass';
GRANT app_user  TO api_service;
GRANT app_admin TO api_service;
GRANT CONNECT ON DATABASE risk_engine TO api_service;
GRANT USAGE ON SCHEMA public TO api_service;
