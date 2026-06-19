(function dashboardApp() {
  const events = [
    'booking_created',
    'booking_updated',
    'booking_cancelled',
    'booking_assigned',
    'booking_checked_in',
    'booking_checked_out',
    'table_assignment_changed'
  ];

  const state = {
    user: window.__CURRENT_USER__ || {},
    dashboard: window.__DASHBOARD__ || {},
    bookings: window.__BOOKINGS__ || [],
    apiClients: window.__API_CLIENTS__ || [],
    sheetTargets: window.__SHEET_TARGETS__ || [],
    users: window.__USERS__ || [],
    branches: window.__BRANCHES__ || [],
    onlineUsers: window.__ONLINE_USERS__ || []
  };
  const roleLevels = {
    sale: 1,
    manager: 2,
    admin: 3
  };
  const roleLabels = {
    admin: 'Quản trị viên',
    manager: 'Quản lý',
    sale: 'Nhân viên kinh doanh'
  };
  const bookingStatusLabels = {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    CANCELLED: 'Đã hủy',
    NO_SHOW: 'Khách không đến',
    CHECKED_IN: 'Đã nhận bàn',
    CHECKED_OUT: 'Đã trả bàn',
    COMPLETED: 'Hoàn tất'
  };
  const selectors = {
    openBookings: document.getElementById('open-booking-list'),
    closedBookings: document.getElementById('closed-booking-list'),
    formMessage: document.getElementById('form-message'),
    bookingBranch: document.querySelector('[data-booking-branch]'),
    bookingBranchGrid: document.getElementById('booking-branch-grid'),
    bookingPopup: document.querySelector('[data-booking-popup]'),
    bookingPopupPanel: document.querySelector('[data-booking-popup-panel]'),
    onlineUsers: document.getElementById('online-users-list'),
    onlineCount: document.getElementById('online-count'),
    branchScope: document.querySelector('[data-branch-scope]'),
    dashboardDateControls: document.querySelector('[data-dashboard-date-controls]'),
    dashboardDateFilter: document.querySelector('[data-dashboard-date-filter]'),
    branchList: document.getElementById('branch-list'),
    branchFormMessage: document.getElementById('branch-form-message'),
    branchAreaInputs: document.getElementById('branch-area-inputs'),
    apiClientList: document.getElementById('api-client-list'),
    apiClientFormMessage: document.getElementById('api-client-form-message'),
    sheetTargetList: document.getElementById('sheet-target-list'),
    sheetTargetFormMessage: document.getElementById('sheet-target-form-message'),
    userList: document.getElementById('user-list'),
    userFormMessage: document.getElementById('user-form-message')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function can(minimumRole) {
    return roleLevels[state.user.role] >= roleLevels[minimumRole];
  }

  function canCreateBooking() {
    return can('sale');
  }

  function canManageBookings() {
    return can('manager');
  }

  function canManageUsers() {
    return state.user.role === 'admin';
  }

  function canManageBranches() {
    return state.user.role === 'admin';
  }

  function formatDateTime(value) {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function formatBookingHour(value) {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function phoneSuffix(value) {
    const suffix = String(value ?? '').replace(/\D/g, '').slice(-3);
    return suffix || '-';
  }

  function branchIdFromUrl() {
    const branchId = new URLSearchParams(window.location.search).get('branch_id') || '';

    if (branchId && state.branches.some((branch) => String(branch.id) === String(branchId))) {
      return branchId;
    }

    return window.__SELECTED_BRANCH_ID__ || branchId;
  }

  function isDateValue(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function dashboardBookingDateFromUrl() {
    const dateValue = new URLSearchParams(window.location.search).get('booking_date') || window.__SELECTED_BOOKING_DATE__ || todayDateValue();

    return isDateValue(dateValue) ? dateValue : todayDateValue();
  }

  function roleLabel(role) {
    return roleLabels[role] || role;
  }

  function bookingStatusLabel(status) {
    return bookingStatusLabels[status] || status;
  }

  function formatDateTimeLocal(value) {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function todayDateValue() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60 * 1000;

    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function dateOffsetValue(offsetDays) {
    const date = new Date();
    date.setDate(date.getDate() + Number(offsetDays || 0));
    const offset = date.getTimezoneOffset() * 60 * 1000;

    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function bookingDateTimeValue(dateValue, timeSlot) {
    if (!dateValue || !timeSlot) {
      return '';
    }

    if (timeSlot === '24:00') {
      const date = new Date(`${dateValue}T00:00`);
      date.setDate(date.getDate() + 1);
      return `${formatDateTimeLocal(date).slice(0, 10)}T00:00`;
    }

    return `${dateValue}T${timeSlot}`;
  }

  function branchOptions(selectedId, includeEmpty = false) {
    const options = includeEmpty ? '<option value="">Không thuộc chi nhánh</option>' : '';
    return options + state.branches
      .map((branch) => `<option value="${escapeHtml(branch.id)}" ${String(branch.id) === String(selectedId || '') ? 'selected' : ''}>${escapeHtml(branch.name)}</option>`)
      .join('');
  }

  function sheetTargetTypeLabel(targetType) {
    return targetType === 'ALL' ? 'Sheet tổng' : 'Sheet chia chi nhánh';
  }

  function sheetTargetScopeLabel(targetType) {
    return targetType === 'ALL'
      ? 'Nhận tất cả booking vào Sheet tổng'
      : 'Nhận tất cả booking, Apps Script tự chia tab theo địa chỉ chi nhánh';
  }

  function sheetTargetTypeOptions(selectedType = '') {
    return ['ALL', 'BRANCH']
      .map((targetType) => {
        const alreadyConfigured = state.sheetTargets.some((target) => target.target_type === targetType && target.target_type !== selectedType);
        return `<option value="${targetType}" ${targetType === selectedType ? 'selected' : ''} ${alreadyConfigured ? 'disabled' : ''}>${escapeHtml(sheetTargetTypeLabel(targetType))}${alreadyConfigured ? ' - đã cấu hình' : ''}</option>`;
      })
      .join('');
  }

  function syncSheetTargetTypeOptions(scope = document) {
    for (const typeSelect of scope.querySelectorAll('[data-sheet-target-type]')) {
      const currentType = typeSelect.dataset.currentSheetTargetType || '';
      const preferredType = typeSelect.value;
      typeSelect.innerHTML = sheetTargetTypeOptions(currentType);

      const preferredOption = Array.from(typeSelect.options).find((option) => option.value === preferredType && !option.disabled);
      if (preferredOption) {
        typeSelect.value = preferredType;
      } else {
        const firstAvailableOption = Array.from(typeSelect.options).find((option) => !option.disabled);
        typeSelect.value = firstAvailableOption ? firstAvailableOption.value : '';
      }

      const submitButton = typeSelect.closest('form')?.querySelector('[type="submit"]');
      if (submitButton) {
        submitButton.disabled = !typeSelect.value;
      }
    }
  }

  function roleOptions(selectedRole) {
    const roles = canManageUsers() ? ['admin', 'manager', 'sale'] : [];
    return roles
      .map((role) => `<option value="${role}" ${role === selectedRole ? 'selected' : ''}>${escapeHtml(roleLabel(role))}</option>`)
      .join('');
  }

  function selectedBranchId() {
    if (selectors.branchScope) {
      return selectors.branchScope.value;
    }

    if (selectors.bookingBranch) {
      return selectors.bookingBranch.value;
    }

    return branchIdFromUrl();
  }

  function selectedDashboardBookingDate() {
    if (selectors.dashboardDateFilter) {
      return selectors.dashboardDateFilter.value || dashboardBookingDateFromUrl();
    }

    return dashboardBookingDateFromUrl();
  }

  function dashboardQuery() {
    const params = new URLSearchParams();
    const branchId = selectedBranchId();

    if (branchId) {
      params.set('branch_id', branchId);
    }

    if (window.__DASHBOARD_SECTION__ === 'bookings') {
      const bookingDate = selectedDashboardBookingDate();
      if (bookingDate) {
        params.set('booking_date', bookingDate);
      }
    }

    const query = params.toString();

    return query ? `?${query}` : '';
  }

  function scopedPath(path) {
    return `${path}${dashboardQuery()}`;
  }

  function setBranchSelectValue(select, value) {
    if (!select) {
      return;
    }

    if (!select.options) {
      const fallback = state.branches.length ? String(state.branches[0].id) : '';
      const nextValue = value && state.branches.some((branch) => String(branch.id) === String(value))
        ? String(value)
        : select.value || fallback;
      select.value = nextValue;
      updateBookingBranchChoices(nextValue);
      return;
    }

    if (value && [...select.options].some((option) => option.value === value)) {
      select.value = value;
      return;
    }

    select.value = select.options.length ? select.options[0].value : '';
  }

  function replaceBranchOptions(select, { includeTotal = false } = {}) {
    if (!select) {
      return;
    }

    if (!select.options) {
      setBranchSelectValue(select, select.value || branchIdFromUrl());
      return;
    }

    const currentValue = select.value;
    const firstOption = includeTotal
      ? '<option value="">Toàn hệ thống - tất cả chi nhánh</option>'
      : '';
    select.innerHTML = firstOption + state.branches
      .map((branch) => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`)
      .join('');
    setBranchSelectValue(select, currentValue || branchIdFromUrl());
  }

  function refreshBranchSelects() {
    replaceBranchOptions(selectors.branchScope, { includeTotal: canManageBranches() });
    replaceBranchOptions(selectors.bookingBranch);
    renderBookingBranchChoices();
  }

  function syncBranchControls() {
    const branchId = branchIdFromUrl();

    setBranchSelectValue(selectors.branchScope, branchId);
    setBranchSelectValue(selectors.bookingBranch, branchId);
  }

  function syncBookingDateControls() {
    const dateInput = document.getElementById('booking-date');

    if (!dateInput) {
      return;
    }

    const today = todayDateValue();
    dateInput.min = today;
    if (!dateInput.value) {
      dateInput.value = today;
    }
    updateBookingDateChips(dateInput.value);
  }

  function updateBookingDateChips(value) {
    for (const button of document.querySelectorAll('#create-booking-form [data-date-offset]')) {
      button.classList.toggle('active', dateOffsetValue(button.dataset.dateOffset) === value);
    }
  }

  function updateDashboardDateChips(value) {
    for (const button of document.querySelectorAll('[data-dashboard-date-offset]')) {
      button.classList.toggle('active', dateOffsetValue(button.dataset.dashboardDateOffset) === value);
    }
  }

  function syncDashboardDateControls() {
    if (!selectors.dashboardDateFilter) {
      return;
    }

    const dateValue = selectedDashboardBookingDate();
    selectors.dashboardDateFilter.value = dateValue;
    updateDashboardDateChips(dateValue);
  }

  function applyDashboardDateFilter(value) {
    const dateValue = isDateValue(value) ? value : todayDateValue();
    const url = new URL(window.location.href);

    url.searchParams.set('booking_date', dateValue);
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  }

  function setBookingDateValue(value) {
    const dateInput = document.getElementById('booking-date');

    if (!dateInput) {
      return;
    }

    dateInput.value = value;
    updateBookingDateChips(value);
  }

  function updateBookingBranchChoices(value) {
    for (const button of document.querySelectorAll('[data-branch-choice]')) {
      button.classList.toggle('active', String(button.dataset.branchChoice) === String(value || ''));
    }
  }

  function renderBookingBranchChoices() {
    if (!selectors.bookingBranchGrid) {
      return;
    }

    selectors.bookingBranchGrid.innerHTML = state.branches
      .map(
        (branch) => `
          <button class="booking-choice-card" type="button" data-branch-choice="${escapeHtml(branch.id)}">
            <span class="booking-choice-name">${escapeHtml(branch.name)}</span>
            <span class="booking-choice-sub">${escapeHtml(branch.address || 'Chưa có địa chỉ')}</span>
          </button>
        `
      )
      .join('');
    updateBookingBranchChoices(selectors.bookingBranch?.value);
  }

  function setBookingTimeSlot(value) {
    const input = document.getElementById('booking-time-slot');

    if (input) {
      input.value = value || '';
    }

    for (const button of document.querySelectorAll('[data-time-choice]')) {
      button.classList.toggle('active', button.dataset.timeChoice === value);
    }
  }

  function setGuestCount(value) {
    const input = document.querySelector('[data-guest-count]');
    const display = document.getElementById('booking-guest-display');
    const nextValue = Math.min(50, Math.max(1, Number(value) || 1));

    if (input) {
      input.value = String(nextValue);
    }

    if (display) {
      display.textContent = String(nextValue);
    }
  }

  function openBookingPopup() {
    if (!selectors.bookingPopup) {
      return;
    }

    selectors.bookingPopup.hidden = false;
    selectors.bookingPopup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('booking-popup-open');
    if (selectors.formMessage) {
      selectors.formMessage.textContent = '';
    }
    syncBookingDateControls();
    setBranchSelectValue(selectors.bookingBranch, selectedBranchId());
    window.requestAnimationFrame(() => selectors.bookingPopupPanel?.focus());
  }

  function closeBookingPopup() {
    if (!selectors.bookingPopup) {
      return;
    }

    selectors.bookingPopup.hidden = true;
    selectors.bookingPopup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('booking-popup-open');
  }

  function visibleBranches() {
    const branchId = selectedBranchId();

    if (!branchId) {
      return state.branches;
    }

    return state.branches.filter((branch) => String(branch.id) === String(branchId));
  }

  function allBookings() {
    if (state.bookings.length) {
      return state.bookings;
    }

    const dashboard = state.dashboard;
    const bookings = [
      ...(dashboard.open_bookings || []),
      ...(dashboard.closed_bookings || [])
    ];
    const byId = new Map();

    for (const booking of bookings) {
      byId.set(String(booking.id), booking);
    }

    return [...byId.values()];
  }

  function findBooking(id) {
    return allBookings().find((booking) => String(booking.id) === String(id));
  }

  function tableOptions(booking) {
    const available = (state.dashboard.available_tables || []).filter(
      (table) => String(table.branch_id) === String(booking.branch_id)
    );
    const assigned = booking.assigned_tables || [];
    const byId = new Map();

    for (const table of [...assigned, ...available]) {
      byId.set(String(table.id), table);
    }

    return [...byId.values()]
      .map((table) => {
        const selected = assigned.some((assignedTable) => String(assignedTable.id) === String(table.id)) ? 'selected' : '';
        const label = `${table.table_code} - ${table.area_name} (${table.capacity})`;
        return `<option value="${escapeHtml(table.id)}" ${selected}>${escapeHtml(label)}</option>`;
      })
      .join('');
  }

  function actionButtons(booking) {
    const buttons = [];

    if (['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status) && canManageBookings()) {
      buttons.push(`
        <details class="booking-control booking-assign-panel">
          <summary class="btn btn-outline-secondary btn-sm booking-action-btn">Xếp bàn</summary>
          <div class="booking-panel-body">
            <select class="form-select form-select-sm table-select" data-table-select="${escapeHtml(booking.id)}" multiple aria-label="Chọn bàn">${tableOptions(booking)}</select>
            <button class="btn btn-warning btn-sm fw-bold booking-action-btn" data-action="assign">Lưu bàn</button>
          </div>
        </details>
      `);
    }

    if (booking.status === 'PENDING' && canManageBookings()) {
      buttons.push('<button class="btn btn-warning btn-sm fw-bold booking-action-btn" data-action="confirm">Xác nhận</button>');
      buttons.push('<button class="btn btn-outline-danger btn-sm fw-bold booking-action-btn" data-action="cancel">Hủy</button>');
    }

    if (booking.status === 'CONFIRMED' && canManageBookings()) {
      buttons.push('<button class="btn btn-success btn-sm fw-bold booking-action-btn" data-action="check-in">Check-in</button>');
      buttons.push('<button class="btn btn-outline-danger btn-sm fw-bold booking-action-btn" data-action="cancel">Hủy</button>');
    }

    if (booking.status === 'CHECKED_IN' && canManageBookings()) {
      buttons.push('<button class="btn btn-warning btn-sm fw-bold booking-action-btn" data-action="check-out">Check-out</button>');
    }

    if (booking.status === 'CHECKED_OUT' && canManageBookings()) {
      buttons.push('<button class="btn btn-success btn-sm fw-bold booking-action-btn" data-action="complete">Hoàn tất</button>');
    }

    return buttons.join('');
  }

  function bookingManagement(booking) {
    if (!canManageBookings() || booking.status === 'COMPLETED') {
      return '';
    }

    return `
      <details class="booking-control booking-edit-panel">
        <summary class="btn btn-outline-secondary btn-sm booking-action-btn">Chỉnh sửa</summary>
        <form class="row g-2 mt-2 border rounded-3 p-3 bg-body-tertiary" data-booking-update="${escapeHtml(booking.id)}">
          <div class="col-12 col-sm-6">
            <label class="form-label fw-semibold small">Tên khách hàng</label>
            <input class="form-control" name="customer_name" value="${escapeHtml(booking.customer_name)}" required>
          </div>
          <div class="col-12 col-sm-6">
            <label class="form-label fw-semibold small">Số điện thoại</label>
            <input class="form-control" name="phone" value="${escapeHtml(booking.phone)}" required>
          </div>
          <div class="col-12 col-sm-6">
            <label class="form-label fw-semibold small">Thời gian đặt bàn</label>
            <input class="form-control" name="booking_time" type="datetime-local" value="${escapeHtml(formatDateTimeLocal(booking.booking_time))}" required>
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label fw-semibold small">Số khách</label>
            <input class="form-control" name="guest_count" type="number" min="1" value="${escapeHtml(booking.guest_count)}" required>
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label fw-semibold small">Chi nhánh</label>
            <select class="form-select" name="branch_id" required>${branchOptions(booking.branch_id)}</select>
          </div>
          <div class="col-12">
            <label class="form-label fw-semibold small">Ghi chú</label>
            <textarea class="form-control" name="note" rows="2">${escapeHtml(booking.note || '')}</textarea>
          </div>
          <div class="col-6 d-grid">
            <button class="btn btn-warning fw-bold" type="submit">Lưu thay đổi</button>
          </div>
          <div class="col-6 d-grid">
            <button class="btn btn-outline-danger" type="button" data-delete-booking="${escapeHtml(booking.id)}" data-booking-name="${escapeHtml(booking.customer_name)}">Xóa đặt bàn</button>
          </div>
        </form>
      </details>
    `;
  }

  function renderBooking(booking) {
    const tables = (booking.assigned_tables || []).map((table) => table.table_code).join(', ') || 'Chưa xếp bàn';
    const controls = `${bookingManagement(booking)}${actionButtons(booking)}`;

    return `
      <article class="card booking-card" data-booking-id="${escapeHtml(booking.id)}">
        <div class="card-body booking-card-body">
          <div class="booking-card-main">
            <div class="booking-summary-line" title="${escapeHtml(formatDateTime(booking.booking_time))} - ${escapeHtml(booking.customer_name)} - ${escapeHtml(phoneSuffix(booking.phone))} - ${escapeHtml(booking.guest_count)}K - ${escapeHtml(bookingStatusLabel(booking.status))}">
              <span class="booking-time">${escapeHtml(formatBookingHour(booking.booking_time))}</span>
              <span class="booking-separator">-</span>
              <strong class="booking-customer">${escapeHtml(booking.customer_name)}</strong>
              <span class="booking-separator">-</span>
              <span>${escapeHtml(phoneSuffix(booking.phone))}</span>
              <span class="booking-separator">-</span>
              <span class="booking-guest-count">${escapeHtml(booking.guest_count)}K</span>
              <span class="booking-separator">-</span>
              <span class="badge rounded-pill status-pill booking-status-pill status-${escapeHtml(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>
            </div>
          </div>
          <div class="action-row">
            <span class="booking-tables" title="B ${escapeHtml(tables)}">B ${escapeHtml(tables)}</span>
            ${controls}
          </div>
        </div>
      </article>
    `;
  }

  function renderBookings(element, bookings) {
    if (!element) {
      return;
    }

    element.innerHTML = bookings.length
      ? bookings.map(renderBooking).join('')
      : '<div class="alert alert-light border mb-0">Không có yêu cầu đặt bàn trong mục này.</div>';
  }

  function renderCounts() {
    const counts = state.dashboard.counts || {};
    const countToday = document.getElementById('count-today');
    const countAvailableTables = document.getElementById('count-available-tables');
    const countOccupiedTables = document.getElementById('count-occupied-tables');

    if (countToday) {
      countToday.textContent = counts.today_bookings || 0;
    }

    if (countAvailableTables) {
      countAvailableTables.textContent = counts.available_tables || 0;
    }

    if (countOccupiedTables) {
      countOccupiedTables.textContent = counts.occupied_tables || 0;
    }
  }

  function renderOnlineUsers() {
    if (!selectors.onlineUsers || !selectors.onlineCount) {
      return;
    }

    selectors.onlineCount.textContent = state.onlineUsers.length;
    selectors.onlineUsers.innerHTML = state.onlineUsers.length
      ? state.onlineUsers
          .map(
            (user) => `
               <article class="d-flex align-items-center gap-2 border rounded-3 p-3 bg-body">
                 <span class="online-dot flex-shrink-0" aria-hidden="true"></span>
                 <div>
                   <strong class="d-block">${escapeHtml(user.display_name)}</strong>
                   <span class="small text-body-secondary">@${escapeHtml(user.username)} · ${escapeHtml(roleLabel(user.role))}</span>
                </div>
              </article>
            `
          )
          .join('')
      : '<div class="alert alert-light border mb-0">Không có người dùng trực tuyến.</div>';
  }

  function renderUsers() {
    if (!selectors.userList) {
      return;
    }

    if (!state.users.length) {
      selectors.userList.innerHTML = '<div class="alert alert-light border mb-0">Không có tài khoản nào có thể quản lý.</div>';
      return;
    }

    const rows = state.users
      .map((user) => {
        const branch = state.branches.find((item) => String(item.id) === String(user.branch_id));
        const isSelf = String(user.id) === String(state.user.id);
        const userId = escapeHtml(user.id);
        return `
          <tr class="user-table-row">
            <td class="user-name-cell">
              <strong class="d-block text-gray-800">${escapeHtml(user.display_name)}</strong>
              ${isSelf ? '<span class="small text-body-secondary">Tài khoản của bạn</span>' : ''}
            </td>
            <td><span class="user-username">@${escapeHtml(user.username)}</span></td>
            <td><span class="badge rounded-pill text-bg-warning">${escapeHtml(roleLabel(user.role))}</span></td>
            <td>${escapeHtml(branch ? branch.name : 'Không thuộc chi nhánh')}</td>
            <td><span class="badge ${user.is_active ? 'text-bg-success' : 'text-bg-secondary'}">${user.is_active ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</span></td>
            <td class="text-nowrap">${escapeHtml(formatDateTime(user.last_login_at))}</td>
            <td class="text-nowrap">
              <div class="d-flex gap-2">
                <button class="btn btn-outline-secondary btn-sm" type="button" data-toggle-user-edit="${userId}" aria-expanded="false" aria-controls="user-edit-${userId}">Chỉnh sửa</button>
                <button class="btn btn-outline-danger btn-sm" type="button" data-delete-user="${userId}" data-user-name="${escapeHtml(user.display_name)}" ${isSelf ? 'disabled' : ''}>Xóa</button>
              </div>
            </td>
          </tr>
          <tr class="user-edit-row" id="user-edit-${userId}" data-user-edit-row="${userId}" hidden>
            <td colspan="7">
              <form class="row g-3 user-edit-form" data-user-update="${userId}">
                <div class="col-12 col-md-6 col-xl-3">
                  <label class="form-label fw-semibold small">Tên đăng nhập</label>
                  <input class="form-control" name="username" value="${escapeHtml(user.username)}" minlength="3" maxlength="50" required>
                </div>
                <div class="col-12 col-md-6 col-xl-3">
                  <label class="form-label fw-semibold small">Tên hiển thị</label>
                  <input class="form-control" name="display_name" value="${escapeHtml(user.display_name)}" maxlength="120" required>
                </div>
                <div class="col-6 col-md-4 col-xl-2">
                  <label class="form-label fw-semibold small">Vai trò</label>
                  <select class="form-select" name="role">${roleOptions(user.role)}</select>
                </div>
                ${canManageUsers() ? `
                  <div class="col-6 col-md-4 col-xl-2">
                    <label class="form-label fw-semibold small">Chi nhánh</label>
                    <select class="form-select" name="branch_id">${branchOptions(user.branch_id, true)}</select>
                  </div>
                ` : ''}
                <div class="col-12 col-md-4 col-xl-2">
                  <label class="form-label fw-semibold small">Mật khẩu mới</label>
                  <input class="form-control" name="password" type="password" minlength="6" placeholder="Giữ nguyên nếu trống">
                </div>
                <div class="col-12 d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
                  <div class="form-check mb-0">
                    <input class="form-check-input" name="is_active" type="checkbox" value="true" id="user-active-${userId}" ${user.is_active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}>
                    ${isSelf ? '<input name="is_active" type="hidden" value="true">' : ''}
                    <label class="form-check-label" for="user-active-${userId}">Tài khoản hoạt động</label>
                  </div>
                  <button class="btn btn-warning fw-bold" type="submit">Lưu thay đổi</button>
                </div>
              </form>
            </td>
          </tr>
        `;
      })
      .join('');

    selectors.userList.innerHTML = `
      <div class="table-responsive user-table-wrap">
        <table class="table table-bordered table-hover align-middle mb-0 user-table" width="100%" cellspacing="0">
          <caption class="visually-hidden">Danh sách tài khoản người dùng</caption>
          <thead>
            <tr>
              <th scope="col">Người dùng</th>
              <th scope="col">Tên đăng nhập</th>
              <th scope="col">Vai trò</th>
              <th scope="col">Chi nhánh</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Đăng nhập gần nhất</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderApiClients() {
    if (!selectors.apiClientList) {
      return;
    }

    if (!state.apiClients.length) {
      selectors.apiClientList.innerHTML = '<div class="alert alert-light border mb-0">Chưa có domain nào được phép dùng public booking API.</div>';
      return;
    }

    const rows = state.apiClients
      .map((client) => {
        const clientId = escapeHtml(client.id);
        return `
          <article class="border rounded-4 p-3 bg-body mb-3 api-client-card" data-api-client-id="${clientId}">
            <div class="d-flex flex-column flex-lg-row align-items-lg-start justify-content-lg-between gap-3">
              <div class="min-w-0">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <strong class="text-gray-800">${escapeHtml(client.name)}</strong>
                  <span class="badge ${client.is_active ? 'text-bg-success' : 'text-bg-secondary'}">${client.is_active ? 'Đang bật' : 'Đã tắt'}</span>
                </div>
                <div class="small text-body-secondary text-break">Domain: <code>${escapeHtml(client.allowed_origin)}</code></div>
                <div class="small text-body-secondary">Key prefix: <code>${escapeHtml(client.api_key_prefix)}...</code></div>
                <div class="small text-body-secondary">Dùng gần nhất: ${escapeHtml(formatDateTime(client.last_used_at))}</div>
              </div>
              <div class="d-grid d-sm-flex gap-2 flex-shrink-0">
                <button class="btn btn-outline-secondary btn-sm" type="button" data-rotate-api-client-key="${clientId}">Xoay key</button>
                <button class="btn btn-outline-danger btn-sm" type="button" data-delete-api-client="${clientId}" data-api-client-name="${escapeHtml(client.name)}">Xóa</button>
              </div>
            </div>
            <details class="mt-3">
              <summary class="btn btn-outline-secondary btn-sm">Chỉnh sửa</summary>
              <form class="row g-3 border rounded-3 p-3 mt-2 bg-body-tertiary" data-api-client-update="${clientId}">
                <div class="col-12 col-md-4">
                  <label class="form-label fw-semibold small">Tên cấu hình</label>
                  <input class="form-control" name="name" maxlength="120" value="${escapeHtml(client.name)}" required>
                </div>
                <div class="col-12 col-md-5">
                  <label class="form-label fw-semibold small">Domain được phép</label>
                  <input class="form-control" name="allowed_origin" value="${escapeHtml(client.allowed_origin)}" required>
                </div>
                <div class="col-12 col-md-3 d-grid align-self-end">
                  <button class="btn btn-warning fw-bold" type="submit">Lưu thay đổi</button>
                </div>
                <div class="col-12">
                  <div class="form-check">
                    <input class="form-check-input" name="is_active" type="checkbox" value="true" id="api-client-active-${clientId}" ${client.is_active ? 'checked' : ''}>
                    <label class="form-check-label" for="api-client-active-${clientId}">Cho phép hoạt động</label>
                  </div>
                </div>
              </form>
            </details>
          </article>
        `;
      })
      .join('');

    selectors.apiClientList.innerHTML = rows;
  }

  function renderSheetTargets() {
    if (!selectors.sheetTargetList) {
      return;
    }

    if (!state.sheetTargets.length) {
      selectors.sheetTargetList.innerHTML = '<div class="alert alert-light border mb-0">Chưa có link Sheet nào để đồng bộ booking.</div>';
      return;
    }

    selectors.sheetTargetList.innerHTML = state.sheetTargets
      .map((target) => {
        const targetId = escapeHtml(target.id);
        return `
          <article class="border rounded-4 p-3 bg-body mb-3 api-client-card sheet-target-card" data-sheet-target-id="${targetId}">
            <div class="d-flex flex-column flex-lg-row align-items-lg-start justify-content-lg-between gap-3">
              <div class="min-w-0">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <strong class="text-gray-800">${escapeHtml(target.name)}</strong>
                  <span class="badge text-bg-warning">${escapeHtml(sheetTargetTypeLabel(target.target_type))}</span>
                  <span class="badge ${target.is_active ? 'text-bg-success' : 'text-bg-secondary'}">${target.is_active ? 'Đang bật' : 'Đã tắt'}</span>
                </div>
                <div class="small text-body-secondary">Phạm vi: ${escapeHtml(sheetTargetScopeLabel(target.target_type))}</div>
                <div class="small text-body-secondary text-break">Apps Script: <code>${escapeHtml(target.webhook_url)}</code></div>
                <div class="small text-body-secondary">Đồng bộ gần nhất: ${escapeHtml(formatDateTime(target.last_sync_at))}</div>
                ${target.last_error ? `<div class="small text-danger text-break">Lỗi gần nhất: ${escapeHtml(target.last_error)}</div>` : ''}
              </div>
              <div class="d-grid d-sm-flex gap-2 flex-shrink-0">
                <button class="btn btn-outline-danger btn-sm" type="button" data-delete-sheet-target="${targetId}" data-sheet-target-name="${escapeHtml(target.name)}">Xóa</button>
              </div>
            </div>
            <details class="mt-3">
              <summary class="btn btn-outline-secondary btn-sm">Chỉnh sửa</summary>
              <form class="row g-3 border rounded-3 p-3 mt-2 bg-body-tertiary" data-sheet-target-update="${targetId}">
                <div class="col-12 col-md-4">
                  <label class="form-label fw-semibold small">Tên cấu hình</label>
                  <input class="form-control" name="name" maxlength="120" value="${escapeHtml(target.name)}" required>
                </div>
                <div class="col-12 col-md-3">
                  <label class="form-label fw-semibold small">Loại Sheet</label>
                  <select class="form-select" name="target_type" data-sheet-target-type data-current-sheet-target-type="${escapeHtml(target.target_type)}">
                    ${sheetTargetTypeOptions(target.target_type)}
                  </select>
                </div>
                <div class="col-12 col-md-5">
                  <label class="form-label fw-semibold small">Link Apps Script</label>
                  <input class="form-control" name="webhook_url" value="${escapeHtml(target.webhook_url)}" required>
                </div>
                <div class="col-12 d-flex flex-column flex-md-row align-items-md-center justify-content-md-between gap-3">
                  <div class="form-check">
                    <input class="form-check-input" name="is_active" type="checkbox" value="true" id="sheet-target-active-${targetId}" ${target.is_active ? 'checked' : ''}>
                    <label class="form-check-label" for="sheet-target-active-${targetId}">Cho phép đồng bộ</label>
                  </div>
                  <button class="btn btn-warning fw-bold" type="submit">Lưu thay đổi</button>
                </div>
              </form>
            </details>
          </article>
        `;
      })
      .join('');
  }

  function renderBranches() {
    if (!selectors.branchList) {
      return;
    }

    const branches = visibleBranches();

    function branchDeleteReason(branch) {
      const reasons = [];
      if (branch.has_bookings) {
        reasons.push('có lịch sử đặt bàn');
      }
      if (branch.has_users || branch.has_staffs) {
        reasons.push('đang có tài khoản hoặc nhân viên');
      }

      return reasons.length ? `Không thể xóa vì chi nhánh ${reasons.join(' và ')}.` : '';
    }

    selectors.branchList.innerHTML = branches.length
      ? branches
          .map(
            (branch) => {
              const areas = branch.areas || [];
              const deleteReason = branchDeleteReason(branch);
              const areaSummary = areas.length
                ? areas
                    .map(
                      (area) => `
                        <li class="area-list-item">
                          <div class="area-list-summary">
                            <strong>${escapeHtml(area.name)}</strong>
                            <span class="area-list-separator">-</span>
                            <span class="area-list-count">${escapeHtml(area.table_count)} bàn</span>
                            <span class="area-list-separator">-</span>
                            <details class="area-edit-panel">
                              <summary class="btn btn-outline-secondary btn-sm">Sửa</summary>
                              <form class="area-edit-form border rounded-3 p-2 mt-2 bg-body-tertiary" data-area-update="${escapeHtml(area.id)}">
                                <div>
                                  <label class="form-label fw-semibold small">Tên khu vực</label>
                                  <input class="form-control" name="name" maxlength="120" value="${escapeHtml(area.name)}" required>
                                </div>
                                <div class="d-grid">
                                  <button class="btn btn-outline-secondary" type="submit">Lưu tên</button>
                                </div>
                                <div class="d-grid">
                                  <button class="btn btn-outline-danger" type="button" data-delete-area="${escapeHtml(area.id)}" data-area-name="${escapeHtml(area.name)}">Xóa</button>
                                </div>
                              </form>
                            </details>
                          </div>
                        </li>
                      `
                    )
                    .join('')
                : '<li class="area-list-item text-body-secondary small">Chưa cấu hình khu vực.</li>';
              const createAreaForm = canManageBranches()
                ? `
                    <details class="mt-3">
                      <summary class="btn btn-outline-secondary">Thêm khu vực</summary>
                      <form class="row g-2 align-items-end border rounded-3 p-3 mt-2 bg-body-tertiary" data-area-create data-branch-id="${escapeHtml(branch.id)}">
                        <div class="col-12 col-sm-6 col-xl">
                          <label class="form-label fw-semibold small">Tên khu vực</label>
                          <input class="form-control" name="name" maxlength="120" required>
                        </div>
                        <div class="col-6 col-sm-3 col-xl">
                          <label class="form-label fw-semibold small">Số bàn</label>
                          <input class="form-control" name="table_count" type="number" min="1" value="1" required>
                        </div>
                        <div class="col-6 col-sm-3 col-xl">
                          <label class="form-label fw-semibold small">Sức chứa</label>
                          <input class="form-control" name="capacity" type="number" min="1" value="4" required>
                        </div>
                        <div class="col-12 col-sm-8 col-xl">
                          <label class="form-label fw-semibold small">Tiền tố mã bàn</label>
                          <input class="form-control" name="table_prefix" maxlength="24">
                        </div>
                        <div class="col-12 col-sm-4 col-xl-auto d-grid">
                          <button class="btn btn-warning fw-bold" type="submit">Tạo khu vực</button>
                        </div>
                      </form>
                    </details>
                  `
                : '';
              const areaContent = canManageBranches()
                ? areaSummary
                : areas.length
                  ? areas.map((area) => `<li class="area-list-item"><div class="area-list-summary"><strong>${escapeHtml(area.name)}</strong><span class="area-list-separator">-</span><span class="area-list-count">${escapeHtml(area.table_count)} bàn</span></div></li>`).join('')
                  : areaSummary;
              const branchHeading = canManageBranches()
                ? `
                    <div class="min-w-0">
                      <strong class="d-block">${escapeHtml(branch.name)}</strong>
                      <span class="small text-body-secondary">${escapeHtml(branch.address || 'Chưa có địa chỉ')}</span>
                    </div>
                  `
                : `
                    <div class="min-w-0">
                      <strong class="d-block">${escapeHtml(branch.name)}</strong>
                      <span class="small text-body-secondary">${escapeHtml(branch.address || 'Chưa có địa chỉ')}</span>
                    </div>
                  `;
              const branchEditor = canManageBranches()
                ? `
                    <details class="mt-3">
                      <summary class="btn btn-outline-secondary">Chỉnh sửa</summary>
                      <form class="row g-2 border rounded-3 p-3 mt-2 bg-body-tertiary" data-branch-update="${escapeHtml(branch.id)}">
                        <div class="col-12">
                          <label class="form-label fw-semibold small">Tên chi nhánh</label>
                          <input class="form-control" name="name" value="${escapeHtml(branch.name)}" maxlength="120" required>
                        </div>
                        <div class="col-12">
                          <label class="form-label fw-semibold small">Địa chỉ</label>
                          <input class="form-control" name="address" value="${escapeHtml(branch.address || '')}" maxlength="255">
                        </div>
                        <div class="col-12">
                          <div class="d-grid gap-2 d-sm-flex">
                            <button class="btn btn-outline-secondary flex-sm-fill" type="submit">Lưu</button>
                            <button class="btn btn-outline-danger flex-sm-fill" type="button" data-delete-branch="${escapeHtml(branch.id)}" data-branch-name="${escapeHtml(branch.name)}" ${deleteReason ? `disabled title="${escapeHtml(deleteReason)}"` : ''}>Xóa</button>
                          </div>
                          ${deleteReason ? `<p class="small text-body-secondary mt-2 mb-0">${escapeHtml(deleteReason)}</p>` : ''}
                        </div>
                      </form>
                    </details>
                  `
                : '';

              return `
                <article class="branch-card border rounded-4 p-3 bg-body">
                  <div class="branch-card-header">
                    <div class="flex-grow-1 min-w-0">${branchHeading}</div>
                    <div class="branch-card-metrics">
                      <span class="badge rounded-pill text-bg-warning">${escapeHtml(branch.table_count || 0)} bàn</span>
                      <span class="small text-body-secondary">${escapeHtml(branch.area_count || 0)} khu vực</span>
                    </div>
                  </div>
                  ${branchEditor}
                  <ul class="area-list mt-3">${areaContent}</ul>
                  <div class="branch-card-actions">${createAreaForm}</div>
                </article>
              `;
            }
          )
          .join('')
      : '<div class="alert alert-light border mb-0">Không tìm thấy chi nhánh.</div>';
  }

  function addAreaInputRow(values = {}) {
    if (!selectors.branchAreaInputs) {
      return;
    }

    const row = document.createElement('div');
    row.className = 'area-input-row row g-2 align-items-end m-0 border rounded-3 p-2 bg-body';
    row.dataset.areaRow = '';
    row.innerHTML = `
      <div class="col-12 col-sm-6 col-xl">
        <label class="form-label fw-semibold small">Tên khu vực</label>
        <input class="form-control" data-area-field="name" maxlength="120" value="${escapeHtml(values.name || '')}" required>
      </div>
      <div class="col-6 col-sm-3 col-xl">
        <label class="form-label fw-semibold small">Số bàn</label>
        <input class="form-control" data-area-field="table_count" type="number" min="1" value="${escapeHtml(values.table_count || 1)}" required>
      </div>
      <div class="col-6 col-sm-3 col-xl">
        <label class="form-label fw-semibold small">Sức chứa</label>
        <input class="form-control" data-area-field="capacity" type="number" min="1" value="${escapeHtml(values.capacity || 4)}" required>
      </div>
      <div class="col-12 col-sm-8 col-xl">
        <label class="form-label fw-semibold small">Tiền tố mã bàn</label>
        <input class="form-control" data-area-field="table_prefix" maxlength="24" value="${escapeHtml(values.table_prefix || '')}">
      </div>
      <div class="col-12 col-sm-4 col-xl-auto d-grid">
        <button class="btn btn-outline-danger" type="button" data-remove-area>Xóa</button>
      </div>
    `;
    selectors.branchAreaInputs.appendChild(row);
  }

  function branchAreaPayload() {
    if (!selectors.branchAreaInputs) {
      return [];
    }

    return [...selectors.branchAreaInputs.querySelectorAll('[data-area-row]')].map((row) => {
      const fields = {};

      for (const input of row.querySelectorAll('[data-area-field]')) {
        fields[input.dataset.areaField] = input.value;
      }

      return fields;
    });
  }

  function render() {
    renderCounts();
    renderBookings(selectors.openBookings, state.dashboard.open_bookings || []);
    renderBookings(selectors.closedBookings, state.dashboard.closed_bookings || []);
    renderOnlineUsers();
    renderBranches();
    renderApiClients();
    renderSheetTargets();
    syncSheetTargetTypeOptions(document);
    renderUsers();
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        window.location.assign('/login');
        return undefined;
      }

      throw new Error(payload.error ? payload.error.message : 'Yêu cầu không thành công');
    }

    return payload.data;
  }

  async function refreshDashboard() {
    if (!canManageBookings()) {
      return;
    }

    const dashboard = await request(scopedPath('/api/dashboard'));
    state.dashboard = dashboard || state.dashboard;
    state.bookings = [];
    render();
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!canCreateBooking()) {
      selectors.formMessage.textContent = 'Bạn không có quyền tạo đặt bàn.';
      return;
    }

    selectors.formMessage.textContent = 'Đang tạo yêu cầu đặt bàn...';

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    data.booking_time = bookingDateTimeValue(data.booking_date, data.booking_time_slot);
    delete data.booking_date;
    delete data.booking_time_slot;

    if (!data.branch_id) {
      selectors.formMessage.textContent = 'Vui lòng chọn chi nhánh.';
      return;
    }

    if (!data.booking_time) {
      selectors.formMessage.textContent = 'Vui lòng chọn ngày và giờ đặt bàn.';
      return;
    }

    try {
      await request('/api/bookings', {
        method: 'POST',
        body: data
      });
      form.reset();
      syncBookingDateControls();
      setBranchSelectValue(selectors.bookingBranch, selectedBranchId());
      setBookingTimeSlot('');
      setGuestCount(2);
      selectors.formMessage.textContent = 'Đã tạo yêu cầu đặt bàn.';
      if (canManageBookings()) {
        await refreshDashboard();
      }
    } catch (error) {
      selectors.formMessage.textContent = error.message;
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    selectors.userFormMessage.textContent = 'Đang tạo tài khoản...';

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      await request('/api/users', { method: 'POST', body: data });
      state.users = await request('/api/users');
      form.reset();
      selectors.userFormMessage.textContent = 'Đã tạo tài khoản.';
      renderUsers();
    } catch (error) {
      selectors.userFormMessage.textContent = error.message;
    }
  }

  async function handleCreateBranch(event) {
    event.preventDefault();
    selectors.branchFormMessage.textContent = 'Đang tạo chi nhánh...';

    const form = event.currentTarget;
    const data = {
      ...Object.fromEntries(new FormData(form).entries()),
      areas: branchAreaPayload()
    };

    try {
      await request('/api/branches', { method: 'POST', body: data });
      state.branches = await request('/api/branches');
      form.reset();
      selectors.branchAreaInputs.innerHTML = '';
      addAreaInputRow({ name: 'VIP', table_count: 2, capacity: 4, table_prefix: 'VIP' });
      refreshBranchSelects();
      syncBranchControls();
      selectors.branchFormMessage.textContent = 'Đã tạo chi nhánh.';
      renderBranches();
    } catch (error) {
      selectors.branchFormMessage.textContent = error.message;
    }
  }

  async function refreshBranches() {
    state.branches = await request('/api/branches');
    refreshBranchSelects();
    syncBranchControls();
    renderBranches();
  }

  function apiClientFormPayload(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    data.is_active = form.querySelector('[name="is_active"]')?.checked ? 'true' : 'false';
    return data;
  }

  function sheetTargetFormPayload(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    data.is_active = form.querySelector('[name="is_active"]')?.checked ? 'true' : 'false';
    return data;
  }

  function apiKeyMessage(result, prefix) {
    const key = result && result.api_key;

    if (!key) {
      return prefix;
    }

    return `${prefix} API key mới: ${key}. Hãy lưu key này ngay vì hệ thống sẽ không hiển thị lại.`;
  }

  async function refreshApiClients() {
    state.apiClients = await request('/api/api-clients');
    renderApiClients();
  }

  async function refreshSheetTargets() {
    state.sheetTargets = await request('/api/sheet-settings');
    renderSheetTargets();
    syncSheetTargetTypeOptions(document);
  }

  async function handleCreateApiClient(event) {
    event.preventDefault();
    selectors.apiClientFormMessage.textContent = 'Đang tạo API key...';

    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;

    try {
      const result = await request('/api/api-clients', { method: 'POST', body: apiClientFormPayload(form) });
      state.apiClients = await request('/api/api-clients');
      form.reset();
      const activeInput = document.getElementById('api-client-active');
      if (activeInput) {
        activeInput.checked = true;
      }
      selectors.apiClientFormMessage.textContent = apiKeyMessage(result, 'Đã tạo cấu hình API.');
      renderApiClients();
    } catch (error) {
      selectors.apiClientFormMessage.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function handleCreateSheetTarget(event) {
    event.preventDefault();
    selectors.sheetTargetFormMessage.textContent = 'Đang lưu cấu hình Sheet...';

    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;

    try {
      await request('/api/sheet-settings', { method: 'POST', body: sheetTargetFormPayload(form) });
      state.sheetTargets = await request('/api/sheet-settings');
      form.reset();
      const activeInput = document.getElementById('sheet-target-active');
      if (activeInput) {
        activeInput.checked = true;
      }
      selectors.sheetTargetFormMessage.textContent = 'Đã lưu cấu hình Sheet.';
      renderSheetTargets();
      syncSheetTargetTypeOptions(document);
    } catch (error) {
      selectors.sheetTargetFormMessage.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function handleApiClientSubmit(event) {
    const form = event.target.closest('[data-api-client-update]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;

    try {
      await request(`/api/api-clients/${form.dataset.apiClientUpdate}`, { method: 'PUT', body: apiClientFormPayload(form) });
      selectors.apiClientFormMessage.textContent = 'Đã cập nhật cấu hình API.';
      await refreshApiClients();
    } catch (error) {
      selectors.apiClientFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleSheetTargetSubmit(event) {
    const form = event.target.closest('[data-sheet-target-update]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;

    try {
      await request(`/api/sheet-settings/${form.dataset.sheetTargetUpdate}`, { method: 'PUT', body: sheetTargetFormPayload(form) });
      selectors.sheetTargetFormMessage.textContent = 'Đã cập nhật cấu hình Sheet.';
      await refreshSheetTargets();
    } catch (error) {
      selectors.sheetTargetFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleApiClientDelete(event) {
    const button = event.target.closest('[data-delete-api-client]');
    if (!button) {
      return;
    }

    if (!window.confirm(`Xóa cấu hình API “${button.dataset.apiClientName}”? WordPress đang dùng key này sẽ không tạo booking được nữa.`)) {
      return;
    }

    button.disabled = true;

    try {
      await request(`/api/api-clients/${button.dataset.deleteApiClient}`, { method: 'DELETE' });
      selectors.apiClientFormMessage.textContent = 'Đã xóa cấu hình API.';
      await refreshApiClients();
    } catch (error) {
      selectors.apiClientFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleSheetTargetDelete(event) {
    const button = event.target.closest('[data-delete-sheet-target]');
    if (!button) {
      return;
    }

    if (!window.confirm(`Xóa cấu hình Sheet “${button.dataset.sheetTargetName}”? Booking mới sẽ không còn đồng bộ tới link này.`)) {
      return;
    }

    button.disabled = true;

    try {
      await request(`/api/sheet-settings/${button.dataset.deleteSheetTarget}`, { method: 'DELETE' });
      selectors.sheetTargetFormMessage.textContent = 'Đã xóa cấu hình Sheet.';
      await refreshSheetTargets();
    } catch (error) {
      selectors.sheetTargetFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleApiClientKeyRotate(event) {
    const button = event.target.closest('[data-rotate-api-client-key]');
    if (!button) {
      return;
    }

    if (!window.confirm('Xoay API key sẽ làm key cũ hết hiệu lực. Tiếp tục?')) {
      return;
    }

    button.disabled = true;

    try {
      const result = await request(`/api/api-clients/${button.dataset.rotateApiClientKey}/rotate-key`, { method: 'POST', body: {} });
      state.apiClients = await request('/api/api-clients');
      selectors.apiClientFormMessage.textContent = apiKeyMessage(result, 'Đã xoay API key.');
      renderApiClients();
    } catch (error) {
      selectors.apiClientFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleAreaSubmit(event) {
    const createForm = event.target.closest('[data-area-create]');
    const updateForm = event.target.closest('[data-area-update]');

    if (!createForm && !updateForm) {
      return;
    }

    event.preventDefault();
    const form = createForm || updateForm;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      if (createForm) {
        const data = Object.fromEntries(new FormData(createForm).entries());
        data.branch_id = createForm.dataset.branchId;
        await request('/api/areas', { method: 'POST', body: data });
        selectors.branchFormMessage.textContent = 'Đã tạo khu vực.';
      } else {
        const data = Object.fromEntries(new FormData(updateForm).entries());
        await request(`/api/areas/${updateForm.dataset.areaUpdate}`, { method: 'PUT', body: data });
        selectors.branchFormMessage.textContent = 'Đã cập nhật khu vực.';
      }

      await refreshBranches();
    } catch (error) {
      selectors.branchFormMessage.textContent = error.message;
      submitButton.disabled = false;
    }
  }

  async function handleAreaDelete(event) {
    const button = event.target.closest('[data-delete-area]');

    if (!button) {
      return;
    }

    const areaName = button.dataset.areaName;
    if (!window.confirm(`Xóa khu vực “${areaName}” và toàn bộ bàn chưa được sử dụng trong khu vực này?`)) {
      return;
    }

    button.disabled = true;

    try {
      await request(`/api/areas/${button.dataset.deleteArea}`, { method: 'DELETE' });
      selectors.branchFormMessage.textContent = 'Đã xóa khu vực.';
      await refreshBranches();
    } catch (error) {
      selectors.branchFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleBookingSubmit(event) {
    const form = event.target.closest('[data-booking-update]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;

    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await request(`/api/bookings/${form.dataset.bookingUpdate}`, { method: 'PUT', body: data });
      selectors.formMessage.textContent = 'Đã cập nhật yêu cầu đặt bàn.';
      await refreshDashboard();
    } catch (error) {
      selectors.formMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleBookingDelete(event) {
    const button = event.target.closest('[data-delete-booking]');
    if (!button) {
      return;
    }

    if (!window.confirm(`Xóa vĩnh viễn yêu cầu đặt bàn của “${button.dataset.bookingName}”?`)) {
      return;
    }

    button.disabled = true;
    try {
      await request(`/api/bookings/${button.dataset.deleteBooking}`, { method: 'DELETE' });
      selectors.formMessage.textContent = 'Đã xóa yêu cầu đặt bàn.';
      await refreshDashboard();
    } catch (error) {
      selectors.formMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleBranchSubmit(event) {
    const form = event.target.closest('[data-branch-update]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;

    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await request(`/api/branches/${form.dataset.branchUpdate}`, { method: 'PUT', body: data });
      selectors.branchFormMessage.textContent = 'Đã cập nhật chi nhánh.';
      await refreshBranches();
    } catch (error) {
      selectors.branchFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleBranchDelete(event) {
    const button = event.target.closest('[data-delete-branch]');
    if (!button) {
      return;
    }

    if (!window.confirm(`Xóa chi nhánh “${button.dataset.branchName}” cùng toàn bộ khu vực và bàn chưa được sử dụng?`)) {
      return;
    }

    button.disabled = true;
    try {
      const branchId = button.dataset.deleteBranch;
      await request(`/api/branches/${branchId}`, { method: 'DELETE' });
      selectors.branchFormMessage.textContent = 'Đã xóa chi nhánh.';

      if (String(selectedBranchId()) === String(branchId)) {
        window.location.assign('/branches');
        return;
      }

      await refreshBranches();
    } catch (error) {
      selectors.branchFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function refreshUsers() {
    state.users = await request('/api/users');
    renderUsers();
  }

  async function handleUserSubmit(event) {
    const form = event.target.closest('[data-user-update]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    const activeCheckbox = form.querySelector('[name="is_active"][type="checkbox"]');
    data.is_active = activeCheckbox && (activeCheckbox.disabled || activeCheckbox.checked) ? 'true' : 'false';
    button.disabled = true;

    try {
      await request(`/api/users/${form.dataset.userUpdate}`, { method: 'PUT', body: data });
      selectors.userFormMessage.textContent = 'Đã cập nhật tài khoản.';
      await refreshUsers();
    } catch (error) {
      selectors.userFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handleUserDelete(event) {
    const button = event.target.closest('[data-delete-user]');
    if (!button) {
      return;
    }

    if (!window.confirm(`Xóa vĩnh viễn tài khoản “${button.dataset.userName}”?`)) {
      return;
    }

    button.disabled = true;
    try {
      await request(`/api/users/${button.dataset.deleteUser}`, { method: 'DELETE' });
      selectors.userFormMessage.textContent = 'Đã xóa tài khoản.';
      await refreshUsers();
    } catch (error) {
      selectors.userFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  function handleUserEditToggle(event) {
    const button = event.target.closest('[data-toggle-user-edit]');
    if (!button) {
      return;
    }

    const row = selectors.userList.querySelector(`[data-user-edit-row="${button.dataset.toggleUserEdit}"]`);
    if (!row) {
      return;
    }

    const isOpening = row.hidden;
    row.hidden = !isOpening;
    button.setAttribute('aria-expanded', String(isOpening));
    button.textContent = isOpening ? 'Đóng' : 'Chỉnh sửa';
  }

  async function handleAction(event) {
    const button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    const card = button.closest('[data-booking-id]');
    const bookingId = card.dataset.bookingId;
    const booking = findBooking(bookingId);
    const action = button.dataset.action;

    button.disabled = true;

    try {
      if (action === 'confirm') {
        await request(`/api/bookings/${bookingId}`, { method: 'PUT', body: { status: 'CONFIRMED' } });
      }

      if (action === 'assign') {
        const select = card.querySelector(`[data-table-select="${bookingId}"]`);
        const tableIds = [...select.selectedOptions].map((option) => option.value);
        await request(`/api/bookings/${bookingId}/assign`, { method: 'POST', body: { table_ids: tableIds } });
      }

      if (action === 'check-in') {
        await request(`/api/bookings/${bookingId}/check-in`, {
          method: 'POST',
          body: { actual_guest_count: booking ? booking.guest_count : undefined }
        });
      }

      if (action === 'check-out') {
        await request(`/api/bookings/${bookingId}/check-out`, { method: 'POST', body: {} });
      }

      if (action === 'complete') {
        await request(`/api/bookings/${bookingId}`, { method: 'PUT', body: { status: 'COMPLETED' } });
      }

      if (action === 'cancel') {
        await request(`/api/bookings/${bookingId}/cancel`, { method: 'POST', body: {} });
      }

      await refreshDashboard();
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
    }
  }

  const createBookingForm = document.getElementById('create-booking-form');
  if (createBookingForm) {
    createBookingForm.addEventListener('submit', handleCreate);
    createBookingForm.addEventListener('click', (event) => {
      const dateButton = event.target.closest('[data-date-offset]');
      if (dateButton) {
        setBookingDateValue(dateOffsetValue(dateButton.dataset.dateOffset));
        return;
      }

      const branchButton = event.target.closest('[data-branch-choice]');
      if (branchButton) {
        setBranchSelectValue(selectors.bookingBranch, branchButton.dataset.branchChoice);
        return;
      }

      const timeButton = event.target.closest('[data-time-choice]');
      if (timeButton) {
        setBookingTimeSlot(timeButton.dataset.timeChoice);
        return;
      }

      const guestButton = event.target.closest('[data-guest-step]');
      if (guestButton) {
        const currentValue = Number(document.querySelector('[data-guest-count]')?.value || 2);
        setGuestCount(currentValue + Number(guestButton.dataset.guestStep));
      }
    });

    const bookingDateInput = document.getElementById('booking-date');
    if (bookingDateInput) {
      bookingDateInput.addEventListener('change', () => updateBookingDateChips(bookingDateInput.value));
    }
  }

  document.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-booking-popup]');
    if (openButton) {
      event.preventDefault();
      openBookingPopup();
      return;
    }

    const closeButton = event.target.closest('[data-close-booking-popup]');
    if (closeButton) {
      event.preventDefault();
      closeBookingPopup();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectors.bookingPopup && !selectors.bookingPopup.hidden) {
      closeBookingPopup();
    }
  });

  const createUserForm = document.getElementById('create-user-form');
  if (createUserForm) {
    createUserForm.addEventListener('submit', handleCreateUser);
  }

  const createBranchForm = document.getElementById('create-branch-form');
  if (createBranchForm) {
    createBranchForm.addEventListener('submit', handleCreateBranch);
  }

  const createApiClientForm = document.getElementById('create-api-client-form');
  if (createApiClientForm) {
    createApiClientForm.addEventListener('submit', handleCreateApiClient);
  }

  const createSheetTargetForm = document.getElementById('create-sheet-target-form');
  if (createSheetTargetForm) {
    createSheetTargetForm.addEventListener('submit', handleCreateSheetTarget);
    syncSheetTargetTypeOptions(createSheetTargetForm);
  }

  if (selectors.branchScope) {
    selectors.branchScope.addEventListener('change', (event) => {
      const url = new URL(window.location.href);

      if (event.currentTarget.value) {
        url.searchParams.set('branch_id', event.currentTarget.value);
      } else {
        url.searchParams.delete('branch_id');
      }

      window.location.assign(`${url.pathname}${url.search}${url.hash}`);
    });
  }

  if (selectors.dashboardDateControls) {
    selectors.dashboardDateControls.addEventListener('click', (event) => {
      const dateButton = event.target.closest('[data-dashboard-date-offset]');
      if (!dateButton) {
        return;
      }

      applyDashboardDateFilter(dateOffsetValue(dateButton.dataset.dashboardDateOffset));
    });
  }

  if (selectors.dashboardDateFilter) {
    selectors.dashboardDateFilter.addEventListener('change', () => {
      applyDashboardDateFilter(selectors.dashboardDateFilter.value);
    });
  }

  const addAreaButton = document.getElementById('add-area-button');
  if (addAreaButton) {
    addAreaButton.addEventListener('click', () => addAreaInputRow());
  }

  if (selectors.branchAreaInputs) {
    selectors.branchAreaInputs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-area]');

      if (!button) {
        return;
      }

      const rows = selectors.branchAreaInputs.querySelectorAll('[data-area-row]');
      if (rows.length <= 1) {
        selectors.branchFormMessage.textContent = 'Mỗi chi nhánh phải có ít nhất một khu vực.';
        return;
      }

      button.closest('[data-area-row]').remove();
    });
  }

  if (selectors.branchList) {
    selectors.branchList.addEventListener('submit', handleAreaSubmit);
    selectors.branchList.addEventListener('submit', handleBranchSubmit);
    selectors.branchList.addEventListener('click', handleAreaDelete);
    selectors.branchList.addEventListener('click', handleBranchDelete);
  }

  if (selectors.apiClientList) {
    selectors.apiClientList.addEventListener('submit', handleApiClientSubmit);
    selectors.apiClientList.addEventListener('click', handleApiClientDelete);
    selectors.apiClientList.addEventListener('click', handleApiClientKeyRotate);
  }

  if (selectors.sheetTargetList) {
    selectors.sheetTargetList.addEventListener('submit', handleSheetTargetSubmit);
    selectors.sheetTargetList.addEventListener('click', handleSheetTargetDelete);
  }

  for (const bookingList of [selectors.openBookings, selectors.closedBookings].filter(Boolean)) {
    bookingList.addEventListener('submit', handleBookingSubmit);
    bookingList.addEventListener('click', handleBookingDelete);
  }

  if (selectors.userList) {
    selectors.userList.addEventListener('submit', handleUserSubmit);
    selectors.userList.addEventListener('click', handleUserEditToggle);
    selectors.userList.addEventListener('click', handleUserDelete);
  }

  document.addEventListener('click', handleAction);

  if (window.io) {
    const socket = window.io();
    for (const eventName of events) {
      socket.on(eventName, refreshDashboard);
    }
    for (const eventName of ['staff_online', 'staff_offline']) {
      socket.on(eventName, (payload = {}) => {
        state.onlineUsers = payload.online_users || [];
        renderOnlineUsers();
      });
    }
  }

  syncBranchControls();
  syncDashboardDateControls();
  syncBookingDateControls();
  render();
})();
