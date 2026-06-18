# AGENTS.md

## Repository Shape
- This repo now contains a runnable NodeJS + Express + HBS + PostgreSQL + Socket.IO app at the repository root.
- The numbered docs in `context/` remain the source of truth for domain behavior. Read `00-overview.md` first, then module docs; use `09-api-design.md` and `10-database.md` as cross-cutting references.

## Domain Anchors
- Target stack from the spec: NodeJS + Express, HBS, PostgreSQL, Socket.IO, Dokploy.
- Internal mobile-first booking system for roles: Owner, Manager, Sale.
- Core lifecycle: Booking -> Confirmed -> Assigned -> Check-in -> Check-out -> Completed.
- Preserve documented uppercase statuses and snake_case event names exactly.
- Booking data fields: `customer_name`, `phone`, `booking_time`, `guest_count`, `note`, `branch_id`.
- Booking statuses documented so far: `PENDING`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `CHECKED_IN`, `CHECKED_OUT`, `COMPLETED`.
- Table statuses: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `BLOCKED`; table assignment supports one-or-many tables, change table, merge, and split via `booking_tables`.
- API surface is centered on `/api/bookings`: CRUD plus `assign`, `check-in`, `check-out`, and `cancel` actions.
- Database table anchors: `branches`, `staffs`, `customers`, `bookings`, `areas`, `tables`, `booking_tables`, `booking_status_logs`, `notifications`.
- Socket.IO events: `booking_created`, `booking_updated`, `booking_cancelled`, `booking_assigned`, `booking_checked_in`, `booking_checked_out`, `table_assignment_changed`, `staff_online`, `staff_offline`.
- Dashboard should stay mobile-first with large buttons and one-tap actions for today's bookings, upcoming bookings, active tables, and waiting confirmation.

## Commands
- Install dependencies with `npm install`.
- Configure PostgreSQL using `DATABASE_URL`; use `.env.example` as the local template.
- Run migrations with `npm run migrate` and seed base branch/areas/tables/staff with `npm run seed`.
- Start the app with `npm start`; use `npm run dev` for nodemon during development.
- Run validation with `npm test` or `npm run check`.
