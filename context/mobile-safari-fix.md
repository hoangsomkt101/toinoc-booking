# TASK: Fix Mobile Safari Viewport & Bottom Navigation Overlap

## Project Context

Ứng dụng là hệ thống booking nhà hàng/quán nhậu.

Stack:

- Node.js
- Express
- Handlebars (HBS)
- Bootstrap 5
- Mobile First UI
- Chủ yếu sử dụng trên iPhone Safari

## Current Problem

### Issue 1

Bottom navigation đang sử dụng:

```css
position: fixed;
bottom: 0;
```

Trên iPhone Safari, khi thanh địa chỉ (address bar) hiển thị ở dưới:

- Bottom navigation bị Safari che một phần.
- Người dùng khó bấm menu.

### Issue 2

Khi người dùng scroll:

- Safari thay đổi viewport động.
- Header bị che hoặc nhảy vị trí.
- Nội dung bị lệch.

### Issue 3

Một số màn hình đang dùng:

```css
height: 100vh;
```

Điều này gây lỗi trên iOS Safari vì:

- 100vh không phản ánh viewport thực tế.
- Safari thay đổi chiều cao khi address bar ẩn/hiện.

---

# Requirements

## 1. Safe Area Support

Thêm hỗ trợ:

```css
env(safe-area-inset-top)
env(safe-area-inset-bottom)
```

Cho:

- Header
- Bottom Navigation

---

## 2. Dynamic Viewport

Thay thế:

```css
100vh
```

bằng:

```css
100dvh
```

hoặc:

```css
min-height: 100dvh
```

ở tất cả màn hình mobile.

---

## 3. Header

Ưu tiên:

```css
position: sticky;
top: 0;
```

thay vì:

```css
position: fixed;
```

nếu không có yêu cầu đặc biệt.

Lý do:

- Safari xử lý sticky ổn định hơn.
- Tránh hiện tượng header nhảy khi address bar co giãn.

---

## 4. Bottom Navigation

Bottom nav phải:

```css
position: fixed;
left: 0;
right: 0;
bottom: 0;
padding-bottom: env(safe-area-inset-bottom);
z-index: 1030;
```

---

## 5. Main Content

Nội dung phải luôn chừa khoảng cho bottom nav.

Ví dụ:

```css
padding-bottom: calc(
  var(--bottom-nav-height) +
  env(safe-area-inset-bottom)
);
```

---

## 6. Viewport Meta

Đảm bảo layout chính có:

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover"
/>
```

---

# Expected Result

Trên iPhone Safari:

- Bottom menu luôn hiển thị đầy đủ.
- Không bị thanh địa chỉ che.
- Header không bị nhảy khi scroll.
- Danh sách booking không bị khuất bởi bottom nav.
- Hoạt động ổn định trên iOS Safari mới nhất.

---

# Refactor Rules

1. Không thay đổi giao diện hiện tại.
2. Không thay đổi logic booking.
3. Chỉ sửa CSS/Layout liên quan viewport.
4. Ưu tiên Bootstrap-compatible.
5. Không dùng JavaScript hack viewport nếu CSS giải quyết được.
6. Nếu phát hiện `100vh`, đề xuất thay bằng `100dvh`.
