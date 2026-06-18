# Restaurant Booking System

Mobile-first internal booking system for restaurants, implemented from the context specs in `context/`.

## Stack
- NodeJS + Express
- HBS server-rendered dashboard
- PostgreSQL
- Socket.IO realtime updates
- Dockerfile for Dokploy-style deployment

## Setup
1. Install dependencies: `npm install`
2. Start local PostgreSQL with Docker: `npm run db:up`
3. Copy `.env.example` to `.env` if you need to override local settings. The default `DATABASE_URL` already matches the Docker database.
4. Run migrations: `npm run migrate`
5. Seed base branch, areas, tables, staff, and demo user accounts: `npm run seed`
6. Start the app: `npm start`

The dashboard is available at `http://localhost:3000/dashboard`.

## Deploy To Dokploy From Git
- Repository: `https://github.com/hoangsomkt101/toinoc-booking.git`.
- Create a Dokploy application from Git and choose Dockerfile deployment from the repository root.
- Use container port `3000`. The app also respects Dokploy's `PORT` environment variable if you set a different value.
- Configure the health check path as `/healthz`. `/readyz` also verifies PostgreSQL connectivity.
- Create or attach a PostgreSQL database and set `DATABASE_URL` to its connection string.
- Set `DB_SSL=true` only when your PostgreSQL provider requires SSL. Leave it `false` for Dokploy's internal PostgreSQL service unless SSL is enabled there.
- Set required production variables: `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `MANAGER_PASSWORD`, and `SALE_PASSWORD`.
- `npm start` automatically waits for PostgreSQL, runs migrations, and seeds the default branches/tables/users only when no users exist.
- Keep `RUN_MIGRATIONS_ON_START=true` for normal deployments. Set it to `false` only if you run migrations manually.
- Keep `SEED_ON_START=true` for first deploy so initial users are created. After users exist, the seed step is skipped automatically.
- Enable WebSocket support in the Dokploy proxy so Socket.IO dashboard updates work.

Default seeded login usernames are `admin`, `manager`, and `sale`; their passwords come from `ADMIN_PASSWORD`, `MANAGER_PASSWORD`, and `SALE_PASSWORD`.

## Scripts
- `npm start`: run the app.
- `npm run dev`: run with nodemon.
- `npm run db:up`: start local PostgreSQL with Docker Compose.
- `npm run db:down`: stop local PostgreSQL and remove the Compose container/network.
- `npm run db:logs`: follow PostgreSQL logs.
- `npm run migrate`: apply SQL migrations.
- `npm run seed`: insert demo branch, areas, tables, staff, and user accounts.
- `npm run db:setup`: run migrations and seed data.
- `npm test`: run Node test runner.
- `npm run check`: syntax-check server entry and run tests.

## Production Runtime Variables
- `NODE_ENV`: use `production` on Dokploy.
- `PORT`: HTTP port, default `3000`.
- `DATABASE_URL`: PostgreSQL connection string.
- `DB_SSL`: set `true` for SSL PostgreSQL connections, default `false`.
- `CORS_ORIGIN`: optional allowed origin for Socket.IO cross-origin use.
- `SESSION_SECRET`: required in production; use a long random value.
- `SESSION_TTL_MINUTES`: signed login cookie lifetime, default `480`.
- `ADMIN_PASSWORD`, `MANAGER_PASSWORD`, `SALE_PASSWORD`: required while `SEED_ON_START=true` in production.
- `RUN_MIGRATIONS_ON_START`: run SQL migrations before listening, default `true`.
- `SEED_ON_START`: create default branches/tables/users when no users exist, default `true`.
- `DB_CONNECT_RETRIES`: database startup retry count, default `30`.
- `DB_CONNECT_RETRY_DELAY_MS`: retry delay in milliseconds, default `2000`.

## Login And Authorization
- `/login` signs users in with username/password accounts stored in PostgreSQL.
- Session state is stored in an `HttpOnly` signed cookie named `rb_session`.
- Configure `SESSION_SECRET`, `ADMIN_PASSWORD`, `MANAGER_PASSWORD`, and `SALE_PASSWORD` in `.env`.
- Seed creates local users `admin`, `manager`, and `sale` using the configured passwords. Local defaults are `admin123`, `manager123`, and `sale123`; production requires explicit environment values.
- `/dashboard` and all `/api` routes require a valid session.
- Role hierarchy is `admin` > `manager` > `sale`.
- `sale` can read dashboard/bookings/tables, create bookings, check in, and check out.
- `manager` can do everything `sale` can, plus update bookings, assign tables, cancel bookings, complete bookings through status updates, and create `sale` accounts in their branch.
- `admin` can do everything `manager` can, plus create `admin`, `manager`, and `sale` accounts. `Owner` is accepted as an alias for `admin` to match the original staff role naming.
- Socket.IO authenticates with the same signed session cookie and broadcasts `staff_online` / `staff_offline` with the current `online_users` list for the dashboard.

## API
- `POST /api/bookings`
- `GET /api/bookings`
- `GET /api/bookings/:id`
- `PUT /api/bookings/:id`
- `POST /api/bookings/:id/assign`
- `POST /api/bookings/:id/check-in`
- `POST /api/bookings/:id/check-out`
- `POST /api/bookings/:id/cancel`

Supporting endpoints:
- `GET /api/dashboard`
- `GET /api/tables`
- `GET /api/public/branches` for allowed API domains to read public branch options.
- `POST /api/public/bookings` for allowed API domains to create `PENDING` bookings with `X-Booking-Api-Key`.
- `GET /api/api-clients`, `POST /api/api-clients`, `PUT /api/api-clients/:id`, `DELETE /api/api-clients/:id`, and `POST /api/api-clients/:id/rotate-key` for admin-only API Settings.
- `GET /api/branches`
- `POST /api/branches` with `name`, `address`, and `areas: [{ name, table_count, capacity?, table_prefix? }]`
- `POST /api/branches/:id/areas` to add one area and auto-create its tables
- `GET /api/areas` with optional `branch_id`
- `GET /api/areas/:id`
- `POST /api/areas` with `branch_id`, `name`, `table_count`, `capacity?`, and `table_prefix?`
- `GET /api/users`
- `POST /api/users`
- `GET /api/online-users`

## Domain Anchors
- Booking statuses: `PENDING`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `CHECKED_IN`, `CHECKED_OUT`, `COMPLETED`.
- Table statuses: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `BLOCKED`.
- Each branch contains one or more areas, and each area owns a configured quantity of physical `tables` records.
- Dashboard endpoints accept optional `branch_id`; omitting it means total mode across all branches.
- Socket.IO events: `booking_created`, `booking_updated`, `booking_cancelled`, `booking_assigned`, `booking_checked_in`, `booking_checked_out`, `table_assignment_changed`, `staff_online`, `staff_offline`.
