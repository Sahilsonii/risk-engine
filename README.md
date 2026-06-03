# NewEra AI — Risk Engine Platform

> **Secure, Event-Driven, Multi-Tenant Transaction Risk Monitoring System**

A containerised internal operations tool that generates synthetic financial transactions, evaluates them through an asynchronous risk engine, and surfaces results on an enterprise-grade React dashboard — all secured with Row-Level Security and Clerk-based dual-organisation authentication.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Clerk Setup (Required)](#clerk-setup-required)
4. [Cold Start — Quick Setup](#cold-start--quick-setup)
5. [How Row-Level Security (RLS) Works](#how-row-level-security-rls-works)
6. [Verifying RLS with psql](#verifying-rls-with-psql)
7. [Service Overview](#service-overview)
8. [Logging](#logging)
9. [AI Tools Used](#ai-tools-used)
10. [What I'd Improve With More Time](#what-id-improve-with-more-time)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  INTERNAL ONLY — no public transaction submission endpoint   │
└──────────────────────────────────────────────────────────────┘

[ Simulator Process ]
      │  Generates synthetic transactions (amount, tenant_id)
      │  Publishes job to Redis queue directly
      │  Writes PENDING record to PostgreSQL
      ▼
[ Redis Queue (LPUSH / BRPOP) ]
      │  Job: { id, tenant_id, amount, timestamp }
      ▼
[ Risk Worker ]
      │  Consumes job — applies risk logic (2s simulated delay)
      │  Writes final status: APPROVED / REJECTED / FLAGGED
      │  Updates Redis recent-activity cache
      ▼
[ PostgreSQL (RLS Enforced) ]
      │  Persists all transactions with enforced tenant isolation
      │  Roles: app_user (scoped) / app_admin (unrestricted)
      ▼
[ Internal REST API ]  (Clerk JWT required on ALL routes)
      │  SET LOCAL ROLE + SET LOCAL app.current_tenant before every query
      │  Reads from PostgreSQL (RLS-scoped) + Redis cache
      ▼
[ React Dashboard ]
      Merchant Login  →  own tenant data only  (RLS: app_user)
      Admin Login     →  all tenant data       (RLS: app_admin)
```

**Key architectural decisions:**
- **No inbound transaction API.** Transactions enter only via the internal simulator → Redis queue. No `POST /transactions` endpoint exists.
- **Event-driven decoupling.** Simulator and Worker communicate only through Redis — they are independently restartable.
- **Defence-in-depth.** Tenant isolation is enforced at the database engine level (RLS), not application code.

---

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | 2.x+ | Multi-service orchestration |
| **Node.js** | 20 LTS | Local development (optional) |
| **Clerk Account** | Free tier | Authentication & org management |

---

## Clerk Setup (Required)

Clerk handles authentication and organisation management. You need to configure two organisations before running the platform.

### Step 1 — Create a Clerk Application
1. Go to [clerk.com](https://clerk.com) and create a free account.
2. Create a new application (e.g., "NewEra Risk Engine").
3. Note your **Publishable Key** (`pk_test_...`) and **Secret Key** (`sk_test_...`).

### Step 2 — Create Two Organisations
In the Clerk Dashboard → **Organisations**:

| Organisation | Slug | Purpose |
|---|---|---|
| Merchants | `merchants-org` | Regular merchants — see only their own transactions |
| Risk Admins | `risk-admins-org` | Operations team — see all tenant data |

Note the **Organisation ID** (`org_...`) for each.

### Step 3 — Add Members
- Add at least one user to `merchants-org` (this is a merchant user).
- Add at least one user to `risk-admins-org` (this is an admin user).
- A user can belong to both orgs for testing — the active org at login time determines their role.

### Step 4 — Enable Organisations in Session Tokens
In Clerk Dashboard → **Sessions** → **Customise Session Token**:
Ensure that `org_id` and `org_slug` are included in the session JWT claims. Clerk includes these by default when a user has an active organisation.

---

## Cold Start — Quick Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd risk-engine

# 2. Create .env from the template
cp .env.example .env

# 3. Fill in your Clerk credentials in .env
#    - CLERK_SECRET_KEY=sk_test_...
#    - CLERK_PUBLISHABLE_KEY=pk_test_...
#    - VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
#    - CLERK_MERCHANT_ORG_ID=org_...
#    - CLERK_ADMIN_ORG_ID=org_...

# 4. Start everything
docker-compose up --build

# Expected outcome:
#   db         — PostgreSQL ready, init.sql applied, RLS active
#   redis      — Ready, accepting connections
#   api        — Listening on port 4000, all routes JWT-protected
#   worker     — Consuming from queue, processing jobs
#   simulator  — Emitting synthetic transactions every ~3s
#   frontend   — Available at http://localhost:3000
```

**Verify all services are healthy:**
```bash
docker ps
# All 6 containers should show "healthy" or "Up"
```

---

## How Row-Level Security (RLS) Works

RLS is a PostgreSQL feature that filters which rows a user can access at the **database engine level** — not in application code.

### Why RLS instead of `WHERE tenant_id = ?`

A `WHERE` clause is application-layer filtering. If a developer forgets it, or there's a code bug, tenant data leaks to other tenants. RLS is enforced by the database engine itself — even a buggy SQL query cannot bypass it.

### How it works in this system

1. **Two database roles exist:** `app_user` and `app_admin`.
2. **The API connects as `api_service`** (a user that can assume either role via `SET ROLE`).
3. **Before every query**, the API middleware:
   - Runs `SET LOCAL ROLE app_user` (or `app_admin`)
   - For `app_user`, runs `SET LOCAL app.current_tenant = '<tenantId>'`
   - `SET LOCAL` means these settings last only for the current database transaction
4. **PostgreSQL evaluates the RLS policy on every row:**
   - `app_admin` → policy `admin_all` → `USING (true)` → sees everything
   - `app_user` → policy `user_tenant` → `USING (tenant_id = current_setting('app.current_tenant'))` → sees only their own rows

The `WHERE` clause is effectively injected **by the database engine** before any results are returned. The application developer never writes a tenant filter — the database handles it.

---

## Verifying RLS with psql

Connect to the database while the stack is running:

```bash
docker exec -it risk_db psql -U postgres -d risk_engine
```

**1. Verify policies exist:**
```sql
SELECT * FROM pg_policies WHERE tablename = 'transactions';
-- Should show: admin_all, user_tenant
```

**2. Test as app_admin (sees everything):**
```sql
SET ROLE api_service;
SET ROLE app_admin;
SELECT COUNT(*) FROM transactions;
-- Returns total across all tenants
RESET ROLE;
```

**3. Test as app_user (sees only one tenant):**
```sql
SET ROLE api_service;
SET ROLE app_user;
SET app.current_tenant = 'merchant_alpha';
SELECT COUNT(*) FROM transactions;
-- Returns only merchant_alpha's transactions
SELECT DISTINCT tenant_id FROM transactions;
-- Should ONLY show 'merchant_alpha'
RESET ROLE;
```

**4. Verify cross-tenant isolation:**
```sql
SET ROLE api_service;
SET ROLE app_user;
SET app.current_tenant = 'merchant_alpha';
SELECT * FROM transactions WHERE tenant_id = 'merchant_beta';
-- Returns 0 rows — RLS blocks access even with explicit WHERE
RESET ROLE;
```

---

## Service Overview

| Service | Port | Technology | Responsibility |
|---|---|---|---|
| **db** | 5432 | PostgreSQL 16 Alpine | Primary data store with RLS enforcement |
| **redis** | 6379 | Redis 7.2 Alpine | Message queue + recent-activity read cache |
| **api** | 4000 | Node.js + Express + TypeScript | JWT-protected REST API. SET LOCAL ROLE on every query. |
| **worker** | — | Node.js + TypeScript | Consumes jobs from Redis, evaluates risk, updates PostgreSQL |
| **simulator** | — | Node.js + TypeScript | Generates synthetic transactions, publishes to Redis queue |
| **frontend** | 3000 | React + Vite + TypeScript | Enterprise dashboard with two Clerk login flows |

---

## Logging

All three backend services use **Pino** — a structured JSON logger.

### Log Levels
| Level | Usage |
|---|---|
| `debug` | DB role setting, query details, cache writes |
| `info` | Normal operations — transaction generated, job completed, server started |
| `warn` | Auth failures (401), non-fatal cache errors |
| `error` | DB connection failures, job processing errors |

### Viewing Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f simulator
docker-compose logs -f worker
docker-compose logs -f api
```

In production (`NODE_ENV=production`), logs are output as NDJSON (newline-delimited JSON) for machine parsing. In development, they're pretty-printed with colors via `pino-pretty`.

---

## AI Tools Used

This project was built with AI assistance. Here is a breakdown of what was AI-generated vs. manually directed:

### What AI Generated (with direction)
- **Boilerplate scaffolding:** Docker Compose configuration, Dockerfiles, tsconfig.json files, package.json files
- **Database initialization:** `init.sql` with RLS policies (provided in the specification — used as-is)
- **Component code:** React components following the specified design system (dark theme, status badges, skeleton loaders)
- **API routes:** Express route handlers with parameterised queries and RLS integration

### What Required Manual Direction & Review
- **Clerk authentication middleware:** The JWT → org_id → database role mapping is the security-critical path. Verified that `org_id` is extracted from the Clerk JWT payload (not from any frontend parameter), and that the role mapping is hardcoded in the middleware.
- **RLS enforcement pattern:** Ensured every database query uses `SET LOCAL ROLE` + `SET LOCAL app.current_tenant` inside a transaction — not just a `WHERE` clause.
- **Architecture decisions:** No inbound transaction API, BRPOP-based queue consumption, separation of simulator/worker/API as distinct processes.
- **Error handling:** Structured error responses, graceful degradation when Redis cache fails, proper DB transaction rollback on errors.

### What I'd Walk Through in a Debrief
- The `clerkAuthMiddleware` in detail — how JWT verification works, why we never trust frontend role params
- The `SET LOCAL ROLE` pattern — why `SET LOCAL` (not `SET`) to prevent connection pool contamination
- The risk evaluation engine — deterministic rules for high amounts, probabilistic model for normal range
- Why BRPOP (blocking pop) instead of polling the Redis queue

---

## What I'd Improve With More Time

### 1. WebSocket Real-Time Updates
Replace the 5-second polling with WebSocket connections (Socket.IO or native WS). The worker would emit events on job completion, and the frontend would receive live status updates instantly — reducing latency from ~5s to ~100ms and eliminating unnecessary API calls.

### 2. BullMQ Instead of Raw Redis Lists
The current LPUSH/BRPOP pattern works but lacks job retry logic, dead-letter queues, rate limiting, and job priority. BullMQ wraps Redis with all of these features and provides a dashboard (Bull Board) for monitoring queue health.

### 3. Database Migrations with Knex or Prisma
Currently using a single `init.sql` file. For a production system, incremental schema migrations (with rollback support) are essential. Knex or Prisma Migrate would handle this properly.

### 4. Comprehensive Test Suite
- **Unit tests** for the risk evaluation engine (deterministic rules are highly testable)
- **Integration tests** for the API routes with a test database (verify RLS boundaries)
- **E2E tests** with Playwright or Cypress for the two login flows and dashboard rendering
- **Security tests** — verify that a merchant JWT cannot access another tenant's data

### 5. Rate Limiting & Request Validation
Add rate limiting on the API (e.g., `express-rate-limit`) to prevent abuse, and input validation/sanitisation on all query parameters (currently trusting `page`, `limit`, `status`, `tenant` without validation).

### 6. Observability Stack
Add Prometheus metrics (request latency, queue depth, error rates), health check endpoints (internal only, not exposed), and distributed tracing with OpenTelemetry for debugging cross-service issues.

---

*NewEra AI · Risk Engine Platform · Built as a technical assessment*
