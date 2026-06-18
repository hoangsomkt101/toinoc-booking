# Plan: Create Root AGENTS.md

## Findings
- The repository root contains only numbered Markdown context documents: `00-overview.md` through `10-database.md`.
- There is no existing `AGENTS.md`, `README*`, manifest, lockfile, CI workflow, formatter/lint/typecheck/test config, `opencode.json`, or Kilo config in this repo.
- This is currently a context/spec repository for a restaurant booking system, not an implementation repository with runnable commands.
- Verified intended stack from `00-overview.md`: NodeJS + Express, HBS, PostgreSQL, Socket.IO, Dokploy.
- Verified core product flow: Booking -> Confirmed -> Assigned -> Check-in -> Check-out -> Completed.

## Implementation Steps
1. Create root `AGENTS.md` because none exists.
2. Keep it compact and explicitly state that no verified build/test/dev commands exist yet, so agents should not invent commands unless implementation tooling is added.
3. Add a short "Repository Shape" section explaining that the numbered Markdown files are the current source of truth and should be read in order, with `09-api-design.md` and `10-database.md` used as cross-cutting references.
4. Add a "Domain Anchors" section with only verified facts likely to prevent mistakes:
   - roles: Owner, Manager, Sale
   - stack: NodeJS + Express, HBS, PostgreSQL, Socket.IO, Dokploy
   - lifecycle: Booking -> Confirmed -> Assigned -> Check-in -> Check-out -> Completed
   - booking fields and statuses from `01-booking.md`
   - table statuses and table assignment behavior from `02-area-table.md` and `03-table-assignment.md`
   - API routes from `09-api-design.md` plus module docs
   - database tables from `10-database.md`
   - Socket.IO event names from `06-realtime.md` and `07-online-staff.md`
   - mobile-first dashboard constraints from `08-dashboard.md`
5. Avoid generic agent advice, speculative implementation details, and exhaustive restatement of every document.
6. After writing, re-read `AGENTS.md` to ensure it is concise, repo-specific, and contains no unverified commands or stale claims.

## Proposed AGENTS.md Shape
```markdown
# AGENTS.md

## Repository Shape
- This repo is currently a Markdown context/spec repo only; there is no verified app source, `package.json`, lockfile, CI, or test/build command yet.
- Treat the numbered docs as source of truth. Read `00-overview.md` first, then module docs; use `09-api-design.md` and `10-database.md` as cross-cutting references.

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
- No verified setup, dev, lint, typecheck, build, or test commands exist yet. Add real scripts/config before documenting commands here.
```

## Verification
- Re-read the completed `AGENTS.md`.
- Confirm no generic guidance, guessed commands, or unverified architecture claims were introduced.
