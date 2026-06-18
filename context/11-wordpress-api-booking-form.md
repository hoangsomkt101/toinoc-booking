# WordPress Integration Context: Public API va Form Dat Ban

Tai lieu nay mo ta cach tich hop form dat ban WordPress voi public API moi, khong dung cookie dang nhap noi bo.

## Muc tieu tich hop
- WordPress hien thi form dat ban cho khach.
- WordPress doc danh sach chi nhanh public de hien thi lua chon.
- WordPress tao booking moi voi status mac dinh `PENDING`.
- Nhan vien quan ly tiep tuc xu ly booking trong dashboard noi bo.

## Cau hinh trong dashboard
Chi `admin` moi thay menu `API Settings` tren sidebar.

Trong `API Settings`, admin tao cau hinh cho tung website tich hop:

- `name`: ten goi nho, vi du `Website WordPress`.
- `allowed_origin`: domain duoc phep, vi du `https://example.com`.
- `is_active`: bat/tat quyen goi public API.
- He thong sinh `api_key` khi tao hoac khi bam `Xoay key`.

Luu y bao mat:

- API key chi hien thi mot lan khi tao hoac xoay key.
- Luu API key trong WordPress server-side, khong dua vao HTML/JavaScript public.
- Cookie `rb_session` khong con can dung cho WordPress public booking.

## Base URL
Thay `BOOKING_API_BASE` bang domain app NodeJS/Express dang chay.

```text
BOOKING_API_BASE=https://booking.example.com
```

## Public endpoints cho WordPress

### Doc danh sach chi nhanh public
```http
GET /api/public/branches
```

Auth:

- Khong can cookie.
- Domain request phai khop `allowed_origin` da cau hinh trong `API Settings`.

Response:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Quan 1",
      "address": "Quan 1, TP.HCM"
    }
  ]
}
```

### Tao booking public
```http
POST /api/public/bookings
```

Auth:

- Khong can cookie.
- Header `Origin` phai khop `allowed_origin`.
- Header `X-Booking-Api-Key` phai khop API key cua domain do.

Headers:

```http
Content-Type: application/json
X-Booking-Api-Key: rb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Payload bat buoc:

| Field | Type | Bat buoc | Ghi chu |
| --- | --- | --- | --- |
| `customer_name` | string | Co | Ten khach hang |
| `phone` | string | Co | So dien thoai |
| `booking_time` | string datetime | Co | Nen gui ISO 8601 kem timezone, vi du `2026-06-20T18:30:00+07:00` |
| `guest_count` | integer | Co | So nguyen duong |
| `branch_id` | integer | Co | ID chi nhanh tu `GET /api/public/branches` |
| `note` | string/null | Khong | Ghi chu cua khach |

Vi du request:

```bash
curl -X POST "https://booking.example.com/api/public/bookings" \
  -H "Origin: https://example.com" \
  -H "Content-Type: application/json" \
  -H "X-Booking-Api-Key: rb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "customer_name": "Nguyen Van A",
    "phone": "0901234567",
    "booking_time": "2026-06-20T18:30:00+07:00",
    "guest_count": 4,
    "branch_id": 1,
    "note": "Can ban gan cua so"
  }'
```

Vi du response:

```json
{
  "data": {
    "id": 123,
    "customer_id": 45,
    "branch_id": 1,
    "branch_name": "Quan 1",
    "customer_name": "Nguyen Van A",
    "phone": "0901234567",
    "booking_time": "2026-06-20T11:30:00.000Z",
    "guest_count": 4,
    "note": "Can ban gan cua so",
    "status": "PENDING",
    "actual_guest_count": null,
    "check_in_at": null,
    "check_out_at": null,
    "assigned_tables": []
  }
}
```

## Response va loi
Thanh cong:

```json
{
  "data": {}
}
```

Loi:

```json
{
  "error": {
    "message": "Thong bao loi"
  }
}
```

Status code thuong gap:

| Code | Y nghia |
| --- | --- |
| `200` | Doc du lieu thanh cong |
| `201` | Tao booking thanh cong |
| `400` | Payload khong hop le |
| `403` | Domain chua duoc phep hoac API key khong hop le |
| `404` | Khong tim thay route/tai nguyen |
| `409` | Xung dot nghiep vu |
| `500` | Loi may chu |

## Form dat ban WordPress nen hien thi
| Field UI | Field gui API | Type | Bat buoc | Ghi chu |
| --- | --- | --- | --- | --- |
| Ho ten | `customer_name` | text | Co | Trim, khong de rong |
| So dien thoai | `phone` | tel/text | Co | Trim, khong de rong |
| Chi nhanh | `branch_id` | select | Co | Lay tu `/api/public/branches` |
| Ngay dat | Gop vao `booking_time` | date | Co | Vi du `2026-06-20` |
| Gio dat | Gop vao `booking_time` | time/select | Co | Vi du `18:30` |
| So khach | `guest_count` | number | Co | So nguyen duong |
| Ghi chu | `note` | textarea | Khong | Gui string hoac `null` |

Cong thuc tao `booking_time` khuyen nghi:

```js
const bookingTime = `${bookingDate}T${bookingHour}:00+07:00`;
```

## Mau WordPress REST proxy khuyen nghi
Frontend WordPress goi endpoint WordPress. WordPress server-side goi sang booking API va giu API key an toan.

```php
<?php
/**
 * Plugin Name: Restaurant Booking Public API Proxy
 */

define('RESTAURANT_BOOKING_API_BASE', 'https://booking.example.com');
define('RESTAURANT_BOOKING_API_KEY', 'rb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');

add_action('rest_api_init', function () {
    register_rest_route('restaurant-booking/v1', '/branches', array(
        'methods' => 'GET',
        'callback' => 'restaurant_booking_public_branches',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('restaurant-booking/v1', '/bookings', array(
        'methods' => 'POST',
        'callback' => 'restaurant_booking_create_booking',
        'permission_callback' => '__return_true',
    ));
});

function restaurant_booking_origin_header() {
    return home_url('', 'https');
}

function restaurant_booking_public_branches() {
    $response = wp_remote_get(RESTAURANT_BOOKING_API_BASE . '/api/public/branches', array(
        'timeout' => 15,
        'headers' => array(
            'Origin' => restaurant_booking_origin_header(),
        ),
    ));

    if (is_wp_error($response)) {
        return new WP_Error('restaurant_booking_api_error', $response->get_error_message(), array('status' => 502));
    }

    $status = wp_remote_retrieve_response_code($response);
    $data = json_decode(wp_remote_retrieve_body($response), true);

    if ($status < 200 || $status >= 300) {
        $message = $data['error']['message'] ?? 'Khong the lay danh sach chi nhanh.';
        return new WP_Error('restaurant_booking_api_rejected', $message, array('status' => $status));
    }

    return rest_ensure_response($data['data'] ?? array());
}

function restaurant_booking_create_booking(WP_REST_Request $request) {
    $payload = $request->get_json_params();

    $body = array(
        'customer_name' => sanitize_text_field($payload['customer_name'] ?? ''),
        'phone' => sanitize_text_field($payload['phone'] ?? ''),
        'booking_time' => sanitize_text_field($payload['booking_time'] ?? ''),
        'guest_count' => absint($payload['guest_count'] ?? 0),
        'branch_id' => absint($payload['branch_id'] ?? 0),
        'note' => sanitize_textarea_field($payload['note'] ?? '') ?: null,
    );

    if (!$body['customer_name'] || !$body['phone'] || !$body['booking_time'] || !$body['guest_count'] || !$body['branch_id']) {
        return new WP_Error('restaurant_booking_invalid_payload', 'Vui long nhap day du thong tin dat ban.', array('status' => 400));
    }

    $response = wp_remote_post(RESTAURANT_BOOKING_API_BASE . '/api/public/bookings', array(
        'timeout' => 15,
        'headers' => array(
            'Origin' => restaurant_booking_origin_header(),
            'Content-Type' => 'application/json',
            'X-Booking-Api-Key' => RESTAURANT_BOOKING_API_KEY,
        ),
        'body' => wp_json_encode($body),
    ));

    if (is_wp_error($response)) {
        return new WP_Error('restaurant_booking_api_error', $response->get_error_message(), array('status' => 502));
    }

    $status = wp_remote_retrieve_response_code($response);
    $data = json_decode(wp_remote_retrieve_body($response), true);

    if ($status < 200 || $status >= 300) {
        $message = $data['error']['message'] ?? 'Khong the tao yeu cau dat ban.';
        return new WP_Error('restaurant_booking_api_rejected', $message, array('status' => $status));
    }

    return rest_ensure_response(array(
        'success' => true,
        'booking' => $data['data'] ?? null,
    ));
}
```

## Mau HTML va JavaScript form
```html
<form id="restaurant-booking-form">
  <label>Ho ten <input name="customer_name" type="text" required autocomplete="name"></label>
  <label>So dien thoai <input name="phone" type="tel" required autocomplete="tel"></label>
  <label>Chi nhanh <select name="branch_id" required></select></label>
  <label>Ngay dat <input name="booking_date" type="date" required></label>
  <label>Gio dat <input name="booking_hour" type="time" required></label>
  <label>So khach <input name="guest_count" type="number" min="1" step="1" value="2" required></label>
  <label>Ghi chu <textarea name="note" rows="3"></textarea></label>
  <button type="submit">Dat ban</button>
  <p id="restaurant-booking-message" role="status"></p>
</form>

<script>
(async function () {
  const form = document.getElementById('restaurant-booking-form');
  const branchSelect = form.querySelector('[name="branch_id"]');
  const message = document.getElementById('restaurant-booking-message');

  const branches = await fetch('/wp-json/restaurant-booking/v1/branches').then((response) => response.json());
  branchSelect.innerHTML = branches
    .map((branch) => `<option value="${branch.id}">${branch.name}</option>`)
    .join('');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = {
      customer_name: values.customer_name,
      phone: values.phone,
      branch_id: Number(values.branch_id),
      booking_time: `${values.booking_date}T${values.booking_hour}:00+07:00`,
      guest_count: Number(values.guest_count),
      note: values.note || null
    };

    message.textContent = 'Dang gui yeu cau dat ban...';

    try {
      const response = await fetch('/wp-json/restaurant-booking/v1/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Khong the tao yeu cau dat ban');
      }

      form.reset();
      message.textContent = 'Da nhan yeu cau dat ban. Nhan vien se lien he xac nhan.';
    } catch (error) {
      message.textContent = error.message;
    }
  });
})();
</script>
```

## Internal API van giu nguyen
Dashboard noi bo van dung cookie session va cac endpoint cu:

```text
POST /api/bookings
GET /api/bookings
GET /api/bookings/:id
PUT /api/bookings/:id
DELETE /api/bookings/:id
POST /api/bookings/:id/assign
POST /api/bookings/:id/check-in
POST /api/bookings/:id/check-out
POST /api/bookings/:id/cancel
```

## Statuses
Booking statuses:

```text
PENDING
CONFIRMED
CANCELLED
NO_SHOW
CHECKED_IN
CHECKED_OUT
COMPLETED
```

Table statuses:

```text
AVAILABLE
RESERVED
OCCUPIED
BLOCKED
```

## Checklist tich hop WordPress
- Admin vao `API Settings` tao domain WordPress voi `allowed_origin` dung chinh xac, vi du `https://example.com`.
- Copy API key vua sinh va luu trong WordPress server-side.
- WordPress form doc chi nhanh qua `/wp-json/restaurant-booking/v1/branches`.
- WordPress tao booking qua `/wp-json/restaurant-booking/v1/bookings`.
- WordPress server-side gui request sang `POST /api/public/bookings` voi `Origin` va `X-Booking-Api-Key`.
- Form gui `booking_time` kem timezone `+07:00` de tranh lech gio.
- Sau khi submit, dashboard noi bo se nhan booking moi status `PENDING`.

## Socket.IO events lien quan
Khi public API tao booking thanh cong, app broadcast:

```text
booking_created
```

Dashboard noi bo con su dung cac events khac:

```text
booking_updated
booking_cancelled
booking_assigned
booking_checked_in
booking_checked_out
staff_online
staff_offline
```
