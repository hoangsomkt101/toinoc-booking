# Booking Module

## Purpose
Create and manage reservations.

## Fields
- customer_name
- phone
- booking_time
- guest_count
- note
- branch_id

## Status
PENDING
CONFIRMED
CANCELLED
NO_SHOW

## APIs
POST /api/bookings
GET /api/bookings
GET /api/bookings/:id
PUT /api/bookings/:id
