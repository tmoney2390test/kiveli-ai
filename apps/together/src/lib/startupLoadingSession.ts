const STARTUP_COMPLETE_KEY = 'kivelli:startup-complete';

export function hasCompletedStartupInThisTab() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(STARTUP_COMPLETE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markStartupCompleteInThisTab() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STARTUP_COMPLETE_KEY, '1');
  } catch {
    // Private browsing can disable session storage; in-memory gate state still works.
  }
}
