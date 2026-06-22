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
    tableStatuses: window.__TABLE_STATUSES__ || {},
    bookings: window.__BOOKINGS__ || [],
    customers: window.__CUSTOMERS__ || [],
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
  const bookingStatusChoices = Object.keys(bookingStatusLabels);
  const activeAssignmentStatuses = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
  const arrivalPendingStatuses = ['PENDING', 'CONFIRMED'];
  const closedBookingStatuses = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];
  const upcomingWarningMinutes = 30;
  const tableHoldMilliseconds = 4 * 60 * 60 * 1000;
  const tableQuickStatusChoices = [
    { value: 'AVAILABLE', key: 'available', label: 'Trống' },
    { value: 'RESERVED', key: 'reserved', label: 'Đang xếp' },
    { value: 'OCCUPIED', key: 'occupied', label: 'Đang ngồi' },
    { value: 'SOON_OUT', key: 'soon-out', label: 'Sắp out' }
  ];
  const bookingTabDefinitions = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chưa xác nhận' },
    { key: 'upcoming', label: 'Sắp tới' },
    { key: 'completed', label: 'Hoàn tất' },
    { key: 'cancelled', label: 'Huỷ' }
  ];
  const bookingTimeChoices = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '24:00'];
  let activeBookingTab = 'all';
  let bookingQuickSearchValue = '';
  let tableQuickSearchValue = '';
  let tableBookingSelectionIds = new Set();
  let notificationSoundUnlocked = false;
  const notificationSound = typeof window.Audio === 'function' ? new window.Audio('/notification.mp3') : null;
  if (notificationSound) {
    notificationSound.preload = 'auto';
  }
  const selectors = {
    openBookings: document.getElementById('open-booking-list'),
    bookingTabs: document.getElementById('booking-tabs'),
    bookingQuickSearch: document.querySelector('[data-booking-quick-search]'),
    formMessage: document.getElementById('form-message'),
    bookingBranch: document.querySelector('[data-booking-branch]'),
    bookingBranchGrid: document.getElementById('booking-branch-grid'),
    bookingPopup: document.querySelector('[data-booking-popup]'),
    bookingPopupPanel: document.querySelector('[data-booking-popup-panel]'),
    bookingSummary: document.querySelector('[data-booking-summary]'),
    managementPopup: document.querySelector('[data-management-popup]'),
    managementPopupPanel: document.querySelector('[data-management-popup-panel]'),
    managementPopupEyebrow: document.querySelector('[data-management-popup-eyebrow]'),
    managementPopupTitle: document.querySelector('[data-management-popup-title]'),
    managementPopupBody: document.querySelector('[data-management-popup-body]'),
    onlineUsers: document.getElementById('online-users-list'),
    onlineCount: document.getElementById('online-count'),
    branchScope: document.querySelector('[data-branch-scope]'),
    dashboardDateControls: document.querySelector('[data-dashboard-date-controls]'),
    dashboardDateFilter: document.querySelector('[data-dashboard-date-filter]'),
    bookingAlerts: document.getElementById('booking-alerts'),
    tableStatusList: document.getElementById('table-status-list'),
    tableQuickSearch: document.querySelector('[data-table-quick-search]'),
    tableBookingBar: document.querySelector('[data-table-booking-bar]'),
    tableBookingCreateButton: document.querySelector('[data-open-table-booking]'),
    branchList: document.getElementById('branch-list'),
    branchFormMessage: document.getElementById('branch-form-message'),
    customerList: document.getElementById('customer-list'),
    customerFormMessage: document.getElementById('customer-form-message'),
    customerSearch: document.querySelector('[data-customer-search]'),
    customerQuickfill: document.querySelector('[data-customer-quickfill]'),
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

  function setFormStatus(form, fallbackElement, message) {
    if (fallbackElement) {
      fallbackElement.textContent = message;
    }

    const popupMessage = form?.querySelector('[data-management-message]');
    if (popupMessage && popupMessage !== fallbackElement) {
      popupMessage.textContent = message;
    }
  }

  function isInsideManagementPopup(element) {
    return Boolean(element?.closest('[data-management-popup]'));
  }

  function removeNotificationUnlockListeners() {
    document.removeEventListener('pointerdown', unlockNotificationSound);
    document.removeEventListener('keydown', unlockNotificationSound);
  }

  function unlockNotificationSound() {
    if (!notificationSound || notificationSoundUnlocked) {
      return;
    }

    notificationSoundUnlocked = true;
    notificationSound.muted = true;
    const playResult = notificationSound.play();

    if (playResult && typeof playResult.then === 'function') {
      playResult
        .then(() => {
          notificationSound.pause();
          notificationSound.currentTime = 0;
          notificationSound.muted = false;
          removeNotificationUnlockListeners();
        })
        .catch(() => {
          notificationSound.muted = false;
          notificationSoundUnlocked = false;
        });
      return;
    }

    notificationSound.pause();
    notificationSound.currentTime = 0;
    notificationSound.muted = false;
    removeNotificationUnlockListeners();
  }

  function playNotificationSound() {
    if (!notificationSound) {
      return;
    }

    notificationSound.muted = false;
    notificationSound.currentTime = 0;
    const playResult = notificationSound.play();

    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {});
    }
  }

  function can(minimumRole) {
    return roleLevels[state.user.role] >= roleLevels[minimumRole];
  }

  function canCreateBooking() {
    return can('sale');
  }

  function canViewBookings() {
    return canCreateBooking();
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

  function canManageCustomers() {
    return can('manager');
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
    const dateValue = window.__SELECTED_BOOKING_DATE__ || todayDateValue();

    return isDateValue(dateValue) ? dateValue : todayDateValue();
  }

  function setDashboardUrlParam(name, value) {
    const url = new URL(window.location.href);

    if (value) {
      url.searchParams.set(name, value);
    } else {
      url.searchParams.delete(name);
    }

    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function setDashboardDateUrl(dateValue) {
    if (!usesDashboardDateScope()) {
      return;
    }

    setDashboardUrlParam('booking_date', dateValue);
  }

  function roleLabel(role) {
    return roleLabels[role] || role;
  }

  function bookingStatusLabel(status) {
    return bookingStatusLabels[status] || status;
  }

  function isAdminUser() {
    return state.user.role === 'admin';
  }

  function bookingCustomerTitle(booking) {
    if (isAdminUser()) {
      return booking.customer_name;
    }

    if (normalizeClientSearchText(booking.phone) === 'vang lai') {
      return booking.customer_name;
    }

    return `(${phoneSuffix(booking.phone)})${booking.customer_name}`;
  }

  function bookingCustomerMeta(booking) {
    return isAdminUser() ? booking.phone || '-' : '';
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

  function bookingSummaryRow(label, value) {
    return `
      <div class="booking-created-summary-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value || '-')}</dd>
      </div>
    `;
  }

  function clearBookingSummary() {
    if (!selectors.bookingSummary) {
      return;
    }

    selectors.bookingSummary.hidden = true;
    selectors.bookingSummary.innerHTML = '';
  }

  function renderCreatedBookingSummary(booking) {
    if (!selectors.bookingSummary || !booking) {
      return;
    }

    const createdAt = booking.created_at ? formatDateTime(booking.created_at) : '';
    const rows = [
      bookingSummaryRow('Mã phiếu', booking.id ? `#${booking.id}` : ''),
      bookingSummaryRow('Khách hàng', booking.customer_name),
      bookingSummaryRow('Số điện thoại', booking.phone),
      bookingSummaryRow('Thời gian đặt', formatDateTime(booking.booking_time)),
      bookingSummaryRow('Chi nhánh', booking.branch_name),
      bookingSummaryRow('Địa chỉ', booking.branch_address),
      bookingSummaryRow('Số khách', booking.guest_count ? `${booking.guest_count} khách` : ''),
      bookingSummaryRow('Trạng thái', bookingStatusLabel(booking.status)),
      bookingSummaryRow('Nhân viên lên đơn', booking.order_staff_name),
      bookingSummaryRow('Ghi chú', booking.note || 'Không có')
    ];

    if (createdAt) {
      rows.push(bookingSummaryRow('Tạo lúc', createdAt));
    }

    selectors.bookingSummary.innerHTML = `
      <div class="booking-created-summary-header">
        <div>
          <p class="booking-created-summary-eyebrow">Đã tạo đặt bàn</p>
          <h4>Nội dung phiếu đặt bàn</h4>
        </div>
        <span class="booking-created-summary-code">${escapeHtml(booking.id ? `#${booking.id}` : 'Mới')}</span>
      </div>
      <dl class="booking-created-summary-list">
        ${rows.join('')}
      </dl>
      <div class="booking-created-summary-hint">Có thể chụp màn hình thẻ này để gửi báo cáo.</div>
    `;
    selectors.bookingSummary.hidden = false;
    window.requestAnimationFrame(() => selectors.bookingSummary.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  function branchOptions(selectedId, includeEmpty = false) {
    const options = includeEmpty ? '<option value="">Không thuộc chi nhánh</option>' : '';
    return options + state.branches
      .map((branch) => `<option value="${escapeHtml(branch.id)}" ${String(branch.id) === String(selectedId || '') ? 'selected' : ''}>${escapeHtml(branch.name)}</option>`)
      .join('');
  }

  function bookingBranchCards(selectedId = '') {
    return state.branches
      .map(
        (branch) => `
          <button class="booking-choice-card ${String(branch.id) === String(selectedId || '') ? 'active' : ''}" type="button" data-branch-choice="${escapeHtml(branch.id)}" aria-pressed="${String(branch.id) === String(selectedId || '') ? 'true' : 'false'}">
            <span class="booking-choice-name">${escapeHtml(branch.name)}</span>
            <span class="booking-choice-sub">${escapeHtml(branch.address || 'Chưa có địa chỉ')}</span>
          </button>
        `
      )
      .join('');
  }

  function bookingTimeChoiceButtons(selectedTime = '') {
    return bookingTimeChoices
      .map((time) => `<button class="booking-time-choice ${time === selectedTime ? 'active' : ''}" type="button" data-time-choice="${escapeHtml(time)}" aria-pressed="${time === selectedTime ? 'true' : 'false'}">${escapeHtml(time)}</button>`)
      .join('');
  }

  function formatTimeSlot(minutes) {
    const hours = Math.floor(minutes / 60);
    const minutePart = minutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}`;
  }

  function currentTimeInputValue(now = new Date()) {
    return formatTimeSlot(now.getHours() * 60 + now.getMinutes());
  }

  function isValidTimeInput(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
  }

  function bookingEditMinTime(selectedDate = todayDateValue(), now = new Date()) {
    const floor = '17:00';

    if (selectedDate !== todayDateValue()) {
      return floor;
    }

    return currentTimeInputValue(now) > floor ? currentTimeInputValue(now) : floor;
  }

  function timeInputMinutes(value) {
    const [hours, minutes] = String(value || '').split(':').map(Number);

    return hours * 60 + minutes;
  }

  function bookingFormDateParts(value) {
    const localValue = formatDateTimeLocal(value);

    if (!localValue) {
      return { date: todayDateValue(), time: '' };
    }

    const date = localValue.slice(0, 10);
    const time = localValue.slice(11, 16);

    if (time === '00:00') {
      const previousDate = new Date(`${date}T00:00`);
      previousDate.setDate(previousDate.getDate() - 1);

      return { date: formatDateTimeLocal(previousDate).slice(0, 10), time: '24:00' };
    }

    return { date, time };
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

  function shouldShowBookingBranch() {
    return isAdminUser() && !selectedBranchId();
  }

  function selectedDashboardBookingDate() {
    if (selectors.dashboardDateFilter) {
      return selectors.dashboardDateFilter.value || dashboardBookingDateFromUrl();
    }

    return dashboardBookingDateFromUrl();
  }

  function selectedTableBookingDateTime() {
    return formatDateTimeLocal(new Date());
  }

  function usesDashboardDateScope() {
    return window.__DASHBOARD_SECTION__ === 'bookings' || window.__DASHBOARD_SECTION__ === 'table';
  }

  function dashboardQuery() {
    const params = new URLSearchParams();
    const branchId = selectedBranchId();

    if (branchId) {
      params.set('branch_id', branchId);
    }

    if (usesDashboardDateScope()) {
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

  function scopedPathWithParams(path, params = {}) {
    const searchParams = new URLSearchParams(dashboardQuery().slice(1));

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, value);
      }
    }

    const query = searchParams.toString();

    return query ? `${path}?${query}` : path;
  }

  function normalizeClientPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');

    if (digits.startsWith('0084') && digits.length > 4) {
      return `0${digits.slice(4)}`;
    }

    if (digits.startsWith('84') && digits.length >= 10) {
      return `0${digits.slice(2)}`;
    }

    return digits;
  }

  function normalizeClientSearchText(value) {
    return String(value || '')
      .trim()
      .toLocaleLowerCase('vi-VN')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ');
  }

  function bookingQuickSearchTerm() {
    return normalizeClientSearchText(bookingQuickSearchValue);
  }

  function bookingMatchesQuickSearch(booking) {
    const term = bookingQuickSearchTerm();

    if (!term) {
      return true;
    }

    const phoneTerm = normalizeClientPhone(bookingQuickSearchValue);

    return normalizeClientSearchText(booking.customer_name).includes(term)
      || (phoneTerm && normalizeClientPhone(booking.phone).includes(phoneTerm));
  }

  function tableQuickSearchTerm() {
    return String(tableQuickSearchValue || '').replace(/\D/g, '');
  }

  function tableMatchesQuickSearch(table) {
    const term = tableQuickSearchTerm();

    if (!term) {
      return true;
    }

    return String(table.table_code || '').trim() === term;
  }

  function setBranchSelectValue(select, value) {
    if (!select) {
      return;
    }

    if (!select.options) {
      const scope = select.closest('[data-booking-form]') || document;
      const fallback = state.branches.length ? String(state.branches[0].id) : '';
      const nextValue = value && state.branches.some((branch) => String(branch.id) === String(value))
        ? String(value)
        : select.value || fallback;
      select.value = nextValue;
      updateBookingBranchChoices(nextValue, scope);
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
    const createForm = document.getElementById('create-booking-form');
    const dateInput = createForm?.querySelector('[name="booking_date"]') || document.getElementById('booking-date');

    if (!dateInput) {
      return;
    }

    const today = todayDateValue();
    dateInput.min = today;
    if (!dateInput.value) {
      dateInput.value = today;
    }
    updateBookingDateChips(dateInput.value, createForm || document);
  }

  function updateBookingDateChips(value, scope = document) {
    for (const button of scope.querySelectorAll('[data-date-offset]')) {
      const active = dateOffsetValue(button.dataset.dateOffset) === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
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
    selectors.dashboardDateFilter.value = dateValue;
    updateDashboardDateChips(dateValue);
    setDashboardDateUrl(dateValue);
    tableBookingSelectionIds.clear();
    updateTableBookingBar();
    refreshDashboard();
  }

  function setBookingDateValue(value, scope = document) {
    const dateInput = scope.querySelector('[name="booking_date"]') || document.getElementById('booking-date');

    if (!dateInput) {
      return;
    }

    dateInput.value = value;
    updateBookingDateChips(value, scope);
  }

  function updateBookingBranchChoices(value, scope = document) {
    for (const button of scope.querySelectorAll('[data-branch-choice]')) {
      const active = String(button.dataset.branchChoice) === String(value || '');
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function renderBookingBranchChoices() {
    if (!selectors.bookingBranchGrid) {
      return;
    }

    selectors.bookingBranchGrid.innerHTML = bookingBranchCards(selectors.bookingBranch?.value);
    updateBookingBranchChoices(selectors.bookingBranch?.value, selectors.bookingBranchGrid.closest('[data-booking-form]') || document);
  }

  function setBookingTimeSlot(value, scope = document) {
    const input = scope.querySelector('[name="booking_time_slot"]') || document.getElementById('booking-time-slot');

    if (input) {
      input.value = value || '';
    }

    for (const button of scope.querySelectorAll('[data-time-choice]')) {
      const active = button.dataset.timeChoice === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function setGuestCount(value, scope = document) {
    const input = scope.querySelector('[data-guest-count]');
    const display = scope.querySelector('[data-guest-display]') || document.getElementById('booking-guest-display');
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
    clearBookingSummary();
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
    if (!selectors.managementPopup || selectors.managementPopup.hidden) {
      document.body.classList.remove('booking-popup-open');
    }
  }

  function openManagementPopup({ eyebrow = 'Quản trị', title = 'Thao tác', body = '', afterRender } = {}) {
    if (!selectors.managementPopup || !selectors.managementPopupBody) {
      return;
    }

    if (selectors.managementPopupEyebrow) {
      selectors.managementPopupEyebrow.textContent = eyebrow;
    }
    if (selectors.managementPopupTitle) {
      selectors.managementPopupTitle.textContent = title;
    }
    selectors.managementPopupBody.innerHTML = body;
    selectors.managementPopup.hidden = false;
    selectors.managementPopup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('booking-popup-open');

    if (typeof afterRender === 'function') {
      afterRender(selectors.managementPopupBody);
    }
    syncSheetTargetTypeOptions(selectors.managementPopupBody);

    window.requestAnimationFrame(() => selectors.managementPopupPanel?.focus());
  }

  function closeManagementPopup() {
    if (!selectors.managementPopup) {
      return;
    }

    selectors.managementPopup.hidden = true;
    selectors.managementPopup.setAttribute('aria-hidden', 'true');
    if (selectors.managementPopupBody) {
      selectors.managementPopupBody.innerHTML = '';
    }
    if (!selectors.bookingPopup || selectors.bookingPopup.hidden) {
      document.body.classList.remove('booking-popup-open');
    }
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

  function findBranch(id) {
    return state.branches.find((branch) => String(branch.id) === String(id));
  }

  function findArea(id) {
    for (const branch of state.branches) {
      const area = (branch.areas || []).find((item) => String(item.id) === String(id));
      if (area) {
        return { ...area, branch };
      }
    }

    return undefined;
  }

  function findUser(id) {
    return state.users.find((user) => String(user.id) === String(id));
  }

  function findApiClient(id) {
    return state.apiClients.find((client) => String(client.id) === String(id));
  }

  function findSheetTarget(id) {
    return state.sheetTargets.find((target) => String(target.id) === String(id));
  }

  function findCustomer(id) {
    return state.customers.find((customer) => String(customer.id) === String(id));
  }

  function assignmentTables(booking) {
    const available = (state.dashboard.assignable_tables || state.dashboard.available_tables || []).filter(
      (table) => String(table.branch_id) === String(booking.branch_id)
    );
    const assigned = booking.assigned_tables || [];
    const byId = new Map();

    for (const table of [...assigned, ...available]) {
      byId.set(String(table.id), table);
    }

    return [...byId.values()].sort((left, right) => {
      const leftCode = String(left.table_code || '');
      const rightCode = String(right.table_code || '');
      const leftNumber = /^\d+$/.test(leftCode) ? Number(leftCode) : Number.MAX_SAFE_INTEGER;
      const rightNumber = /^\d+$/.test(rightCode) ? Number(rightCode) : Number.MAX_SAFE_INTEGER;

      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return leftCode.localeCompare(rightCode, 'vi', { numeric: true });
    });
  }

  function bookingTimesOverlap(left, right) {
    const leftDate = bookingDate(left);
    const rightDate = bookingDate(right);

    if (!leftDate || !rightDate) {
      return true;
    }

    return rightDate.getTime() < leftDate.getTime() + tableHoldMilliseconds
      && rightDate.getTime() + tableHoldMilliseconds > leftDate.getTime();
  }

  function otherAssignedBookingForTable(table, booking) {
    if (!table || !booking) {
      return null;
    }

    return allDashboardBookings().find((otherBooking) => (
      String(otherBooking.id) !== String(booking.id)
      && String(otherBooking.branch_id) === String(booking.branch_id)
      && activeAssignmentStatuses.includes(otherBooking.status)
      && bookingTimesOverlap(booking, otherBooking)
      && (otherBooking.assigned_tables || []).some((assignedTable) => String(assignedTable.id) === String(table.id))
    )) || null;
  }

  function selectedAssignmentCount(booking) {
    return (booking.assigned_tables || []).filter((table) => !otherAssignedBookingForTable(table, booking)).length;
  }

  function assignmentAreaGrid(booking) {
    const branch = findBranch(booking.branch_id);
    const areas = branch?.areas || [];

    if (!areas.length) {
      return '';
    }

    const selectedAreaId = booking.area_id || areas[0]?.id || '';
    const buttons = areas.map((area, index) => `
      <button class="assign-area-card ${String(area.id) === String(selectedAreaId) ? 'selected' : ''}" type="button" data-assign-area="${escapeHtml(area.id)}" aria-pressed="${String(area.id) === String(selectedAreaId) ? 'true' : 'false'}">
        ${escapeHtml(area.name)}
      </button>
    `);

    return `
      <div class="assign-area-block">
        <div class="assign-block-title">Khu vực</div>
        <div class="assign-area-grid" aria-label="Chọn khu vực">${buttons.join('')}</div>
      </div>
    `;
  }

  function tableGrid(booking) {
    const tables = assignmentTables(booking);
    const assigned = booking.assigned_tables || [];

    if (!tables.length) {
      return '<div class="alert alert-light border mb-0">Không còn bàn trống trong chi nhánh này.</div>';
    }

    const items = tables.map((table) => {
      const ownAssigned = assigned.some((assignedTable) => String(assignedTable.id) === String(table.id));
      const assignedBooking = otherAssignedBookingForTable(table, booking);
      const disabled = Boolean(assignedBooking);
      const selected = ownAssigned && !disabled;
      const disabledLabel = disabled ? `Đã đặt #${assignedBooking.id}` : '';
      const disabledTitle = disabled ? `Bàn đã được xếp cho booking #${assignedBooking.id} - ${assignedBooking.customer_name}` : '';

      return `
        <button class="assign-table-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}" type="button" data-assign-table-card data-table-id="${escapeHtml(table.id)}" aria-pressed="${selected ? 'true' : 'false'}" ${disabled ? `disabled aria-disabled="true" title="${escapeHtml(disabledTitle)}"` : ''}>
          <span class="assign-table-code">${escapeHtml(table.table_code)}</span>
          ${disabled ? `<span class="assign-table-status">${escapeHtml(disabledLabel)}</span>` : ''}
        </button>
      `;
    });

    return `
      <div class="assign-table-block">
        <div class="assign-block-title">Bàn</div>
        <div class="assign-table-grid">${items.join('')}</div>
      </div>
    `;
  }

  function bookingEditAssignmentGrid(booking) {
    const selectedCount = selectedAssignmentCount(booking);

    return `
      <div>
        ${assignmentAreaGrid(booking)}
        ${tableGrid(booking)}
        <div class="form-text" data-assign-selected-count>${selectedCount ? `Đã chọn ${selectedCount} bàn.` : 'Chọn một hoặc nhiều bàn.'}</div>
      </div>
    `;
  }

  function managementMessage() {
    return '<p class="form-message small text-body-secondary mb-0" data-management-message role="status"></p>';
  }

  function bookingAssignForm(booking) {
    const tables = (booking.assigned_tables || []).map((table) => table.table_code).join(', ') || 'Chưa xếp bàn';
    const areaLabel = booking.area_name ? ` · Khu vực: ${booking.area_name}` : '';
    const shouldAutoConfirm = booking.status === 'PENDING' || booking.status === 'CANCELLED';
    const submitLabel = shouldAutoConfirm ? 'Lưu bàn & xác nhận' : 'Lưu bàn';
    const selectedCount = selectedAssignmentCount(booking);
    const selectedMessage = selectedCount
      ? shouldAutoConfirm
        ? `Đã chọn ${selectedCount} bàn. Lưu bàn sẽ tự xác nhận booking.`
        : `Đã chọn ${selectedCount} bàn.`
      : 'Chọn một hoặc nhiều bàn.';

    return `
      <form class="management-form" data-booking-assign="${escapeHtml(booking.id)}" data-auto-confirm="${shouldAutoConfirm ? 'true' : 'false'}">
        <div class="management-form-note">${escapeHtml(booking.customer_name)} · ${escapeHtml(booking.guest_count)} khách${escapeHtml(areaLabel)} · Bàn hiện tại: ${escapeHtml(tables)}</div>
        <div>
          <label class="form-label fw-semibold">Chọn khu vực và bàn</label>
          ${assignmentAreaGrid(booking)}
          ${tableGrid(booking)}
          <div class="form-text" data-assign-selected-count>${escapeHtml(selectedMessage)}</div>
        </div>
        <button class="btn btn-warning fw-bold form-submit" type="submit">${escapeHtml(submitLabel)}</button>
        ${managementMessage()}
      </form>
    `;
  }

  function bookingEditForm(booking) {
    const parts = bookingFormDateParts(booking.booking_time);
    const guestCount = booking.guest_count || 2;
    const callHref = phoneCallHref(booking.phone);
    const callButton = callHref
      ? `<a class="btn btn-wine btn-sm booking-edit-call-button" href="${escapeHtml(callHref)}"><i class="fa-solid fa-phone" aria-hidden="true"></i> Call</a>`
      : '<button class="btn btn-outline-secondary btn-sm booking-edit-call-button" type="button" disabled>Call</button>';

    return `
      <form class="booking-public-form booking-edit-public-form" data-booking-form data-booking-form-mode="edit" data-booking-update="${escapeHtml(booking.id)}">
        ${callButton}
        <section class="booking-step-block">
          <div class="booking-step-label"><span class="booking-step-number">1</span> Ngày đặt bàn <span class="required-mark">*</span></div>
          <input class="form-control" name="booking_date" type="date" value="${escapeHtml(parts.date)}" data-edit-booking-date required>
        </section>

        <section class="booking-step-block">
          <div class="booking-step-label"><span class="booking-step-number">2</span> Chi nhánh <span class="required-mark">*</span></div>
          <select class="form-select" name="branch_id" data-edit-booking-branch required>${branchOptions(booking.branch_id)}</select>
        </section>

        <section class="booking-step-block">
          <div class="booking-step-label"><span class="booking-step-number">3</span> Giờ đến <span class="required-mark">*</span></div>
          <input class="form-control" name="booking_time_slot" type="time" value="${escapeHtml(parts.time === '24:00' ? '23:59' : parts.time)}" min="${escapeHtml(bookingEditMinTime(parts.date))}" max="23:59" step="60" data-edit-booking-time required>
          <div class="form-text small">Chọn giờ chính xác theo phút. Giờ hợp lệ bắt đầu từ 17:00, hoặc từ thời điểm hiện tại nếu sửa booking hôm nay.</div>
        </section>

        <div class="booking-two-column">
          <section class="booking-step-block">
            <label class="booking-field-label">Số khách <span class="required-mark">*</span></label>
            <input name="guest_count" type="hidden" value="${escapeHtml(guestCount)}" data-guest-count>
            <div class="booking-stepper" aria-label="Chọn số khách">
              <button class="booking-stepper-button" type="button" data-guest-step="-1" aria-label="Giảm số khách">-</button>
              <span class="booking-stepper-value" data-guest-display>${escapeHtml(guestCount)}</span>
              <button class="booking-stepper-button" type="button" data-guest-step="1" aria-label="Tăng số khách">+</button>
            </div>
          </section>

          <section class="booking-step-block">
            <label class="booking-field-label">Số điện thoại <span class="required-mark">*</span></label>
            <input class="form-control form-control-lg" name="phone" value="${escapeHtml(booking.phone)}" autocomplete="tel" inputmode="tel" required>
          </section>
        </div>

        <section class="booking-step-block">
          <label class="booking-field-label">Tên người đặt <span class="required-mark">*</span></label>
          <input class="form-control form-control-lg" name="customer_name" value="${escapeHtml(booking.customer_name)}" autocomplete="name" required>
        </section>

        <section class="booking-step-block">
          <label class="booking-field-label">Tên nhân viên lên đơn <span class="text-body-secondary fw-normal">(không bắt buộc)</span></label>
          <input class="form-control form-control-lg" name="order_staff_name" value="${escapeHtml(booking.order_staff_name || '')}" autocomplete="off">
        </section>

        <section class="booking-step-block">
          <label class="booking-field-label">Ghi chú <span class="text-body-secondary fw-normal">(không bắt buộc)</span></label>
          <textarea class="form-control" name="note" rows="3">${escapeHtml(booking.note || '')}</textarea>
        </section>

        <section class="booking-step-block">
          <label class="booking-field-label">Xếp bàn</label>
          <div data-edit-assignment-grid>
            ${bookingEditAssignmentGrid(booking)}
          </div>
        </section>

        <div class="booking-edit-actions">
          <button class="btn btn-warning btn-lg fw-bold form-submit booking-submit-button" type="submit">Lưu thay đổi</button>
          <button class="btn btn-outline-danger" type="button" data-delete-booking="${escapeHtml(booking.id)}" data-booking-name="${escapeHtml(booking.customer_name)}">Xóa đặt bàn</button>
        </div>
        ${managementMessage()}
      </form>
    `;
  }

  function branchCreateForm() {
    return `
      <form id="create-branch-form" class="management-form row g-3">
        <div class="col-12 col-md-4">
          <label class="form-label fw-semibold">Tên chi nhánh</label>
          <input class="form-control" name="name" maxlength="120" required>
        </div>
        <div class="col-12 col-md-4">
          <label class="form-label fw-semibold">Địa chỉ</label>
          <input class="form-control" name="address" maxlength="255">
        </div>
        <div class="col-12 col-md-4">
          <label class="form-label fw-semibold">Số bàn của chi nhánh</label>
          <input class="form-control" name="table_count" type="number" min="1" value="1" required>
        </div>
        <div class="col-12">
          <div class="border rounded-4 p-3 bg-body">
            <div class="d-flex flex-column flex-sm-row align-items-sm-start justify-content-sm-between gap-2 mb-3">
              <div>
                <strong class="d-block">Khu vực</strong>
                <span class="text-body-secondary small">Khu vực chỉ dùng để phân vùng hiển thị, không kiểm soát bàn.</span>
              </div>
              <button class="btn btn-outline-secondary btn-sm flex-shrink-0" type="button" data-add-area-row>Thêm khu vực</button>
            </div>
            <div class="d-grid gap-3" id="branch-area-inputs">
              <div class="area-input-row row g-2 align-items-end m-0 border rounded-3 p-2 bg-body" data-area-row>
                <div class="col-12">
                  <label class="form-label fw-semibold small">Tên khu vực</label>
                  <input class="form-control" data-area-field="name" maxlength="120" value="VIP" required>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-12 d-grid">
          <button class="btn btn-primary fw-bold form-submit" type="submit">Tạo chi nhánh</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

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

  function branchEditForm(branch) {
    const deleteReason = branchDeleteReason(branch);

    return `
      <form class="management-form row g-3" data-branch-update="${escapeHtml(branch.id)}">
        <div class="col-12">
          <label class="form-label fw-semibold small">Tên chi nhánh</label>
          <input class="form-control" name="name" value="${escapeHtml(branch.name)}" maxlength="120" required>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold small">Địa chỉ</label>
          <input class="form-control" name="address" value="${escapeHtml(branch.address || '')}" maxlength="255">
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold small">Số bàn của chi nhánh</label>
          <input class="form-control" name="table_count" type="number" min="1" value="${escapeHtml(branch.table_count || 1)}" required>
        </div>
        <div class="col-12 d-grid gap-2 d-sm-flex">
          <button class="btn btn-warning fw-bold flex-sm-fill" type="submit">Lưu thay đổi</button>
          <button class="btn btn-outline-danger flex-sm-fill" type="button" data-delete-branch="${escapeHtml(branch.id)}" data-branch-name="${escapeHtml(branch.name)}" ${deleteReason ? `disabled title="${escapeHtml(deleteReason)}"` : ''}>Xóa chi nhánh</button>
        </div>
        ${deleteReason ? `<p class="small text-body-secondary mb-0">${escapeHtml(deleteReason)}</p>` : ''}
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function areaCreateForm(branch) {
    return `
      <form class="management-form row g-3" data-area-create data-branch-id="${escapeHtml(branch.id)}">
        <div class="col-12">
          <label class="form-label fw-semibold small">Chi nhánh</label>
          <input class="form-control" value="${escapeHtml(branch.name)}" disabled>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold small">Tên khu vực</label>
          <input class="form-control" name="name" maxlength="120" required>
        </div>
        <div class="col-12 d-grid">
          <button class="btn btn-warning fw-bold" type="submit">Tạo khu vực</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function areaEditForm(area) {
    return `
      <form class="management-form row g-3" data-area-update="${escapeHtml(area.id)}">
        <div class="col-12">
          <label class="form-label fw-semibold small">Tên khu vực</label>
          <input class="form-control" name="name" maxlength="120" value="${escapeHtml(area.name)}" required>
        </div>
        <div class="col-12 d-grid gap-2 d-sm-flex">
          <button class="btn btn-warning fw-bold flex-sm-fill" type="submit">Lưu tên</button>
          <button class="btn btn-outline-danger flex-sm-fill" type="button" data-delete-area="${escapeHtml(area.id)}" data-area-name="${escapeHtml(area.name)}">Xóa khu vực</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function userCreateForm() {
    const branchField = state.user.branch_id
      ? `<input name="branch_id" type="hidden" value="${escapeHtml(state.user.branch_id)}">`
      : `
          <div class="col-12 col-sm-6">
            <label class="form-label fw-semibold">Chi nhánh</label>
            <select class="form-select" name="branch_id">${branchOptions('', true)}</select>
          </div>
        `;

    return `
      <form id="create-user-form" class="management-form row g-3">
        <div class="col-12 col-sm-6">
          <label class="form-label fw-semibold">Tên đăng nhập</label>
          <input class="form-control" name="username" minlength="3" maxlength="50" pattern="[a-z0-9._-]+" autocapitalize="none" required>
        </div>
        <div class="col-12 col-sm-6">
          <label class="form-label fw-semibold">Tên hiển thị</label>
          <input class="form-control" name="display_name" maxlength="120" required>
        </div>
        <div class="col-12 col-sm-6">
          <label class="form-label fw-semibold">Vai trò</label>
          <select class="form-select" name="role" required>${roleOptions('')}</select>
        </div>
        ${branchField}
        <div class="col-12 col-sm-6">
          <label class="form-label fw-semibold">Mật khẩu</label>
          <input class="form-control" name="password" type="password" minlength="6" autocomplete="new-password" required>
        </div>
        <div class="col-12 d-grid">
          <button class="btn btn-primary fw-bold form-submit" type="submit">Tạo tài khoản</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function userEditForm(user) {
    const isSelf = String(user.id) === String(state.user.id);

    return `
      <form class="management-form row g-3" data-user-update="${escapeHtml(user.id)}">
        <div class="col-12 col-md-6">
          <label class="form-label fw-semibold small">Tên đăng nhập</label>
          <input class="form-control" name="username" value="${escapeHtml(user.username)}" minlength="3" maxlength="50" required>
        </div>
        <div class="col-12 col-md-6">
          <label class="form-label fw-semibold small">Tên hiển thị</label>
          <input class="form-control" name="display_name" value="${escapeHtml(user.display_name)}" maxlength="120" required>
        </div>
        <div class="col-12 col-sm-6">
          <label class="form-label fw-semibold small">Vai trò</label>
          <select class="form-select" name="role">${roleOptions(user.role)}</select>
        </div>
        ${canManageUsers() ? `
          <div class="col-12 col-sm-6">
            <label class="form-label fw-semibold small">Chi nhánh</label>
            <select class="form-select" name="branch_id">${branchOptions(user.branch_id, true)}</select>
          </div>
        ` : ''}
        <div class="col-12">
          <label class="form-label fw-semibold small">Mật khẩu mới</label>
          <input class="form-control" name="password" type="password" minlength="6" placeholder="Giữ nguyên nếu trống">
        </div>
        <div class="col-12">
          <div class="form-check mb-0">
            <input class="form-check-input" name="is_active" type="checkbox" value="true" id="popup-user-active-${escapeHtml(user.id)}" ${user.is_active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}>
            ${isSelf ? '<input name="is_active" type="hidden" value="true">' : ''}
            <label class="form-check-label" for="popup-user-active-${escapeHtml(user.id)}">Tài khoản hoạt động</label>
          </div>
        </div>
        <div class="col-12 d-grid gap-2 d-sm-flex">
          <button class="btn btn-warning fw-bold flex-sm-fill" type="submit">Lưu thay đổi</button>
          <button class="btn btn-outline-danger flex-sm-fill" type="button" data-delete-user="${escapeHtml(user.id)}" data-user-name="${escapeHtml(user.display_name)}" ${isSelf ? 'disabled' : ''}>Xóa tài khoản</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function apiClientCreateForm() {
    return `
      <form id="create-api-client-form" class="management-form row g-3">
        <div class="col-12 col-md-5">
          <label class="form-label fw-semibold">Tên cấu hình</label>
          <input class="form-control" name="name" maxlength="120" placeholder="Website WordPress" required>
        </div>
        <div class="col-12 col-md-7">
          <label class="form-label fw-semibold">Domain được phép</label>
          <input class="form-control" name="allowed_origin" placeholder="https://example.com" required>
          <div class="form-text">Chỉ origin chính xác này được gọi public API.</div>
        </div>
        <div class="col-12">
          <div class="form-check">
            <input class="form-check-input" name="is_active" type="checkbox" value="true" id="api-client-active" checked>
            <label class="form-check-label" for="api-client-active">Cho phép hoạt động ngay</label>
          </div>
        </div>
        <div class="col-12 d-grid">
          <button class="btn btn-primary fw-bold form-submit" type="submit">Tạo API key</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function apiClientEditForm(client) {
    return `
      <form class="management-form row g-3" data-api-client-update="${escapeHtml(client.id)}">
        <div class="col-12 col-md-5">
          <label class="form-label fw-semibold small">Tên cấu hình</label>
          <input class="form-control" name="name" maxlength="120" value="${escapeHtml(client.name)}" required>
        </div>
        <div class="col-12 col-md-7">
          <label class="form-label fw-semibold small">Domain được phép</label>
          <input class="form-control" name="allowed_origin" value="${escapeHtml(client.allowed_origin)}" required>
        </div>
        <div class="col-12">
          <div class="form-check">
            <input class="form-check-input" name="is_active" type="checkbox" value="true" id="popup-api-client-active-${escapeHtml(client.id)}" ${client.is_active ? 'checked' : ''}>
            <label class="form-check-label" for="popup-api-client-active-${escapeHtml(client.id)}">Cho phép hoạt động</label>
          </div>
        </div>
        <div class="col-12 d-grid gap-2 d-sm-flex">
          <button class="btn btn-warning fw-bold flex-sm-fill" type="submit">Lưu thay đổi</button>
          <button class="btn btn-outline-danger flex-sm-fill" type="button" data-delete-api-client="${escapeHtml(client.id)}" data-api-client-name="${escapeHtml(client.name)}">Xóa cấu hình</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function sheetTargetCreateForm() {
    return `
      <form id="create-sheet-target-form" class="management-form row g-3">
        <div class="col-12 col-md-5">
          <label class="form-label fw-semibold">Tên cấu hình</label>
          <input class="form-control" name="name" maxlength="120" placeholder="Sheet tổng" required>
        </div>
        <div class="col-12 col-md-7">
          <label class="form-label fw-semibold">Loại Sheet</label>
          <select class="form-select" name="target_type" data-sheet-target-type required>${sheetTargetTypeOptions('')}</select>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Link Apps Script</label>
          <input class="form-control" name="webhook_url" placeholder="https://script.google.com/macros/s/.../exec" required>
        </div>
        <div class="col-12">
          <div class="form-check">
            <input class="form-check-input" name="is_active" type="checkbox" value="true" id="sheet-target-active" checked>
            <label class="form-check-label" for="sheet-target-active">Cho phép đồng bộ ngay</label>
          </div>
        </div>
        <div class="col-12 d-grid">
          <button class="btn btn-primary fw-bold form-submit" type="submit">Lưu cấu hình Sheet</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function sheetTargetEditForm(target) {
    return `
      <form class="management-form row g-3" data-sheet-target-update="${escapeHtml(target.id)}">
        <div class="col-12 col-md-5">
          <label class="form-label fw-semibold small">Tên cấu hình</label>
          <input class="form-control" name="name" maxlength="120" value="${escapeHtml(target.name)}" required>
        </div>
        <div class="col-12 col-md-7">
          <label class="form-label fw-semibold small">Loại Sheet</label>
          <select class="form-select" name="target_type" data-sheet-target-type data-current-sheet-target-type="${escapeHtml(target.target_type)}">${sheetTargetTypeOptions(target.target_type)}</select>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold small">Link Apps Script</label>
          <input class="form-control" name="webhook_url" value="${escapeHtml(target.webhook_url)}" required>
        </div>
        <div class="col-12">
          <div class="form-check">
            <input class="form-check-input" name="is_active" type="checkbox" value="true" id="popup-sheet-target-active-${escapeHtml(target.id)}" ${target.is_active ? 'checked' : ''}>
            <label class="form-check-label" for="popup-sheet-target-active-${escapeHtml(target.id)}">Cho phép đồng bộ</label>
          </div>
        </div>
        <div class="col-12 d-grid gap-2 d-sm-flex">
          <button class="btn btn-warning fw-bold flex-sm-fill" type="submit">Lưu thay đổi</button>
          <button class="btn btn-outline-danger flex-sm-fill" type="button" data-delete-sheet-target="${escapeHtml(target.id)}" data-sheet-target-name="${escapeHtml(target.name)}">Xóa cấu hình</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function customerEditForm(customer) {
    const nameColumn = isAdminUser() ? 'col-12 col-sm-6' : 'col-12';
    const phoneField = isAdminUser()
      ? `
        <div class="col-12 col-sm-6">
          <label class="form-label fw-semibold small">Số điện thoại</label>
          <input class="form-control" name="phone" value="${escapeHtml(customer.phone)}" inputmode="tel" required>
        </div>
      `
      : '';

    return `
      <form class="management-form row g-3" data-customer-update="${escapeHtml(customer.id)}">
        <div class="${nameColumn}">
          <label class="form-label fw-semibold small">Tên khách hàng</label>
          <input class="form-control" name="customer_name" value="${escapeHtml(customer.customer_name)}" required>
        </div>
        ${phoneField}
        <div class="col-12 d-grid">
          <button class="btn btn-warning fw-bold" type="submit">Lưu khách hàng</button>
        </div>
        <div class="col-12">${managementMessage()}</div>
      </form>
    `;
  }

  function renderCustomerBookingItem(booking) {
    const tables = (booking.assigned_tables || []).map((table) => table.table_code).join(', ') || 'Chưa xếp bàn';

    return `
      <article class="customer-history-item">
        <div class="d-flex flex-column flex-sm-row justify-content-sm-between gap-1">
          <strong>${escapeHtml(formatDateTime(booking.booking_time))}</strong>
          <span class="badge rounded-pill status-pill status-${escapeHtml(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>
        </div>
        <div class="small text-body-secondary">${escapeHtml(booking.branch_name)} · ${escapeHtml(booking.guest_count)} khách · Bàn ${escapeHtml(tables)}</div>
        ${booking.note ? `<div class="small text-body-secondary">Ghi chú: ${escapeHtml(booking.note)}</div>` : ''}
      </article>
    `;
  }

  function customerHistoryBody(customer, bookings = []) {
    const history = bookings.length
      ? bookings.map(renderCustomerBookingItem).join('')
      : '<div class="alert alert-light border mb-0">Khách hàng chưa có lịch sử đặt bàn trong phạm vi này.</div>';
    const phoneMeta = isAdminUser() && customer.phone ? `${escapeHtml(customer.phone)} · ` : '';

    return `
      <div class="customer-detail">
        <div class="management-form-note">
          <strong class="d-block">${escapeHtml(customer.customer_name)}</strong>
          <span>${phoneMeta}${escapeHtml(customer.booking_count || 0)} booking</span>
        </div>
        <div class="customer-history-list mt-3">${history}</div>
      </div>
    `;
  }

  function bookingStatusSelect(booking) {
    const options = bookingStatusChoices
      .map((status) => `<option value="${escapeHtml(status)}" ${status === booking.status ? 'selected' : ''}>${escapeHtml(bookingStatusLabel(status))}</option>`)
      .join('');

    return `
      <label class="visually-hidden" for="booking-status-${escapeHtml(booking.id)}">Trạng thái đặt bàn</label>
      <select class="form-select form-select-sm booking-action-btn booking-status-select" id="booking-status-${escapeHtml(booking.id)}" data-booking-status-select data-booking-id="${escapeHtml(booking.id)}" data-current-status="${escapeHtml(booking.status)}">
        ${options}
      </select>
    `;
  }

  function actionButtons(booking) {
    if (!canManageBookings()) {
      return '';
    }

    const statusSelect = bookingStatusSelect(booking);

    const editButton = `
      <button class="btn btn-outline-secondary btn-sm booking-action-btn" type="button" data-open-management-popup="booking-edit" data-booking-id="${escapeHtml(booking.id)}">Chỉnh sửa</button>
    `;

    return [statusSelect, editButton].join('');
  }

  function bookingManagement(booking) {
    if (!canManageBookings() || booking.status === 'COMPLETED') {
      return '';
    }

    return `
      <button class="btn btn-outline-secondary btn-sm booking-action-btn" type="button" data-open-management-popup="booking-edit" data-booking-id="${escapeHtml(booking.id)}">Chỉnh sửa</button>
    `;
  }

  function hasAssignedTables(booking) {
    return (booking.assigned_tables || []).length > 0;
  }

  function bookingDate(booking) {
    const date = new Date(booking.booking_time);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function minutesUntilBooking(booking, now = new Date()) {
    const date = bookingDate(booking);

    if (!date) {
      return null;
    }

    const differenceMinutes = (date.getTime() - now.getTime()) / 60000;

    return differenceMinutes < 0 ? Math.floor(differenceMinutes) : Math.ceil(differenceMinutes);
  }

  function minuteLabel(minutes) {
    return `${Math.abs(Number(minutes) || 0)}'`;
  }

  function localDatePart(date) {
    if (!date) {
      return '';
    }

    const offset = date.getTimezoneOffset() * 60 * 1000;

    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function isTodayBooking(booking) {
    const date = bookingDate(booking);

    return date ? localDatePart(date) === todayDateValue() : false;
  }

  function isFutureBookingDay(booking) {
    const date = bookingDate(booking);

    return date ? localDatePart(date) > todayDateValue() : false;
  }

  function isLateBooking(booking, now = new Date()) {
    const minutes = isTodayBooking(booking) ? minutesUntilBooking(booking, now) : null;

    return arrivalPendingStatuses.includes(booking.status) && minutes !== null && minutes < 0;
  }

  function isUpcomingBooking(booking, now = new Date()) {
    if (!arrivalPendingStatuses.includes(booking.status)) {
      return false;
    }

    if (isFutureBookingDay(booking)) {
      return true;
    }

    const minutes = isTodayBooking(booking) ? minutesUntilBooking(booking, now) : null;

    return minutes !== null && minutes >= 0;
  }

  function phoneCallHref(phone) {
    const phoneValue = String(phone || '').replace(/[^\d+]/g, '');

    return phoneValue ? `tel:${phoneValue}` : '';
  }

  function bookingTimelineState(booking, now = new Date()) {
    const minutes = isTodayBooking(booking) ? minutesUntilBooking(booking, now) : null;
    const isArrivalPending = arrivalPendingStatuses.includes(booking.status);

    if (isLateBooking(booking, now)) {
      return {
        tone: 'red',
        badge: `Trễ ${minuteLabel(minutes)}`,
        offset: `-${minuteLabel(minutes)}`,
        notice: 'Cảnh báo trễ giờ. Ưu tiên gọi khách hoặc cập nhật trạng thái.'
      };
    }

    if (isArrivalPending && minutes !== null && minutes >= 0 && minutes <= upcomingWarningMinutes) {
      return {
        tone: 'gold',
        badge: minutes <= 5 ? 'Sắp đến' : `Sắp tới ${minuteLabel(minutes)}`,
        offset: `+${minuteLabel(minutes)}`,
        notice: 'Khách sắp tới. Kiểm tra bàn và xác nhận chuẩn bị đón khách.'
      };
    }

    if (booking.status === 'CHECKED_IN') {
      return { tone: 'green', badge: 'Đang ngồi', offset: '', notice: '' };
    }

    if (booking.status === 'CHECKED_OUT' || booking.status === 'COMPLETED') {
      return { tone: 'green', badge: bookingStatusLabel(booking.status), offset: '', notice: '' };
    }

    if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW') {
      return { tone: 'red', badge: bookingStatusLabel(booking.status), offset: '', notice: '' };
    }

    if (booking.status === 'PENDING' || booking.status === 'CONFIRMED') {
      return { tone: 'gold', badge: bookingStatusLabel(booking.status), offset: '', notice: '' };
    }

    return { tone: 'neutral', badge: bookingStatusLabel(booking.status), offset: '', notice: '' };
  }

  function bookingVisitMeta(booking) {
    const visitNumber = Number(booking.customer_visit_number || 0);
    const bookingCount = Number(booking.customer_booking_count || 0);

    if (visitNumber <= 1 && bookingCount <= 1) {
      return {
        label: 'Lần đầu',
        title: 'Lần đầu tới quán'
      };
    }

    if (visitNumber > 0) {
      return {
        label: `Lần thứ ${visitNumber}`,
        title: `Lần thứ ${visitNumber} tới quán`
      };
    }

    return {
      label: bookingCount > 1 ? `Lần thứ ${bookingCount}` : 'Lần đầu',
      title: bookingCount > 1 ? `Lần thứ ${bookingCount} tới quán` : 'Lần đầu tới quán'
    };
  }

  function renderBookingAlert(alert) {
    const dot = alert.tone === 'neutral'
      ? ''
      : '<span class="booking-alert-dot" aria-hidden="true">•</span>';

    return `
      <article class="booking-alert booking-alert-${escapeHtml(alert.tone)}">
        ${dot}
        <span class="booking-alert-title">${escapeHtml(alert.title)}</span>
        <strong>${escapeHtml(alert.detail)}</strong>
      </article>
    `;
  }

  function renderBookingAlerts(bookings = []) {
    if (!selectors.bookingAlerts) {
      return;
    }

    const now = new Date();
    const activeBookings = bookings.filter((booking) => !closedBookingStatuses.includes(booking.status));
    const timedBookings = activeBookings
      .map((booking) => ({ booking, minutes: minutesUntilBooking(booking, now) }))
      .filter((item) => item.minutes !== null && isTodayBooking(item.booking));
    const lateBooking = timedBookings
      .filter((item) => isLateBooking(item.booking, now))
      .sort((left, right) => left.minutes - right.minutes)[0];
    const upcomingBooking = timedBookings
      .filter((item) => arrivalPendingStatuses.includes(item.booking.status) && item.minutes >= 0 && item.minutes <= upcomingWarningMinutes)
      .sort((left, right) => left.minutes - right.minutes)[0];
    const unassignedCount = activeBookings.filter((booking) => arrivalPendingStatuses.includes(booking.status) && !hasAssignedTables(booking)).length;
    const alerts = [];

    if (lateBooking) {
      alerts.push({
        tone: 'danger',
        title: 'TRỄ GIỜ',
        detail: `${lateBooking.booking.customer_name} · ${minuteLabel(lateBooking.minutes)}`
      });
    }

    if (upcomingBooking) {
      alerts.push({
        tone: 'warning',
        title: 'SẮP TỚI',
        detail: `${upcomingBooking.booking.customer_name} · ${minuteLabel(upcomingBooking.minutes)}`
      });
    }

    if (unassignedCount > 0) {
      alerts.push({
        tone: 'neutral',
        title: 'CHƯA XẾP BÀN',
        detail: unassignedCount
      });
    }

    selectors.bookingAlerts.hidden = alerts.length === 0;
    selectors.bookingAlerts.innerHTML = alerts.map(renderBookingAlert).join('');
  }

  function allDashboardBookings() {
    const bookings = [];
    const seenIds = new Set();

    for (const booking of [
      ...(state.bookings || []),
      ...(state.dashboard.open_bookings || []),
      ...(state.dashboard.closed_bookings || []),
      ...(state.tableStatuses?.bookings || [])
    ]) {
      const key = String(booking.id);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        bookings.push(booking);
      }
    }

    return bookings.sort((left, right) => {
      const leftDate = bookingDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDate = bookingDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftDate !== rightDate) {
        return leftDate - rightDate;
      }

      return Number(left.id) - Number(right.id);
    });
  }

  function bookingMatchesTab(booking, tabKey, now = new Date()) {
    if (tabKey === 'all') {
      return true;
    }

    if (tabKey === 'pending') {
      return booking.status === 'PENDING';
    }

    if (tabKey === 'upcoming') {
      return isUpcomingBooking(booking, now);
    }

    if (tabKey === 'completed') {
      return booking.status === 'COMPLETED';
    }

    if (tabKey === 'cancelled') {
      return ['CANCELLED', 'NO_SHOW'].includes(booking.status);
    }

    return true;
  }

  function bookingTabCounts(bookings, now = new Date()) {
    return bookingTabDefinitions.reduce((counts, tab) => {
      counts[tab.key] = bookings.filter((booking) => bookingMatchesTab(booking, tab.key, now)).length;

      return counts;
    }, {});
  }

  function renderBookingTabs(bookings) {
    if (!selectors.bookingTabs) {
      return;
    }

    const now = new Date();
    const counts = bookingTabCounts(bookings, now);
    const validTab = bookingTabDefinitions.some((tab) => tab.key === activeBookingTab);
    if (!validTab) {
      activeBookingTab = 'all';
    }

    selectors.bookingTabs.innerHTML = bookingTabDefinitions
      .map((tab) => `
        <button class="pill booking-tab ${tab.key === activeBookingTab ? 'active' : ''}" type="button" data-booking-tab="${escapeHtml(tab.key)}" aria-pressed="${tab.key === activeBookingTab ? 'true' : 'false'}">
          ${escapeHtml(tab.label)} · ${escapeHtml(counts[tab.key] || 0)}
        </button>
      `)
      .join('');
  }

  function setActiveBookingTab(tabKey) {
    if (!bookingTabDefinitions.some((tab) => tab.key === tabKey)) {
      return;
    }

    activeBookingTab = tabKey;
    renderBookingBoard();
  }

  function updateAssignTableSelection(form) {
    if (!form) {
      return;
    }

    const selectedCount = selectedAssignTableIds(form).length;
    const counter = form.querySelector('[data-assign-selected-count]');

    for (const card of form.querySelectorAll('[data-assign-table-card]')) {
      card.setAttribute('aria-pressed', card.classList.contains('selected') ? 'true' : 'false');
    }

    if (counter) {
      counter.textContent = selectedCount
        ? form.dataset.autoConfirm === 'true'
          ? `Đã chọn ${selectedCount} bàn. Lưu bàn sẽ tự xác nhận booking.`
          : `Đã chọn ${selectedCount} bàn.`
        : 'Chọn một hoặc nhiều bàn.';
    }
  }

  function setAssignAreaFilter(button) {
    const form = button.closest('[data-booking-assign], [data-booking-update], [data-table-booking-create]');

    if (!form) {
      return;
    }

    for (const areaButton of form.querySelectorAll('[data-assign-area]')) {
      const isSelected = areaButton === button;
      areaButton.classList.toggle('selected', isSelected);
      areaButton.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }
  }

  function syncEditTimeInput(form) {
    const dateInput = form?.querySelector('[data-edit-booking-date]');
    const timeInput = form?.querySelector('[data-edit-booking-time]');

    if (!dateInput || !timeInput) {
      return;
    }

    timeInput.min = bookingEditMinTime(dateInput.value || todayDateValue());
  }

  function toggleAssignTable(button) {
    const form = button.closest('[data-booking-assign], [data-booking-update]');

    if (!form || button.disabled || button.getAttribute('aria-disabled') === 'true') {
      return;
    }

    button.classList.toggle('selected');
    updateAssignTableSelection(form);
  }

  function selectedAssignTableIds(form) {
    return [...(form?.querySelectorAll('[data-assign-table-card].selected') || [])]
      .filter((card) => !card.disabled && card.getAttribute('aria-disabled') !== 'true')
      .map((card) => card.dataset.tableId)
      .filter(Boolean);
  }

  function sortedIdList(ids = []) {
    return ids.map(String).filter(Boolean).sort((left, right) => Number(left) - Number(right));
  }

  function sameIdList(left = [], right = []) {
    const leftIds = sortedIdList(left);
    const rightIds = sortedIdList(right);

    return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
  }

  function tableById(id) {
    for (const table of [
      ...(state.tableStatuses?.tables || []),
      ...(state.dashboard.assignable_tables || []),
      ...(state.dashboard.available_tables || []),
      ...(state.dashboard.active_tables || []),
      ...allDashboardBookings().flatMap((booking) => booking.assigned_tables || [])
    ]) {
      if (String(table.id) === String(id)) {
        return table;
      }
    }

    return undefined;
  }

  function selectedAssignTables(form) {
    return selectedAssignTableIds(form)
      .map((id) => tableById(id))
      .filter(Boolean);
  }

  async function ensureAssignableTablesForBranch(branchId) {
    if (!branchId) {
      return;
    }

    const knownTables = state.dashboard.assignable_tables || [];
    if (knownTables.some((table) => String(table.branch_id) === String(branchId))) {
      return;
    }

    const tables = await request(scopedPathWithParams('/api/tables', { branch_id: branchId }));
    const byId = new Map(knownTables.map((table) => [String(table.id), table]));

    for (const table of tables || []) {
      if (table.status !== 'BLOCKED') {
        byId.set(String(table.id), table);
      }
    }

    state.dashboard.assignable_tables = [...byId.values()];
  }

  function editAssignmentBooking(form, selectedTables = selectedAssignTables(form)) {
    const booking = findBooking(form.dataset.bookingUpdate);
    const branchId = form.querySelector('[name="branch_id"]')?.value || booking?.branch_id;
    const dateValue = form.querySelector('[name="booking_date"]')?.value;
    const timeSlot = form.querySelector('[name="booking_time_slot"]')?.value;
    const branchChanged = booking && String(branchId) !== String(booking.branch_id);
    const branch = findBranch(branchId);
    const selectedArea = form.querySelector('[data-assign-area].selected')?.dataset.assignArea;
    const defaultAreaId = branchChanged ? branch?.areas?.[0]?.id : booking?.area_id;

    return {
      ...(booking || {}),
      branch_id: branchId,
      booking_time: bookingDateTimeValue(dateValue, timeSlot) || booking?.booking_time,
      area_id: selectedArea || defaultAreaId || null,
      area_name: findArea(selectedArea || defaultAreaId)?.name || '',
      assigned_tables: selectedTables.filter((table) => String(table.branch_id) === String(branchId))
    };
  }

  async function refreshEditAssignmentGrid(form) {
    if (!form) {
      return;
    }

    const branchId = form.querySelector('[name="branch_id"]')?.value;
    const grid = form.querySelector('[data-edit-assignment-grid]');

    if (!grid) {
      return;
    }

    const selectedTables = selectedAssignTables(form);
    grid.innerHTML = '<div class="text-body-secondary small">Đang tải bàn...</div>';

    try {
      await ensureAssignableTablesForBranch(branchId);
      const booking = editAssignmentBooking(form, selectedTables);
      grid.innerHTML = bookingEditAssignmentGrid(booking);
      updateAssignTableSelection(form);
    } catch (error) {
      grid.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderTimelineBooking(booking) {
    const tables = (booking.assigned_tables || []).map((table) => table.table_code).join(', ');
    const areaLabel = booking.area_name || '';
    const controls = canManageBookings() ? actionButtons(booking) : '';
    const timelineState = bookingTimelineState(booking);
    const actionRow = controls
      ? `
          <div class="action-row timeline-action-row">
            ${controls}
          </div>
        `
      : '';
    const branchLabel = shouldShowBookingBranch() && booking.branch_name ? ` · ${booking.branch_name}` : '';
    const areaMeta = areaLabel
      ? `<span class="timeline-area" title="Khu vực ${escapeHtml(areaLabel)}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHtml(areaLabel)}</span>`
      : '';
    const tableMeta = tables
      ? `<span class="timeline-table" title="Bàn ${escapeHtml(tables)}"><i class="fa-solid fa-chair" aria-hidden="true"></i> ${escapeHtml(tables)}</span>`
      : '';
    const notice = timelineState.notice
      ? `<div class="timeline-notice timeline-notice-${escapeHtml(timelineState.tone)}">${escapeHtml(timelineState.notice)}</div>`
      : '';
    const note = booking.note
      ? `<div class="timeline-note">Ghi chú: ${escapeHtml(booking.note)}</div>`
      : '';
    const orderStaff = booking.order_staff_name
      ? `<div class="timeline-note">Nhân viên lên đơn: ${escapeHtml(booking.order_staff_name)}</div>`
      : '';
    const customerMeta = bookingCustomerMeta(booking);
    const visitMeta = bookingVisitMeta(booking);

    return `
      <div class="booking-timeline-item timeline-${escapeHtml(timelineState.tone)}" data-booking-id="${escapeHtml(booking.id)}">
        <div class="booking-time-mark ${escapeHtml(timelineState.tone)}">
          ${escapeHtml(formatBookingHour(booking.booking_time))}
          ${timelineState.offset ? `<small>${escapeHtml(timelineState.offset)}</small>` : ''}
        </div>
        <article class="card booking-card timeline-card ${escapeHtml(timelineState.tone)}" data-booking-id="${escapeHtml(booking.id)}">
        <div class="card-body booking-card-body">
          <div class="timeline-card-header">
            <div class="booking-card-main">
              <h3 class="timeline-customer">${escapeHtml(bookingCustomerTitle(booking))}</h3>
              ${customerMeta ? `<div class="booking-meta timeline-phone">${escapeHtml(customerMeta)}</div>` : ''}
            </div>
            <span class="timeline-visit-count" title="${escapeHtml(visitMeta.title)}">
              <strong>${escapeHtml(visitMeta.label)}</strong>
            </span>
          </div>
          <div class="timeline-meta-row">
            <span><i class="fa-solid fa-people-group" aria-hidden="true"></i> ${escapeHtml(booking.guest_count)}${escapeHtml(branchLabel)}</span>
            ${areaMeta}
            ${tableMeta}
          </div>
          ${notice}
          ${orderStaff}
          ${note}
          ${actionRow}
        </div>
        </article>
      </div>
    `;
  }

  function renderBooking(booking) {
    return renderTimelineBooking(booking);
  }

  function renderBookings(element, bookings) {
    if (!element) {
      return;
    }

    element.classList.toggle('booking-timeline-list', bookings.length > 0);

    const emptyMessage = bookingQuickSearchTerm()
      ? 'Không tìm thấy đặt bàn khớp tên khách hoặc số điện thoại này.'
      : 'Không có yêu cầu đặt bàn trong mục này.';

    element.innerHTML = bookings.length
      ? bookings.map(renderBooking).join('')
      : `<div class="alert alert-light border mb-0">${escapeHtml(emptyMessage)}</div>`;
  }

  function renderBookingBoard() {
    const bookings = allDashboardBookings();
    const now = new Date();
    const filteredBookings = bookings.filter((booking) => bookingMatchesTab(booking, activeBookingTab, now) && bookingMatchesQuickSearch(booking));

    renderBookingAlerts(bookings);
    renderBookingTabs(bookings);
    renderBookings(selectors.openBookings, filteredBookings);
  }

  function tableHoldEndTime(booking) {
    const date = booking.status === 'CHECKED_IN' && booking.check_in_at
      ? new Date(booking.check_in_at)
      : bookingDate(booking);

    return date && !Number.isNaN(date.getTime()) ? new Date(date.getTime() + 4 * 60 * 60 * 1000) : null;
  }

  function tableBookingStatusRank(booking, now = new Date()) {
    if (booking.status === 'CHECKED_IN') {
      const holdEnd = tableHoldEndTime(booking);
      const minutesToOut = holdEnd ? Math.ceil((holdEnd.getTime() - now.getTime()) / 60000) : null;

      return minutesToOut !== null && minutesToOut >= 0 && minutesToOut <= upcomingWarningMinutes ? 3 : 2;
    }

    if (booking.status === 'CONFIRMED' || booking.status === 'PENDING') {
      return 1;
    }

    return 0;
  }

  function bookingForTable(table, bookings, now = new Date()) {
    const tableBookings = bookings
      .filter((booking) => ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status))
      .filter((booking) => (booking.assigned_tables || []).some((assignedTable) => String(assignedTable.id) === String(table.id)))
      .sort((left, right) => {
        const rankDifference = tableBookingStatusRank(right, now) - tableBookingStatusRank(left, now);

        if (rankDifference !== 0) {
          return rankDifference;
        }

        return (bookingDate(left)?.getTime() || 0) - (bookingDate(right)?.getTime() || 0);
      });

    return tableBookings[0];
  }

  function tableStatusMeta(table, booking, now = new Date()) {
    if (!booking) {
      return { key: 'available', label: 'Trống', tone: 'green', detail: 'Chưa xếp booking' };
    }

    if (booking.status === 'CHECKED_IN') {
      const holdEnd = tableHoldEndTime(booking);
      const minutesToOut = holdEnd ? Math.ceil((holdEnd.getTime() - now.getTime()) / 60000) : null;
      const isSoonOut = minutesToOut !== null && minutesToOut >= 0 && minutesToOut <= upcomingWarningMinutes;

      return {
        key: isSoonOut ? 'soon-out' : 'occupied',
        label: isSoonOut ? 'Sắp out' : 'Đang ngồi',
        tone: isSoonOut ? 'gold' : 'red',
        detail: holdEnd ? `Dự kiến out ${formatBookingHour(holdEnd)}` : 'Khách đang dùng bàn'
      };
    }

    return {
      key: 'reserved',
      label: 'Đang xếp',
      tone: 'neutral',
      detail: `${bookingStatusLabel(booking.status)} · ${formatBookingHour(booking.booking_time)}`
    };
  }

  function tableSortValue(table) {
    const code = String(table.table_code || '');

    return /^\d+$/.test(code) ? Number(code) : Number.MAX_SAFE_INTEGER;
  }

  function tableQuickStatusValue(statusKey) {
    return tableQuickStatusChoices.find((choice) => choice.key === statusKey)?.value || 'AVAILABLE';
  }

  function tableQuickStatusOptions(meta, booking) {
    const currentValue = tableQuickStatusValue(meta.key);

    return tableQuickStatusChoices
      .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === currentValue ? 'selected' : ''} ${!booking && option.value !== 'AVAILABLE' ? 'disabled' : ''}>${escapeHtml(option.label)}</option>`)
      .join('');
  }

  function tableQuickStatusSelect(item) {
    const booking = item.booking;
    const currentValue = tableQuickStatusValue(item.meta.key);

    return `
      <label class="visually-hidden" for="table-status-select-${escapeHtml(item.table.id)}">Đổi trạng thái bàn</label>
      <select class="form-select form-select-sm table-status-select table-status-select-${escapeHtml(item.meta.key)}" id="table-status-select-${escapeHtml(item.table.id)}" data-table-status-select data-table-id="${escapeHtml(item.table.id)}" data-table-code="${escapeHtml(item.table.table_code)}" data-booking-id="${escapeHtml(booking?.id || '')}" data-current-status="${escapeHtml(currentValue)}" ${booking ? '' : 'disabled'}>
        ${tableQuickStatusOptions(item.meta, booking)}
      </select>
    `;
  }

  function tableBookingConflictForTable(table, bookings = state.tableStatuses?.bookings || allDashboardBookings(), bookingTime = selectedTableBookingDateTime()) {
    if (!table) {
      return null;
    }

    if (!bookingTime) {
      return null;
    }

    const draftBooking = {
      id: '__table_booking_draft__',
      branch_id: table.branch_id,
      booking_time: bookingTime
    };

    return bookings.find((booking) => (
      String(booking.branch_id) === String(table.branch_id)
      && activeAssignmentStatuses.includes(booking.status)
      && bookingTimesOverlap(draftBooking, booking)
      && (booking.assigned_tables || []).some((assignedTable) => String(assignedTable.id) === String(table.id))
    )) || null;
  }

  function selectedTableBookingTables() {
    return [...tableBookingSelectionIds]
      .map((id) => tableById(id))
      .filter(Boolean)
      .sort((left, right) => tableSortValue(left) - tableSortValue(right));
  }

  function tableBookingBranch() {
    const selectedTable = selectedTableBookingTables()[0];
    const branchId = selectedTable?.branch_id || selectedBranchId();

    return branchId ? findBranch(branchId) : null;
  }

  function tableBookingGuestCount(tables = selectedTableBookingTables()) {
    const capacityTotal = tables.reduce((total, table) => total + (Number(table.capacity) || 0), 0);

    return capacityTotal || Math.max(1, tables.length);
  }

  function updateTableBookingBar() {
    if (!selectors.tableBookingBar) {
      return;
    }

    const tables = selectedTableBookingTables();
    const count = tables.length;

    selectors.tableBookingBar.hidden = count === 0;
    selectors.tableBookingBar.closest('.table-status-toolbar-grid')?.classList.toggle('has-table-booking-action', count > 0);
    if (selectors.tableBookingCreateButton) {
      selectors.tableBookingCreateButton.disabled = count === 0;
    }
  }

  function syncTableBookingSelection(items) {
    if (!tableBookingSelectionIds.size) {
      updateTableBookingBar();
      return;
    }

    const selectableIds = new Set(
      items
        .filter((item) => !item.bookingConflict)
        .map((item) => String(item.table.id))
    );

    for (const tableId of [...tableBookingSelectionIds]) {
      if (!selectableIds.has(String(tableId))) {
        tableBookingSelectionIds.delete(tableId);
      }
    }

    updateTableBookingBar();
  }

  function toggleTableBookingSelection(input) {
    const table = tableById(input?.dataset.tableId);

    if (!table) {
      return;
    }

    if (input.checked) {
      const conflictBooking = tableBookingConflictForTable(table);
      if (conflictBooking) {
        input.checked = false;
        window.alert(`Bàn ${table.table_code} đang trùng booking #${conflictBooking.id} lúc ${formatBookingHour(conflictBooking.booking_time)}.`);
        return;
      }

      const selectedTables = selectedTableBookingTables();
      const selectedBranchIdValue = selectedTables[0]?.branch_id;
      if (selectedBranchIdValue && String(selectedBranchIdValue) !== String(table.branch_id)) {
        tableBookingSelectionIds.clear();
      }

      tableBookingSelectionIds.add(String(table.id));
    } else {
      tableBookingSelectionIds.delete(String(table.id));
    }

    renderTableStatusBoard();
  }

  function tableBookingAreaGrid(branch) {
    const areas = branch?.areas || [];

    if (!areas.length) {
      return '<div class="alert alert-light border mb-0">Chi nhánh này chưa cấu hình khu vực. Booking sẽ để trống khu vực.</div>';
    }

    return `
      <div class="assign-area-block">
        <div class="assign-block-title">Khu vực</div>
        <div class="assign-area-grid" aria-label="Chọn khu vực">
          ${areas.map((area, index) => `
            <button class="assign-area-card ${index === 0 ? 'selected' : ''}" type="button" data-assign-area="${escapeHtml(area.id)}" aria-pressed="${index === 0 ? 'true' : 'false'}">
              ${escapeHtml(area.name)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function tableBookingForm(bookingTime = selectedTableBookingDateTime()) {
    const tables = selectedTableBookingTables();
    const branch = tableBookingBranch();
    const tableIds = tables.map((table) => table.id);
    const tableCodes = tables.map((table) => table.table_code).join(', ');
    const guestCount = tableBookingGuestCount(tables);

    return `
      <form class="booking-public-form table-booking-form" data-table-booking-create data-table-ids="${escapeHtml(tableIds.join(','))}">
        <input type="hidden" name="booking_time" value="${escapeHtml(bookingTime)}">
        <input type="hidden" name="branch_id" value="${escapeHtml(branch?.id || '')}">
        <input type="hidden" name="guest_count" value="${escapeHtml(guestCount)}">
        <section class="management-form-note table-booking-summary-card">
          <strong>${escapeHtml(branch?.name || 'Chưa chọn chi nhánh')}</strong>
          <span>Bàn ${escapeHtml(tableCodes)} · ${escapeHtml(guestCount)} khách theo sức chứa bàn · ${escapeHtml(formatDateTime(bookingTime))}</span>
        </section>

        <section class="booking-step-block">
          <label class="booking-field-label">Khu vực</label>
          ${tableBookingAreaGrid(branch)}
        </section>

        <section class="booking-step-block">
          <label class="booking-field-label">Tên khách <span class="text-body-secondary fw-normal">(không bắt buộc)</span></label>
          <input class="form-control form-control-lg" name="customer_name" autocomplete="name" placeholder="Để trống sẽ tự điền Vãng lai">
        </section>

        <section class="booking-step-block">
          <label class="booking-field-label">Số điện thoại <span class="text-body-secondary fw-normal">(không bắt buộc)</span></label>
          <input class="form-control form-control-lg" name="phone" autocomplete="tel" inputmode="tel" placeholder="Để trống sẽ tự điền Vãng lai">
        </section>

        <button class="btn btn-warning btn-lg fw-bold form-submit booking-submit-button" type="submit">Tạo booking</button>
        ${managementMessage()}
      </form>
    `;
  }

  function openTableBookingPopup() {
    const tables = selectedTableBookingTables();
    const branch = tableBookingBranch();
    const bookingTime = selectedTableBookingDateTime();

    if (!tables.length) {
      window.alert('Vui lòng tích chọn ít nhất một bàn trước khi tạo booking.');
      return;
    }

    if (!branch) {
      window.alert('Vui lòng chọn chi nhánh hoặc chọn bàn thuộc một chi nhánh.');
      return;
    }

    const bookings = state.tableStatuses?.bookings || allDashboardBookings();
    const conflictItem = tables
      .map((table) => ({ table, booking: tableBookingConflictForTable(table, bookings, bookingTime) }))
      .find((item) => item.booking);

    if (conflictItem) {
      window.alert(`Bàn ${conflictItem.table.table_code} đang trùng booking #${conflictItem.booking.id} lúc ${formatBookingHour(conflictItem.booking.booking_time)}.`);
      renderTableStatusBoard();
      return;
    }

    openManagementPopup({ eyebrow: 'Tình trạng bàn', title: 'Tạo booking nhanh', body: tableBookingForm(bookingTime) });
  }

  function tableBookingPayload(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const tableIds = String(form.dataset.tableIds || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    data.customer_name = String(data.customer_name || '').trim() || 'Vãng lai';
    data.phone = String(data.phone || '').trim() || 'Vãng lai';
    data.table_ids = tableIds;
    data.area_id = form.querySelector('[data-assign-area].selected')?.dataset.assignArea || '';

    return data;
  }

  function renderTableStatusCard(item) {
    const booking = item.booking;
    const meta = item.meta;
    const customer = booking ? bookingCustomerTitle(booking) : 'Sẵn sàng nhận khách';
    const bookingMeta = booking
      ? `${escapeHtml(booking.guest_count)} khách · ${escapeHtml(formatBookingHour(booking.booking_time))}`
      : escapeHtml(item.table.status === 'BLOCKED' ? 'Bàn đang tạm khóa' : 'Không có booking đang xếp');
    const selected = tableBookingSelectionIds.has(String(item.table.id));
    const disabled = Boolean(item.bookingConflict);
    const conflictLabel = item.bookingConflict
      ? `Trùng booking #${item.bookingConflict.id} lúc ${formatBookingHour(item.bookingConflict.booking_time)}`
      : '';

    return `
      <article class="table-status-card table-status-${escapeHtml(meta.key)} ${selected ? 'table-status-card-selected' : ''}" data-table-booking-card data-table-id="${escapeHtml(item.table.id)}">
        <div class="table-status-card-top">
          <div>
            <span class="table-status-code">Bàn ${escapeHtml(item.table.table_code)}</span>
            <div class="table-status-branch">${escapeHtml(item.table.branch_name || '')}</div>
          </div>
          <label class="table-booking-check ${disabled ? 'disabled' : ''}">
            <input type="checkbox" data-table-booking-select data-table-id="${escapeHtml(item.table.id)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="Chọn bàn ${escapeHtml(item.table.table_code)} để tạo booking">
            <span>Chọn</span>
          </label>
        </div>
        <div class="table-status-customer">${escapeHtml(customer)}</div>
        <div class="table-status-meta">${bookingMeta}</div>
        <div class="table-status-detail">${escapeHtml(meta.detail)}</div>
        ${conflictLabel ? `<div class="table-booking-conflict">${escapeHtml(conflictLabel)}</div>` : ''}
        ${tableQuickStatusSelect(item)}
      </article>
    `;
  }

  function renderTableStatusBoard() {
    if (!selectors.tableStatusList) {
      updateTableBookingBar();
      return;
    }

    const now = new Date();
    const tables = (state.tableStatuses?.tables || state.dashboard.assignable_tables || state.dashboard.available_tables || [])
      .filter((table) => String(table.status) !== 'BLOCKED')
      .sort((left, right) => {
        const branchCompare = String(left.branch_name || '').localeCompare(String(right.branch_name || ''), 'vi', { numeric: true });
        if (branchCompare !== 0) {
          return branchCompare;
        }

        const numberDifference = tableSortValue(left) - tableSortValue(right);
        if (numberDifference !== 0) {
          return numberDifference;
        }

        return String(left.table_code || '').localeCompare(String(right.table_code || ''), 'vi', { numeric: true });
      });
    const bookings = state.tableStatuses?.bookings || allDashboardBookings();
    const items = tables.map((table) => {
      const booking = bookingForTable(table, bookings, now);
      return { table, booking, bookingConflict: tableBookingConflictForTable(table, bookings), meta: tableStatusMeta(table, booking, now) };
    });
    syncTableBookingSelection(items);
    const visibleItems = items.filter((item) => tableMatchesQuickSearch(item.table));
    const counts = items.reduce((totals, item) => {
      totals[item.meta.key] = (totals[item.meta.key] || 0) + 1;
      return totals;
    }, {});

    const countAvailable = document.getElementById('table-count-available');
    const countReserved = document.getElementById('table-count-reserved');
    const countOccupied = document.getElementById('table-count-occupied');
    const countSoonOut = document.getElementById('table-count-soon-out');

    if (countAvailable) countAvailable.textContent = counts.available || 0;
    if (countReserved) countReserved.textContent = counts.reserved || 0;
    if (countOccupied) countOccupied.textContent = counts.occupied || 0;
    if (countSoonOut) countSoonOut.textContent = counts['soon-out'] || 0;

    selectors.tableStatusList.innerHTML = visibleItems.length
      ? visibleItems.map(renderTableStatusCard).join('')
      : tableQuickSearchTerm()
        ? '<div class="alert alert-light border mb-0">Không tìm thấy bàn số này.</div>'
        : '<div class="alert alert-light border mb-0">Không có bàn trong phạm vi chi nhánh này.</div>';
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
                <button class="btn btn-outline-secondary btn-sm" type="button" data-open-management-popup="user-edit" data-user-id="${userId}">Chỉnh sửa</button>
                <button class="btn btn-outline-danger btn-sm" type="button" data-delete-user="${userId}" data-user-name="${escapeHtml(user.display_name)}" ${isSelf ? 'disabled' : ''}>Xóa</button>
              </div>
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

  function renderCustomer(customer) {
    const lastBooking = customer.last_booking_time
      ? formatDateTime(customer.last_booking_time)
      : 'Chưa có booking hoàn tất';
    const customerId = escapeHtml(customer.id);
    const phoneLine = isAdminUser() && customer.phone
      ? `<div class="small text-body-secondary">SĐT: <strong>${escapeHtml(customer.phone)}</strong></div>`
      : '';
    const branchLine = shouldShowBookingBranch() && customer.last_booking_branch_name
      ? `<div class="small text-body-secondary">Chi nhánh: ${escapeHtml(customer.last_booking_branch_name)}</div>`
      : '';

    return `
      <article class="customer-card border rounded-4 p-3 bg-body" data-customer-id="${customerId}">
        <div class="d-flex flex-column flex-lg-row align-items-lg-start justify-content-lg-between gap-3">
          <div class="min-w-0">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
              <strong class="text-gray-800">${escapeHtml(customer.customer_name)}</strong>
              <span class="badge text-bg-warning">${escapeHtml(customer.booking_count || 0)} booking</span>
            </div>
            ${phoneLine}
            <div class="small text-body-secondary">Hoàn tất gần nhất: ${escapeHtml(lastBooking)}</div>
            ${branchLine}
          </div>
          <div class="d-flex gap-2 flex-shrink-0">
            <button class="btn btn-outline-secondary btn-sm flex-fill" type="button" data-open-management-popup="customer-history" data-customer-id="${customerId}">Lịch sử</button>
            <button class="btn btn-outline-secondary btn-sm flex-fill" type="button" data-open-management-popup="customer-edit" data-customer-id="${customerId}">Chỉnh sửa</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderCustomers() {
    if (!selectors.customerList) {
      return;
    }

    selectors.customerList.innerHTML = state.customers.length
      ? state.customers.map(renderCustomer).join('')
      : '<div class="alert alert-light border mb-0">Chưa có khách hàng trong phạm vi này.</div>';
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
                <button class="btn btn-outline-secondary btn-sm" type="button" data-open-management-popup="api-client-edit" data-api-client-id="${clientId}">Chỉnh sửa</button>
                <button class="btn btn-outline-secondary btn-sm" type="button" data-rotate-api-client-key="${clientId}">Xoay key</button>
                <button class="btn btn-outline-danger btn-sm" type="button" data-delete-api-client="${clientId}" data-api-client-name="${escapeHtml(client.name)}">Xóa</button>
              </div>
            </div>
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
                <button class="btn btn-outline-secondary btn-sm" type="button" data-open-management-popup="sheet-target-edit" data-sheet-target-id="${targetId}">Chỉnh sửa</button>
                <button class="btn btn-outline-danger btn-sm" type="button" data-delete-sheet-target="${targetId}" data-sheet-target-name="${escapeHtml(target.name)}">Xóa</button>
              </div>
            </div>
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
                            <button class="btn btn-outline-secondary btn-sm" type="button" data-open-management-popup="area-edit" data-area-id="${escapeHtml(area.id)}">Sửa</button>
                          </div>
                        </li>
                      `
                    )
                    .join('')
                : '<li class="area-list-item text-body-secondary small">Chưa cấu hình khu vực.</li>';
              const createAreaForm = canManageBranches()
                ? `
                    <button class="btn btn-outline-secondary" type="button" data-open-management-popup="area-create" data-branch-id="${escapeHtml(branch.id)}">Thêm khu vực</button>
                  `
                : '';
              const areaContent = canManageBranches()
                ? areaSummary
                : areas.length
                  ? areas.map((area) => `<li class="area-list-item"><div class="area-list-summary"><strong>${escapeHtml(area.name)}</strong></div></li>`).join('')
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
                    <div class="branch-card-actions d-grid d-sm-flex gap-2 mt-3">
                      <button class="btn btn-outline-secondary flex-sm-fill" type="button" data-open-management-popup="branch-edit" data-branch-id="${escapeHtml(branch.id)}">Chỉnh sửa</button>
                      <button class="btn btn-outline-danger flex-sm-fill" type="button" data-delete-branch="${escapeHtml(branch.id)}" data-branch-name="${escapeHtml(branch.name)}" ${deleteReason ? `disabled title="${escapeHtml(deleteReason)}"` : ''}>Xóa</button>
                    </div>
                    ${deleteReason ? `<p class="small text-body-secondary mt-2 mb-0">${escapeHtml(deleteReason)}</p>` : ''}
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

  function addAreaInputRow(values = {}, container = document.getElementById('branch-area-inputs')) {
    if (!container) {
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
      <div class="col-12 col-sm-4 col-xl-auto d-grid">
        <button class="btn btn-outline-danger" type="button" data-remove-area>Xóa</button>
      </div>
    `;
    container.appendChild(row);
  }

  function branchAreaPayload(form = document) {
    const container = form.querySelector('#branch-area-inputs') || document.getElementById('branch-area-inputs');

    if (!container) {
      return [];
    }

    return [...container.querySelectorAll('[data-area-row]')].map((row) => {
      const fields = {};

      for (const input of row.querySelectorAll('[data-area-field]')) {
        fields[input.dataset.areaField] = input.value;
      }

      return fields;
    });
  }

  function render() {
    renderCounts();
    renderBookingBoard();
    renderTableStatusBoard();
    renderOnlineUsers();
    renderBranches();
    renderCustomers();
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
    if (!canViewBookings()) {
      return;
    }

    if (canManageBookings()) {
      if (window.__DASHBOARD_SECTION__ === 'table') {
        state.tableStatuses = await request(scopedPath('/api/table-statuses')) || state.tableStatuses;
      } else {
        const dashboard = await request(scopedPath('/api/dashboard'));
        state.dashboard = dashboard || state.dashboard;
      }
      state.bookings = [];
    } else {
      state.bookings = await request(scopedPath('/api/bookings'));
    }
    render();
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!canCreateBooking()) {
      selectors.formMessage.textContent = 'Bạn không có quyền tạo đặt bàn.';
      return;
    }

    selectors.formMessage.textContent = 'Đang tạo yêu cầu đặt bàn...';
    clearBookingSummary();

    const form = event.currentTarget;
    const data = bookingFormPayload(form);

    if (!data.branch_id) {
      selectors.formMessage.textContent = 'Vui lòng chọn chi nhánh.';
      return;
    }

    if (!data.booking_time) {
      selectors.formMessage.textContent = 'Vui lòng chọn ngày và giờ đặt bàn.';
      return;
    }

    try {
      const booking = await request('/api/bookings', {
        method: 'POST',
        body: data
      });
      form.reset();
      syncBookingDateControls();
      setBranchSelectValue(selectors.bookingBranch, selectedBranchId());
      setBookingTimeSlot('', form);
      setGuestCount(2, form);
      clearCustomerQuickfill();
      selectors.formMessage.textContent = 'Đã tạo yêu cầu đặt bàn. Nội dung phiếu hiển thị bên dưới.';
      renderCreatedBookingSummary(booking);
      if (canViewBookings()) {
        await refreshDashboard();
      }
    } catch (error) {
      selectors.formMessage.textContent = error.message;
    }
  }

  function bookingFormPayload(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    data.booking_time = bookingDateTimeValue(data.booking_date, data.booking_time_slot);
    delete data.booking_date;
    delete data.booking_time_slot;

    return data;
  }

  function validateEditBookingTime(form) {
    const dateInput = form.querySelector('[data-edit-booking-date]');
    const timeInput = form.querySelector('[data-edit-booking-time]');

    if (!timeInput) {
      return true;
    }

    const timeValue = timeInput.value.trim();
    timeInput.value = timeValue;

    if (!isValidTimeInput(timeValue)) {
      setFormStatus(form, selectors.formMessage, 'Vui lòng chọn giờ đến hợp lệ.');
      timeInput.focus();
      return false;
    }

    const minTime = bookingEditMinTime(dateInput?.value || todayDateValue());
    timeInput.min = minTime;
    if (timeInputMinutes(timeValue) < timeInputMinutes(minTime)) {
      setFormStatus(form, selectors.formMessage, `Giờ đến phải từ ${minTime} trở đi.`);
      timeInput.focus();
      return false;
    }

    return true;
  }

  async function handleCreateUser(event) {
    const form = event.target.closest('#create-user-form');
    if (!form) {
      return;
    }

    event.preventDefault();
    setFormStatus(form, selectors.userFormMessage, 'Đang tạo tài khoản...');
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      await request('/api/users', { method: 'POST', body: data });
      state.users = await request('/api/users');
      form.reset();
      setFormStatus(form, selectors.userFormMessage, 'Đã tạo tài khoản.');
      renderUsers();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.userFormMessage, error.message);
    }
  }

  async function handleCreateBranch(event) {
    const form = event.target.closest('#create-branch-form');
    if (!form) {
      return;
    }

    event.preventDefault();
    setFormStatus(form, selectors.branchFormMessage, 'Đang tạo chi nhánh...');
    const data = {
      ...Object.fromEntries(new FormData(form).entries()),
      areas: branchAreaPayload(form)
    };

    try {
      await request('/api/branches', { method: 'POST', body: data });
      state.branches = await request('/api/branches');
      form.reset();
      const branchAreaInputs = form.querySelector('#branch-area-inputs');
      if (branchAreaInputs) {
        branchAreaInputs.innerHTML = '';
        addAreaInputRow({ name: 'VIP' }, branchAreaInputs);
      }
      refreshBranchSelects();
      syncBranchControls();
      setFormStatus(form, selectors.branchFormMessage, 'Đã tạo chi nhánh.');
      renderBranches();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.branchFormMessage, error.message);
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

  async function refreshCustomers(query) {
    const q = query === undefined ? selectors.customerSearch?.value : query;
    state.customers = await request(scopedPathWithParams('/api/customers', { q }));
    renderCustomers();
  }

  function clearCustomerQuickfill() {
    if (selectors.customerQuickfill) {
      selectors.customerQuickfill.innerHTML = '';
    }
  }

  function renderCustomerQuickfill(result) {
    if (!selectors.customerQuickfill) {
      return;
    }

    if (!result || !result.customer) {
      selectors.customerQuickfill.innerHTML = '<div class="customer-quickfill-note">Khách mới, chưa có lịch sử đặt bàn.</div>';
      return;
    }

    const customer = result.customer;
    const recentBookings = result.recent_bookings || [];
    const history = recentBookings.length
      ? recentBookings
          .slice(0, 3)
          .map((booking) => escapeHtml(`${formatDateTime(booking.booking_time)} · ${bookingStatusLabel(booking.status)} · ${booking.guest_count} khách`))
          .join('<br>')
      : 'Chưa có booking trong phạm vi chi nhánh này.';

    selectors.customerQuickfill.innerHTML = `
      <div class="customer-quickfill-card">
        <strong>Đã nhận diện: ${escapeHtml(customer.customer_name)}</strong>
        <span>${escapeHtml(customer.booking_count || 0)} booking trước đó</span>
        <small>${history}</small>
      </div>
    `;
  }

  function renderCustomerSuggestions(customers = []) {
    if (!selectors.customerQuickfill) {
      return;
    }

    if (!customers.length) {
      selectors.customerQuickfill.innerHTML = '<div class="customer-quickfill-note">Chưa có khách cũ khớp số này.</div>';
      return;
    }

    const items = customers
      .map((customer) => {
        const lastBooking = customer.last_booking_time
          ? `${formatDateTime(customer.last_booking_time)} · ${bookingStatusLabel(customer.last_booking_status)}`
          : 'Chưa có booking gần đây';

        return `
          <button class="customer-suggestion-item" type="button" data-customer-suggestion data-customer-name="${escapeHtml(customer.customer_name)}" data-customer-phone="${escapeHtml(customer.phone)}">
            <strong>${escapeHtml(customer.customer_name)}</strong>
            <span>${escapeHtml(customer.phone)} · ${escapeHtml(customer.booking_count || 0)} booking</span>
            <small>${escapeHtml(lastBooking)}</small>
          </button>
        `;
      })
      .join('');

    selectors.customerQuickfill.innerHTML = `
      <div class="customer-suggestion-list">
        <div class="customer-suggestion-title">Khách cũ khớp số điện thoại</div>
        ${items}
      </div>
    `;
  }

  async function suggestCustomersForBooking(phoneValue) {
    const phone = normalizeClientPhone(phoneValue);

    if (phone.length < 2) {
      clearCustomerQuickfill();
      return;
    }

    if (phone.length >= 10) {
      await lookupCustomerForBooking(phoneValue);
      return;
    }

    if (selectors.customerQuickfill) {
      selectors.customerQuickfill.innerHTML = '<div class="customer-quickfill-note">Đang gợi ý khách cũ...</div>';
    }

    try {
      const customers = await request(scopedPathWithParams('/api/customers/suggest', { phone }));
      renderCustomerSuggestions(customers || []);
    } catch (error) {
      if (selectors.customerQuickfill) {
        selectors.customerQuickfill.innerHTML = `<div class="customer-quickfill-note text-danger">${escapeHtml(error.message)}</div>`;
      }
    }
  }

  function selectCustomerSuggestion(button) {
    const phoneInput = document.getElementById('booking-phone');
    const nameInput = document.getElementById('booking-customer-name');

    if (phoneInput) {
      phoneInput.value = button.dataset.customerPhone || '';
    }

    if (nameInput) {
      nameInput.value = button.dataset.customerName || '';
    }

    lookupCustomerForBooking(button.dataset.customerPhone || '');
  }

  async function lookupCustomerForBooking(phoneValue) {
    const phone = normalizeClientPhone(phoneValue);

    if (phone.length < 8) {
      clearCustomerQuickfill();
      return;
    }

    if (selectors.customerQuickfill) {
      selectors.customerQuickfill.innerHTML = '<div class="customer-quickfill-note">Đang tìm khách hàng...</div>';
    }

    try {
      const result = await request(scopedPathWithParams('/api/customers/lookup', { phone }));
      const nameInput = document.getElementById('booking-customer-name');
      if (result?.customer && nameInput && !nameInput.value.trim()) {
        nameInput.value = result.customer.customer_name;
      }
      renderCustomerQuickfill(result);
    } catch (error) {
      if (selectors.customerQuickfill) {
        selectors.customerQuickfill.innerHTML = `<div class="customer-quickfill-note text-danger">${escapeHtml(error.message)}</div>`;
      }
    }
  }

  async function handleCreateApiClient(event) {
    const form = event.target.closest('#create-api-client-form');
    if (!form) {
      return;
    }

    event.preventDefault();
    setFormStatus(form, selectors.apiClientFormMessage, 'Đang tạo API key...');
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
      setFormStatus(form, selectors.apiClientFormMessage, apiKeyMessage(result, 'Đã tạo cấu hình API.'));
      renderApiClients();
    } catch (error) {
      setFormStatus(form, selectors.apiClientFormMessage, error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function handleCreateSheetTarget(event) {
    const form = event.target.closest('#create-sheet-target-form');
    if (!form) {
      return;
    }

    event.preventDefault();
    setFormStatus(form, selectors.sheetTargetFormMessage, 'Đang lưu cấu hình Sheet...');
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
      setFormStatus(form, selectors.sheetTargetFormMessage, 'Đã lưu cấu hình Sheet.');
      renderSheetTargets();
      syncSheetTargetTypeOptions(document);
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.sheetTargetFormMessage, error.message);
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
    setFormStatus(form, selectors.apiClientFormMessage, 'Đang cập nhật cấu hình API...');

    try {
      await request(`/api/api-clients/${form.dataset.apiClientUpdate}`, { method: 'PUT', body: apiClientFormPayload(form) });
      setFormStatus(form, selectors.apiClientFormMessage, 'Đã cập nhật cấu hình API.');
      await refreshApiClients();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.apiClientFormMessage, error.message);
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
    setFormStatus(form, selectors.sheetTargetFormMessage, 'Đang cập nhật cấu hình Sheet...');

    try {
      await request(`/api/sheet-settings/${form.dataset.sheetTargetUpdate}`, { method: 'PUT', body: sheetTargetFormPayload(form) });
      setFormStatus(form, selectors.sheetTargetFormMessage, 'Đã cập nhật cấu hình Sheet.');
      await refreshSheetTargets();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.sheetTargetFormMessage, error.message);
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
      if (isInsideManagementPopup(button)) {
        closeManagementPopup();
      }
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
      if (isInsideManagementPopup(button)) {
        closeManagementPopup();
      }
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
    setFormStatus(form, selectors.branchFormMessage, createForm ? 'Đang tạo khu vực...' : 'Đang cập nhật khu vực...');

    try {
      if (createForm) {
        const data = Object.fromEntries(new FormData(createForm).entries());
        data.branch_id = createForm.dataset.branchId;
        await request('/api/areas', { method: 'POST', body: data });
        setFormStatus(form, selectors.branchFormMessage, 'Đã tạo khu vực.');
      } else {
        const data = Object.fromEntries(new FormData(updateForm).entries());
        await request(`/api/areas/${updateForm.dataset.areaUpdate}`, { method: 'PUT', body: data });
        setFormStatus(form, selectors.branchFormMessage, 'Đã cập nhật khu vực.');
      }

      await refreshBranches();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.branchFormMessage, error.message);
      submitButton.disabled = false;
    }
  }

  async function handleAreaDelete(event) {
    const button = event.target.closest('[data-delete-area]');

    if (!button) {
      return;
    }

    const areaName = button.dataset.areaName;
    if (!window.confirm(`Xóa khu vực “${areaName}”? Bàn của chi nhánh sẽ không bị ảnh hưởng.`)) {
      return;
    }

    button.disabled = true;

    try {
      await request(`/api/areas/${button.dataset.deleteArea}`, { method: 'DELETE' });
      selectors.branchFormMessage.textContent = 'Đã xóa khu vực.';
      await refreshBranches();
      if (isInsideManagementPopup(button)) {
        closeManagementPopup();
      }
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
    setFormStatus(form, selectors.formMessage, 'Đang cập nhật yêu cầu đặt bàn...');

    try {
      if (!validateEditBookingTime(form)) {
        button.disabled = false;
        return;
      }

      const data = bookingFormPayload(form);
      if (!data.branch_id) {
        setFormStatus(form, selectors.formMessage, 'Vui lòng chọn chi nhánh.');
        button.disabled = false;
        return;
      }
      if (!data.booking_time) {
        setFormStatus(form, selectors.formMessage, 'Vui lòng chọn ngày và giờ đặt bàn.');
        button.disabled = false;
        return;
      }
      const bookingBeforeUpdate = findBooking(form.dataset.bookingUpdate);
      const selectedArea = form.querySelector('[data-assign-area].selected');
      const selectedTableIds = selectedAssignTableIds(form);
      const previousTableIds = (bookingBeforeUpdate?.assigned_tables || []).map((table) => table.id);
      const branchChanged = bookingBeforeUpdate && String(data.branch_id) !== String(bookingBeforeUpdate.branch_id);
      const areaChanged = selectedTableIds.length > 0 && selectedArea && String(selectedArea.dataset.assignArea || '') !== String(bookingBeforeUpdate?.area_id || '');
      const assignmentChanged = branchChanged || areaChanged || !sameIdList(selectedTableIds, previousTableIds);

      if (selectedTableIds.length > 0 && selectedArea?.dataset.assignArea) {
        data.area_id = selectedArea.dataset.assignArea;
      }

      if (assignmentChanged && selectedTableIds.length === 0 && previousTableIds.length > 0 && !branchChanged) {
        setFormStatus(form, selectors.formMessage, 'Vui lòng chọn ít nhất một bàn khi thay đổi xếp bàn.');
        button.disabled = false;
        return;
      }

      await request(`/api/bookings/${form.dataset.bookingUpdate}`, { method: 'PUT', body: data });

      if (assignmentChanged && selectedTableIds.length > 0) {
        await request(`/api/bookings/${form.dataset.bookingUpdate}/assign`, {
          method: 'POST',
          body: { area_id: selectedArea?.dataset.assignArea, table_ids: selectedTableIds }
        });
      }
      setFormStatus(form, selectors.formMessage, 'Đã cập nhật yêu cầu đặt bàn.');
      await refreshDashboard();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.formMessage, error.message);
      button.disabled = false;
    }
  }

  async function handleBookingAssignSubmit(event) {
    const form = event.target.closest('[data-booking-assign]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const bookingId = form.dataset.bookingAssign;
    const button = form.querySelector('[type="submit"]');
    const tableIds = selectedAssignTableIds(form);
    const selectedArea = form.querySelector('[data-assign-area].selected');
    const autoConfirm = form.dataset.autoConfirm === 'true';
    button.disabled = true;
    setFormStatus(form, selectors.formMessage, autoConfirm ? 'Đang lưu bàn và xác nhận booking...' : 'Đang lưu bàn...');

    try {
      await request(`/api/bookings/${bookingId}/assign`, { method: 'POST', body: { area_id: selectedArea?.dataset.assignArea, table_ids: tableIds } });
      setFormStatus(form, selectors.formMessage, autoConfirm ? 'Đã lưu bàn và xác nhận booking.' : 'Đã lưu bàn.');
      await refreshDashboard();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.formMessage, error.message);
      button.disabled = false;
    }
  }

  async function handleTableBookingCreateSubmit(event) {
    const form = event.target.closest('[data-table-booking-create]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const data = tableBookingPayload(form);
    button.disabled = true;
    setFormStatus(form, selectors.formMessage, 'Đang tạo booking và xếp bàn...');

    if (!data.branch_id) {
      setFormStatus(form, selectors.formMessage, 'Vui lòng chọn chi nhánh.');
      button.disabled = false;
      return;
    }

    if (!data.booking_time) {
      setFormStatus(form, selectors.formMessage, 'Vui lòng chọn ngày và giờ đặt bàn.');
      button.disabled = false;
      return;
    }

    if (!data.table_ids.length) {
      setFormStatus(form, selectors.formMessage, 'Vui lòng chọn ít nhất một bàn.');
      button.disabled = false;
      return;
    }

    try {
      await request('/api/bookings', { method: 'POST', body: data });
      tableBookingSelectionIds.clear();
      updateTableBookingBar();
      setFormStatus(form, selectors.formMessage, 'Đã tạo booking và xếp bàn.');
      await refreshDashboard();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.formMessage, error.message);
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
      if (isInsideManagementPopup(button)) {
        closeManagementPopup();
      }
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
    setFormStatus(form, selectors.branchFormMessage, 'Đang cập nhật chi nhánh...');

    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await request(`/api/branches/${form.dataset.branchUpdate}`, { method: 'PUT', body: data });
      setFormStatus(form, selectors.branchFormMessage, 'Đã cập nhật chi nhánh.');
      await refreshBranches();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.branchFormMessage, error.message);
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
      if (isInsideManagementPopup(button)) {
        closeManagementPopup();
      }
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
    setFormStatus(form, selectors.userFormMessage, 'Đang cập nhật tài khoản...');

    try {
      await request(`/api/users/${form.dataset.userUpdate}`, { method: 'PUT', body: data });
      setFormStatus(form, selectors.userFormMessage, 'Đã cập nhật tài khoản.');
      await refreshUsers();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.userFormMessage, error.message);
      button.disabled = false;
    }
  }

  async function handleCustomerSubmit(event) {
    const form = event.target.closest('[data-customer-update]');
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    setFormStatus(form, selectors.customerFormMessage, 'Đang cập nhật khách hàng...');

    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await request(`/api/customers/${form.dataset.customerUpdate}`, { method: 'PUT', body: data });
      setFormStatus(form, selectors.customerFormMessage, 'Đã cập nhật khách hàng.');
      await refreshCustomers();
      closeManagementPopup();
    } catch (error) {
      setFormStatus(form, selectors.customerFormMessage, error.message);
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
      if (isInsideManagementPopup(button)) {
        closeManagementPopup();
      }
    } catch (error) {
      selectors.userFormMessage.textContent = error.message;
      button.disabled = false;
    }
  }

  function openManagementFromButton(button) {
    const type = button.dataset.openManagementPopup;

    if (type === 'booking-assign') {
      const booking = findBooking(button.dataset.bookingId);
      if (booking) {
        openManagementPopup({ eyebrow: 'Đặt bàn', title: button.dataset.bookingAssignTitle || 'Xếp bàn', body: bookingAssignForm(booking) });
      }
      return;
    }

    if (type === 'booking-edit') {
      const booking = findBooking(button.dataset.bookingId);
      if (booking) {
        openManagementPopup({
          eyebrow: 'Đặt bàn',
          title: 'Chỉnh sửa đặt bàn',
          body: bookingEditForm(booking),
          afterRender: (body) => {
            const form = body.querySelector('[data-booking-update]');
            const dateValue = form?.querySelector('[name="booking_date"]')?.value;
            if (form && dateValue) {
              updateBookingDateChips(dateValue, form);
            }
          }
        });
      }
      return;
    }

    if (type === 'branch-create') {
      openManagementPopup({ eyebrow: 'Chi nhánh', title: 'Tạo chi nhánh', body: branchCreateForm() });
      return;
    }

    if (type === 'branch-edit') {
      const branch = findBranch(button.dataset.branchId);
      if (branch) {
        openManagementPopup({ eyebrow: 'Chi nhánh', title: 'Chỉnh sửa chi nhánh', body: branchEditForm(branch) });
      }
      return;
    }

    if (type === 'area-create') {
      const branch = findBranch(button.dataset.branchId);
      if (branch) {
        openManagementPopup({ eyebrow: 'Khu vực', title: 'Thêm khu vực', body: areaCreateForm(branch) });
      }
      return;
    }

    if (type === 'area-edit') {
      const area = findArea(button.dataset.areaId);
      if (area) {
        openManagementPopup({ eyebrow: 'Khu vực', title: 'Chỉnh sửa khu vực', body: areaEditForm(area) });
      }
      return;
    }

    if (type === 'user-create') {
      openManagementPopup({ eyebrow: 'Người dùng', title: 'Tạo tài khoản', body: userCreateForm() });
      return;
    }

    if (type === 'user-edit') {
      const user = findUser(button.dataset.userId);
      if (user) {
        openManagementPopup({ eyebrow: 'Người dùng', title: 'Chỉnh sửa tài khoản', body: userEditForm(user) });
      }
      return;
    }

    if (type === 'customer-edit') {
      const customer = findCustomer(button.dataset.customerId);
      if (customer) {
        openManagementPopup({ eyebrow: 'Khách hàng', title: 'Chỉnh sửa khách hàng', body: customerEditForm(customer) });
      }
      return;
    }

    if (type === 'customer-history') {
      const customer = findCustomer(button.dataset.customerId);
      if (customer) {
        openManagementPopup({
          eyebrow: 'Khách hàng',
          title: 'Lịch sử đặt bàn',
          body: customerHistoryBody(customer, []),
          afterRender: async () => {
            try {
              const bookings = await request(scopedPathWithParams(`/api/customers/${customer.id}/bookings`, { limit: 30 }));
              if (selectors.managementPopupBody && !selectors.managementPopup.hidden) {
                selectors.managementPopupBody.innerHTML = customerHistoryBody(customer, bookings || []);
              }
            } catch (error) {
              if (selectors.managementPopupBody) {
                selectors.managementPopupBody.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(error.message)}</div>`;
              }
            }
          }
        });
      }
      return;
    }

    if (type === 'api-client-create') {
      openManagementPopup({ eyebrow: 'API', title: 'Tạo API key', body: apiClientCreateForm() });
      return;
    }

    if (type === 'api-client-edit') {
      const client = findApiClient(button.dataset.apiClientId);
      if (client) {
        openManagementPopup({ eyebrow: 'API', title: 'Chỉnh sửa API key', body: apiClientEditForm(client) });
      }
      return;
    }

    if (type === 'sheet-target-create') {
      openManagementPopup({ eyebrow: 'Sheet', title: 'Tạo cấu hình Sheet', body: sheetTargetCreateForm() });
      return;
    }

    if (type === 'sheet-target-edit') {
      const target = findSheetTarget(button.dataset.sheetTargetId);
      if (target) {
        openManagementPopup({ eyebrow: 'Sheet', title: 'Chỉnh sửa cấu hình Sheet', body: sheetTargetEditForm(target) });
      }
    }
  }

  async function handleAction(event) {
    const button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    const card = button.closest('[data-booking-id]');
    const bookingId = card?.dataset.bookingId || button.dataset.bookingId;
    if (!bookingId) {
      return;
    }
    const booking = findBooking(bookingId);
    const action = button.dataset.action;

    if (action === 'cancel' && !window.confirm(`Chuyển yêu cầu đặt bàn của “${booking ? booking.customer_name : bookingId}” sang Đã hủy?`)) {
      return;
    }

    button.disabled = true;

    try {
      if (action === 'confirm') {
        await request(`/api/bookings/${bookingId}`, { method: 'PUT', body: { status: 'CONFIRMED' } });
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

  async function handleBookingStatusSelect(event) {
    const select = event.target.closest('[data-booking-status-select]');

    if (!select) {
      return;
    }

    const bookingId = select.dataset.bookingId;
    const nextStatus = select.value;
    const previousStatus = select.dataset.currentStatus;

    if (!bookingId || nextStatus === previousStatus) {
      return;
    }

    select.disabled = true;

    try {
      await request(`/api/bookings/${bookingId}`, { method: 'PUT', body: { status: nextStatus } });
      select.dataset.currentStatus = nextStatus;
      await refreshDashboard();
    } catch (error) {
      select.value = previousStatus;
      window.alert(error.message);
      select.disabled = false;
    }
  }

  async function updateTableQuickStatusFast(tableId, nextStatus, booking) {
    await request(`/api/tables/${tableId}/status`, {
      method: 'PATCH',
      body: {
        status: nextStatus,
        booking_id: booking?.id,
        actual_guest_count: booking?.actual_guest_count || booking?.guest_count
      }
    });
  }

  async function handleTableStatusSelect(event) {
    const select = event.target.closest('[data-table-status-select]');

    if (!select) {
      return;
    }

    const tableId = select.dataset.tableId;
    const bookingId = select.dataset.bookingId;
    const nextStatus = select.value;
    const previousStatus = select.dataset.currentStatus;
    const booking = (state.tableStatuses?.bookings || []).find((item) => String(item.id) === String(bookingId)) || findBooking(bookingId);

    if (!tableId || !nextStatus || nextStatus === previousStatus) {
      return;
    }

    if (nextStatus !== 'AVAILABLE' && !booking) {
      select.value = previousStatus;
      window.alert('Cần có booking đã xếp bàn trước khi đổi trạng thái bàn.');
      return;
    }

    if (nextStatus === 'AVAILABLE' && booking && !window.confirm(`Chuyển bàn ${select.dataset.tableCode || ''} về Trống? Booking của “${booking.customer_name}” sẽ tự xoá các bàn đã xếp và trở về chưa xếp bàn.`)) {
      select.value = previousStatus;
      return;
    }

    select.disabled = true;

    try {
      await updateTableQuickStatusFast(tableId, nextStatus, booking);
      select.dataset.currentStatus = nextStatus;
      await refreshDashboard();
    } catch (error) {
      select.value = previousStatus;
      window.alert(error.message);
      select.disabled = false;
    }
  }

  const createBookingForm = document.getElementById('create-booking-form');
  if (createBookingForm) {
    createBookingForm.addEventListener('submit', handleCreate);
    createBookingForm.addEventListener('click', (event) => {
      const customerSuggestion = event.target.closest('[data-customer-suggestion]');
      if (customerSuggestion) {
        selectCustomerSuggestion(customerSuggestion);
      }
    });

    createBookingForm.addEventListener('pointerdown', (event) => {
      const customerSuggestion = event.target.closest('[data-customer-suggestion]');
      if (customerSuggestion) {
        event.preventDefault();
        selectCustomerSuggestion(customerSuggestion);
      }
    });

    const bookingDateInput = document.getElementById('booking-date');
    if (bookingDateInput) {
      bookingDateInput.addEventListener('change', () => updateBookingDateChips(bookingDateInput.value, createBookingForm));
    }
  }

  document.addEventListener('click', (event) => {
    const bookingFormControl = event.target.closest('[data-date-offset], [data-branch-choice], [data-time-choice], [data-guest-step]');
    const bookingForm = bookingFormControl?.closest('[data-booking-form]');
    if (bookingFormControl && bookingForm) {
      event.preventDefault();

      if (bookingFormControl.matches('[data-date-offset]')) {
        setBookingDateValue(dateOffsetValue(bookingFormControl.dataset.dateOffset), bookingForm);
        return;
      }

      if (bookingFormControl.matches('[data-branch-choice]')) {
        setBranchSelectValue(bookingForm.querySelector('[data-booking-branch]'), bookingFormControl.dataset.branchChoice);
        return;
      }

      if (bookingFormControl.matches('[data-time-choice]')) {
        setBookingTimeSlot(bookingFormControl.dataset.timeChoice, bookingForm);
        return;
      }

      if (bookingFormControl.matches('[data-guest-step]')) {
        const currentValue = Number(bookingForm.querySelector('[data-guest-count]')?.value || 2);
        setGuestCount(currentValue + Number(bookingFormControl.dataset.guestStep), bookingForm);
        return;
      }
    }

    const bookingTab = event.target.closest('[data-booking-tab]');
    if (bookingTab) {
      event.preventDefault();
      setActiveBookingTab(bookingTab.dataset.bookingTab);
      return;
    }

    const tableBookingSelect = event.target.closest('[data-table-booking-select]');
    if (tableBookingSelect) {
      toggleTableBookingSelection(tableBookingSelect);
      return;
    }

    const tableBookingButton = event.target.closest('[data-open-table-booking]');
    if (tableBookingButton) {
      event.preventDefault();
      openTableBookingPopup();
      return;
    }

    const assignAreaButton = event.target.closest('[data-assign-area]');
    if (assignAreaButton) {
      event.preventDefault();
      setAssignAreaFilter(assignAreaButton);
      return;
    }

    const assignTableButton = event.target.closest('[data-assign-table-card]');
    if (assignTableButton) {
      event.preventDefault();
      toggleAssignTable(assignTableButton);
      return;
    }

    const openButton = event.target.closest('[data-open-booking-popup]');
    if (openButton) {
      event.preventDefault();
      openBookingPopup();
      return;
    }

    const managementOpenButton = event.target.closest('[data-open-management-popup]');
    if (managementOpenButton) {
      event.preventDefault();
      openManagementFromButton(managementOpenButton);
      return;
    }

    const closeButton = event.target.closest('[data-close-booking-popup]');
    if (closeButton) {
      event.preventDefault();
      closeBookingPopup();
      return;
    }

    const managementCloseButton = event.target.closest('[data-close-management-popup]');
    if (managementCloseButton) {
      event.preventDefault();
      closeManagementPopup();
      return;
    }

    const addAreaButton = event.target.closest('[data-add-area-row]');
    if (addAreaButton) {
      event.preventDefault();
      addAreaInputRow({}, addAreaButton.closest('form')?.querySelector('#branch-area-inputs'));
      return;
    }

    const removeAreaButton = event.target.closest('[data-remove-area]');
    if (removeAreaButton) {
      event.preventDefault();
      const form = removeAreaButton.closest('form');
      const rows = form?.querySelectorAll('[data-area-row]') || [];
      if (rows.length <= 1) {
        setFormStatus(form, selectors.branchFormMessage, 'Mỗi chi nhánh phải có ít nhất một khu vực.');
        return;
      }

      removeAreaButton.closest('[data-area-row]')?.remove();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectors.bookingPopup && !selectors.bookingPopup.hidden) {
      closeBookingPopup();
    }
    if (event.key === 'Escape' && selectors.managementPopup && !selectors.managementPopup.hidden) {
      closeManagementPopup();
    }
  });

  document.addEventListener('change', (event) => {
    const bookingDateInput = event.target.closest('[data-booking-form] [name="booking_date"]');
    if (bookingDateInput) {
      updateBookingDateChips(bookingDateInput.value, bookingDateInput.closest('[data-booking-form]'));
    }
  });
  document.addEventListener('change', (event) => {
    const editDateInput = event.target.closest('[data-edit-booking-date]');
    if (editDateInput) {
      const form = editDateInput.closest('[data-booking-update]');
      syncEditTimeInput(form);
      refreshEditAssignmentGrid(form);
      return;
    }

    const editTimeInput = event.target.closest('[data-edit-booking-time]');
    if (editTimeInput) {
      refreshEditAssignmentGrid(editTimeInput.closest('[data-booking-update]'));
      return;
    }

    const editBranchSelect = event.target.closest('[data-edit-booking-branch]');
    if (editBranchSelect) {
      refreshEditAssignmentGrid(editBranchSelect.closest('[data-booking-update]'));
    }
  });
  document.addEventListener('change', handleBookingStatusSelect);
  document.addEventListener('change', handleTableStatusSelect);

  document.addEventListener('submit', handleCreateUser);
  document.addEventListener('submit', handleCreateBranch);
  document.addEventListener('submit', handleCreateApiClient);
  document.addEventListener('submit', handleCreateSheetTarget);
  document.addEventListener('submit', handleBookingAssignSubmit);
  document.addEventListener('submit', handleTableBookingCreateSubmit);
  document.addEventListener('submit', handleBookingSubmit);
  document.addEventListener('submit', handleAreaSubmit);
  document.addEventListener('submit', handleBranchSubmit);
  document.addEventListener('submit', handleApiClientSubmit);
  document.addEventListener('submit', handleSheetTargetSubmit);
  document.addEventListener('submit', handleUserSubmit);
  document.addEventListener('submit', handleCustomerSubmit);
  document.addEventListener('click', handleBookingDelete);
  document.addEventListener('click', handleAreaDelete);
  document.addEventListener('click', handleBranchDelete);
  document.addEventListener('click', handleApiClientDelete);
  document.addEventListener('click', handleApiClientKeyRotate);
  document.addEventListener('click', handleSheetTargetDelete);
  document.addEventListener('click', handleUserDelete);

  if (selectors.branchScope) {
    selectors.branchScope.addEventListener('change', (event) => {
      const url = new URL(window.location.href);

      if (event.currentTarget.value) {
        url.searchParams.set('branch_id', event.currentTarget.value);
      } else {
        url.searchParams.delete('branch_id');
      }

      if (usesDashboardDateScope()) {
        const bookingDate = selectedDashboardBookingDate();
        if (bookingDate) {
          url.searchParams.set('booking_date', bookingDate);
        }
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

  if (selectors.bookingQuickSearch) {
    selectors.bookingQuickSearch.addEventListener('input', () => {
      bookingQuickSearchValue = selectors.bookingQuickSearch.value;
      renderBookingBoard();
    });
  }

  if (selectors.tableQuickSearch) {
    selectors.tableQuickSearch.addEventListener('input', () => {
      tableQuickSearchValue = selectors.tableQuickSearch.value;
      renderTableStatusBoard();
    });
  }

  if (notificationSound) {
    document.addEventListener('pointerdown', unlockNotificationSound, { passive: true });
    document.addEventListener('keydown', unlockNotificationSound);
  }

  if (selectors.customerSearch) {
    let customerSearchTimer;
    selectors.customerSearch.addEventListener('input', () => {
      window.clearTimeout(customerSearchTimer);
      customerSearchTimer = window.setTimeout(async () => {
        selectors.customerFormMessage.textContent = 'Đang tìm khách hàng...';
        try {
          await refreshCustomers(selectors.customerSearch.value);
          selectors.customerFormMessage.textContent = '';
        } catch (error) {
          selectors.customerFormMessage.textContent = error.message;
        }
      }, 250);
    });
  }

  const bookingPhoneInput = document.getElementById('booking-phone');
  if (bookingPhoneInput) {
    let phoneLookupTimer;
    bookingPhoneInput.addEventListener('input', () => {
      window.clearTimeout(phoneLookupTimer);
      phoneLookupTimer = window.setTimeout(() => suggestCustomersForBooking(bookingPhoneInput.value), 250);
    });
    bookingPhoneInput.addEventListener('blur', () => suggestCustomersForBooking(bookingPhoneInput.value));
  }

  document.addEventListener('click', handleAction);

  if (window.io) {
    const socket = window.io();
    socket.on('booking_created', () => {
      playNotificationSound();
      refreshDashboard();
    });
    for (const eventName of events.filter((eventName) => eventName !== 'booking_created')) {
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
