(function themeSwitcher() {
  const storageKey = 'restaurant-booking-theme';
  const root = document.documentElement;
  const toggles = document.querySelectorAll('[data-theme-toggle]');

  function getPreferredTheme() {
    try {
      const savedTheme = window.localStorage.getItem(storageKey);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        return savedTheme;
      }
    } catch (error) {
      return 'light';
    }

    return 'light';
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.dataset.bsTheme = theme;

    for (const toggle of toggles) {
      const isDark = theme === 'dark';
      toggle.textContent = isDark ? 'Sáng' : 'Tối';
      toggle.setAttribute('aria-label', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
      toggle.setAttribute('aria-pressed', String(isDark));
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch (error) {
      return;
    }
  }

  applyTheme(getPreferredTheme());

  for (const toggle of toggles) {
    toggle.addEventListener('click', () => {
      const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      saveTheme(nextTheme);
    });
  }
})();
