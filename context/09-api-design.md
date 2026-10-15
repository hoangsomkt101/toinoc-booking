# API Design

POST /api/bookings
GET /api/bookings
GET /api/bookings/:id
PUT /api/bookings/:id

GET /api/bookings supports optional `q`, `page`, `limit`, and `view` query parameters for server-side customer name/phone search. `view` accepts `all`, `pending`, `upcoming`, `completed`, or `cancelled`. Paginated responses preserve the booking array in `data` and include top-level `pagination` metadata.

POST /api/bookings/:id/assign
POST /api/bookings/:id/check-in
POST /api/bookings/:id/check-out
POST /api/bookings/:id/cancel
