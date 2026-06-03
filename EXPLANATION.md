# Tech Stack & Working Mechanism — Deep Explanation
# NewEra AI Risk Engine Platform

---

## 1. DOCKER & DOCKER COMPOSE

### What is Docker?
Docker is a tool that packages your application and all its dependencies into a
"container" — a lightweight, isolated environment that runs the same way on any
machine. Think of it like a standardised shipping container for software.

### What is Docker Compose?
Docker Compose is a tool that lets you define and run multiple Docker containers
together using a single YAML file (docker-compose.yml). Instead of starting 6
separate containers manually, you run `docker-compose up --build` and they all
start together in the right order.

### How it works in this project:
We define 6 services in docker-compose.yml:
- db, redis, api, worker, simulator, frontend

Each service has:
- A base image (postgres:16-alpine, redis:7.2-alpine) OR a Dockerfile
- Environment variables passed in
- Health checks (so dependent services wait until DB/Redis are actually ready)
- Volume mounts (so data survives restarts)

The `depends_on` with `condition: service_healthy` is critical — it prevents the
API from starting before the database is ready, avoiding connection errors.

### Why Alpine?
Alpine Linux is a minimalist Linux distribution (~5MB). Using postgres:16-alpine
instead of postgres:16 makes images much smaller (faster builds, less storage).

### Multi-Stage Builds
Our Dockerfiles use multi-stage builds:
```dockerfile
FROM node:20-alpine AS builder    # Stage 1: Install deps + compile TypeScript
FROM node:20-alpine AS runner     # Stage 2: Only copy compiled JS + node_modules
```
This means the final Docker image doesn't contain TypeScript source, dev
dependencies, or build tools — only what's needed to run. This reduces image
size by 50-70%.

---

## 2. POSTGRESQL & ROW-LEVEL SECURITY (RLS)

### What is PostgreSQL?
PostgreSQL is a relational database — data is stored in tables with rows and columns.
It's ACID-compliant (Atomic, Consistent, Isolated, Durable), meaning transactions
either fully succeed or fully fail, and data is never left in a broken state.

### What is a Connection Pool?
Instead of opening a new database connection for every single request (which is
expensive — takes ~50ms each time), a connection pool maintains a set of pre-opened
connections. When the API needs one, it borrows one from the pool and returns it
when done. We use the `pg` library's `Pool` class with `max: 20` connections.

### What is RLS (Row-Level Security)?
RLS is a PostgreSQL feature that filters which rows a user can see at the DATABASE
ENGINE LEVEL — not in application code. Even if a developer wrote a bug in the API
that didn't filter by tenant, the database itself would still refuse to return
another tenant's rows.

### How our RLS works:

**Step 1** — We create two roles:
  - `app_user`: can only see rows where tenant_id matches a session variable
  - `app_admin`: can see all rows

**Step 2** — We define policies:
  - `admin_all`: app_admin can do anything with any row (`USING (true)`)
  - `user_tenant`: app_user can only see rows where `tenant_id = current_setting('app.current_tenant')`

**Step 3** — In the API, before EVERY query:
  - We `SET LOCAL ROLE app_user` (or `app_admin`)
  - For app_user, we `SET LOCAL app.current_tenant = '<tenantId>'`
  - `SET LOCAL` means these settings only last for the current transaction, then reset

**Step 4** — PostgreSQL evaluates the policy for every row returned.
  For app_user querying `SELECT * FROM transactions`, PostgreSQL internally rewrites
  this to `SELECT * FROM transactions WHERE tenant_id = current_setting('app.current_tenant')`
  before executing it. The developer never needs to write this WHERE clause themselves.

### Why not just use `WHERE tenant_id = ?`?
A WHERE clause is application-layer filtering. If a developer forgets it, or if
there's a code bug, data leaks. RLS is enforced at the database engine — it cannot
be bypassed from application code. This is called **defence-in-depth**.

### Why `SET LOCAL` instead of `SET`?
`SET LOCAL` scopes the setting to the current database transaction only. When the
transaction ends (COMMIT or ROLLBACK), the setting is automatically cleared. This
is critical when using connection pools — if we used `SET` (without LOCAL), the
setting would persist on the connection and could leak to the next request that
borrows the same connection from the pool.

---

## 3. REDIS

### What is Redis?
Redis (Remote Dictionary Server) is an in-memory data store. It keeps data in RAM
instead of disk, making it extremely fast (~microsecond read/writes vs. milliseconds
for PostgreSQL). It supports many data structures: strings, lists, hashes, sorted
sets, pub/sub channels.

### How we use Redis in two ways:

**WAY 1 — Message Queue (Simulator → Worker)**
  We use Redis as a simple list-based queue:
  - Simulator calls `LPUSH transactions:queue <job_json>` — pushes a job to the left
  - Worker calls `BRPOP transactions:queue 0` — blocks until a job appears, pops from right
  - This LPUSH + BRPOP pattern creates a FIFO queue (first in, first out).
  - The Worker processes one job at a time. Multiple workers could run in parallel.

**WAY 2 — Recent Activity Cache**
  After the worker processes a job, it stores the result in a Redis list:
  - `LPUSH transactions:recent <result_json>`
  - `LTRIM transactions:recent 0 49` (keep only last 50 items)
  - `EXPIRE transactions:recent 3600` (auto-delete after 1 hour)
  The API's `/recent` endpoint reads from this list directly, avoiding a DB query for
  "what just happened". This is called a **read-through cache**.

### Why BRPOP (Blocking Pop)?
Regular `RPOP` returns immediately (empty result if queue is empty). You'd need to
poll in a tight loop, wasting CPU. `BRPOP` blocks the connection until a new item
arrives, using near-zero CPU while waiting. It's the standard pattern for Redis-based
worker queues.

### BullMQ vs. Raw Redis
In production, you'd use BullMQ (which wraps Redis) for more features like retries,
job priorities, rate limiting, and dead-letter queues. We use raw Redis BRPOP for
simplicity, but the pattern is identical.

---

## 4. NODE.JS + TYPESCRIPT

### What is Node.js?
Node.js is a JavaScript runtime built on Chrome's V8 engine. It's single-threaded
but uses an event loop to handle thousands of concurrent connections without blocking.
Perfect for I/O-heavy services like our API and worker.

### What is TypeScript?
TypeScript is JavaScript with types. You annotate variables and functions with their
expected types (string, number, TransactionStatus enum) and the TypeScript compiler
(tsc) catches type errors before you run the code. This prevents whole categories of
bugs at compile time.

### Why TypeScript for this project?
- The `TransactionStatus` enum means we can never accidentally pass the string
  `"APPROVD"` (typo) — TypeScript would catch it at compile time
- Interfaces (`Transaction`, `QueueJob`) document exactly what shape data has
- The type declarations on `req.auth` ensure every route knows what's in the auth context

### The `enum` Pattern
```typescript
export enum TransactionStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  FLAGGED  = 'FLAGGED',
  REJECTED = 'REJECTED',
}
```
This is a string enum — the values match the PostgreSQL ENUM type exactly. Using
`TransactionStatus.APPROVED` instead of the raw string `'APPROVED'` means:
1. TypeScript catches typos at compile time
2. IDE autocomplete shows all valid values
3. Refactoring is safe (rename in one place, all usages update)

---

## 5. EXPRESS.JS (REST API)

### What is Express?
Express is a minimal Node.js web framework. It handles HTTP routing (matching URLs
to handler functions), middleware (functions that run before your handlers), and
response formatting.

### Middleware chain in our API:
Every request flows through this pipeline:
  1. `helmet()` — sets security headers (prevents XSS, clickjacking, etc.)
  2. `cors()` — allows the frontend (port 3000) to call the API (port 4000)
  3. `express.json()` — parses the request body as JSON
  4. Logging middleware — logs every incoming request
  5. `clerkAuthMiddleware` — validates JWT, sets `req.auth` (blocks 401 if invalid)
  6. Route handler — executes business logic
  7. `errorHandler` — catches any unhandled errors, returns structured JSON

### Why helmet?
HTTP headers can expose security information. Helmet sets headers like:
  - `X-Content-Type-Options: nosniff` (prevents MIME sniffing attacks)
  - `X-Frame-Options: DENY` (prevents clickjacking)
  These are security best practices for any production API.

### Why CORS?
CORS (Cross-Origin Resource Sharing) is a browser security feature. The frontend
runs on `localhost:3000` and the API on `localhost:4000` — these are different
"origins". Without CORS headers, the browser would block API requests. We configure
Express to accept requests from the frontend's origin.

---

## 6. CLERK AUTHENTICATION

### What is Clerk?
Clerk is an authentication-as-a-service platform. It handles user accounts, sessions,
JWTs, multi-factor auth, and organisation management so you don't have to build these
yourself.

### How JWTs work:
A JWT (JSON Web Token) is a Base64-encoded, cryptographically signed string containing
claims (userId, orgId, expiry). The signature is created with Clerk's private key.
Your API verifies the signature using Clerk's public key — if the signature doesn't
match, the token is invalid (tampered or expired).

**Structure:** `header.payload.signature`
  - **header**: algorithm (RS256) and token type
  - **payload**: userId, orgId, issuedAt, expiresAt
  - **signature**: `HMAC(header + "." + payload, privateKey)`

### Our JWT flow:
1. User signs in via Clerk in the browser
2. Clerk issues a signed JWT
3. Frontend sends this JWT in the `Authorization: Bearer <token>` header
4. Our API calls `clerk.verifyToken(token)` — Clerk checks the signature
5. We extract `org_id` from the payload
6. We map `org_id` → database role (**NEVER** trusting a role from the frontend)
7. We set `req.auth = { userId, tenantId, dbRole, orgId }`
8. The route handler uses `req.auth.dbRole` to `SET LOCAL ROLE` before querying

### Two Clerk Organisations:
Clerk organisations are like teams/groups. We create two:
- `merchants-org`: regular merchants who can see their own data
- `risk-admins-org`: ops team who can see everything
The `org_id` in the JWT tells us which org the user is currently active in.

### Why Two Separate Logins?
The spec requires two **distinct** login flows — not a shared login page with a
role dropdown. When a user signs in and selects their active organisation, Clerk
embeds the `org_id` in the JWT. This is what the backend uses to determine access.
The frontend never sends a "role" parameter — the role is **derived** from the JWT.

---

## 7. REACT + VITE (FRONTEND)

### What is React?
React is a UI library. You build UIs as a tree of components — each component is a
TypeScript function that returns JSX (HTML-like syntax). When data changes, React
re-renders only the affected components (not the whole page).

### What is Vite?
Vite is a build tool and dev server. It serves your React app during development with
extremely fast Hot Module Replacement (HMR) — when you save a file, only that module
reloads in the browser, not the whole page. For production, it bundles everything into
optimised static files.

### Why Vite instead of Create React App?
Create React App (CRA) uses Webpack, which is slow. Vite uses native ES modules
in development (no bundling) and esbuild for production (100x faster than Webpack).

### useEffect + polling pattern:
Our dashboards use this pattern to live-update:
```typescript
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 5000);
  return () => clearInterval(interval);  // cleanup on unmount
}, [fetchData]);
```
This fetches data immediately, then every 5 seconds. The cleanup function prevents
memory leaks by clearing the interval when the component unmounts.

### Component Architecture:
```
App.tsx
├── ClerkProvider (wraps entire app with auth context)
├── BrowserRouter (client-side routing)
│   ├── /sign-in → Login.tsx (Clerk SignIn component)
│   └── /dashboard → DashboardRouter
│       ├── If org = risk-admins-org → AdminDashboard.tsx
│       └── Else → MerchantDashboard.tsx
│
├── Shared Components:
│   ├── Sidebar.tsx (fixed left nav, brand, org info, sign-out)
│   ├── TopBar.tsx (page title, live indicator, refresh button)
│   ├── TransactionTable.tsx (data table with formatting)
│   ├── StatusBadge.tsx (pill badges: PENDING/APPROVED/FLAGGED/REJECTED)
│   ├── KPICard.tsx (stat cards with accent colours)
│   ├── TableSkeleton.tsx (loading placeholders)
│   └── EmptyState.tsx (when no transactions exist)
```

---

## 8. TAILWIND CSS

### What is Tailwind?
Tailwind is a utility-first CSS framework. Instead of writing CSS classes like
`.transaction-table { border: 1px solid #1F2937; }`, you compose styles directly in
JSX using utility classes: `className="border border-zinc-800"`.

### Why utility-first?
No context switching between JSX and CSS files. Styles co-locate with the component.
The generated CSS file is tiny because Tailwind's JIT compiler only includes the
classes you actually use.

### Our Design Tokens:
| Token | Value | Usage |
|---|---|---|
| Background | `bg-zinc-950` / `#0A0E1A` | Page background |
| Card surface | `bg-zinc-900/40` | Table containers, KPI cards |
| Border | `border-zinc-800` | All borders |
| Primary | `text-blue-400` | Accent, links, primary actions |
| Muted text | `text-zinc-500` | Labels, subtitles |
| Monospace | `font-mono` (JetBrains Mono) | Numbers, IDs, timestamps |

---

## 9. PINO (STRUCTURED LOGGING)

### What is structured logging?
Instead of logging plain text strings like `"User 123 logged in"`, structured logging
emits JSON objects: `{ "level": "info", "userId": "123", "event": "login", "time": ... }`
This makes logs machine-parseable — you can pipe them to tools like Datadog, Grafana
Loki, or Elasticsearch and filter/aggregate them programmatically.

### Why Pino?
Pino is the fastest Node.js logger — it uses a separate worker thread to write logs,
so logging never blocks your main event loop. It outputs NDJSON (newline-delimited JSON).

### Log levels:
`TRACE → DEBUG → INFO → WARN → ERROR → FATAL`
  - **debug**: detailed internals (DB role setting, query details)
  - **info**: normal operations (transaction processed, server started)
  - **warn**: something unexpected but recoverable (auth failure, cache miss)
  - **error**: something failed and needs attention (DB connection error)

### Example log output (production):
```json
{"level":30,"time":1717434567890,"service":"worker","txn_id":"abc-123","status":"APPROVED","reason":"Passed all risk checks","msg":"Risk result assigned"}
```

---

## 10. EVENT-DRIVEN ARCHITECTURE

### What does "event-driven" mean?
Instead of one process directly calling another (synchronous), we decouple them with
a message queue. The Simulator doesn't care whether the Worker is running or busy —
it just publishes a job to Redis and moves on. The Worker consumes jobs at its own
pace. They're completely independent.

### Why this matters:
- **Resilience**: If the Worker crashes, jobs wait in the queue. When it restarts, it
  processes all queued jobs. No data is lost.
- **Scalability**: Run 5 Workers in parallel to process 5 jobs simultaneously.
- **Decoupling**: Change the risk logic without touching the Simulator.

### The flow in sequence:
```
t=0s:  Simulator generates transaction, writes PENDING to DB, pushes job to Redis
t=0s:  Redis stores job in the queue list
t=0s:  Worker's BRPOP unblocks, receives the job
t=2s:  Worker finishes evaluation (simulated delay), updates DB to APPROVED/FLAGGED/REJECTED
t=2s:  Worker pushes result to Redis cache
t=5s:  Frontend's 5s polling fires, fetches updated transactions from API
t=5s:  API queries PostgreSQL (RLS-scoped), returns results to dashboard
t=5s:  React re-renders the table with the new status
```

---

## 11. SECURITY MODEL SUMMARY

**Threat**: A malicious merchant tries to see another merchant's transactions.

**Defence Layer 1 — Clerk JWT**: The request must have a valid signed JWT. Without it, 401.

**Defence Layer 2 — Org mapping**: The JWT's `org_id` determines the DB role. The frontend
  cannot override this.

**Defence Layer 3 — RLS**: Even if the API code had a bug, PostgreSQL's `user_tenant` policy
  filters rows before returning them. The merchant's session variable is their own
  tenantId, so they can only ever get their own rows.

**Defence Layer 4 — No inbound API**: There's no `POST /transactions` endpoint. Transactions
  only enter through the internal simulator. An attacker cannot inject fake transactions.

---

## 12. WHY EACH TECHNOLOGY WAS CHOSEN

| Technology  | Why this one?                                               |
|-------------|-------------------------------------------------------------|
| PostgreSQL  | Mature, battle-tested, the ONLY relational DB with RLS      |
| Redis       | Fastest in-memory store; native list = trivial queue        |
| Node.js     | Non-blocking I/O ideal for API servers and queue workers    |
| TypeScript  | Type safety catches bugs at compile time, not at 3am        |
| Clerk       | Production-grade auth with org support in minutes, not weeks|
| React       | Component model maps naturally to dashboard UI              |
| Vite        | 10-100x faster than Webpack for development                 |
| Docker      | Reproducible environments; one-command cold start           |
| Tailwind    | Fast styling without CSS context switching                  |
| Pino        | Fastest Node.js logger; structured JSON for observability   |
| Express     | Minimal, battle-tested, enormous ecosystem                  |

---

*NewEra AI · Risk Engine Platform · Tech Stack Deep Dive*
