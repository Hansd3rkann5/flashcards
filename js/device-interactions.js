// Device Interactions + Global UX Guards
// ============================================================================
/**
* @function triggerHaptic
 * @description Triggers device haptic feedback when supported by the current platform.
 */

function triggerHaptic(kind = 'light') {
  const style = kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT';

  // Telegram WebApp haptics (if embedded)
  try {
    const tg = window.Telegram?.WebApp?.HapticFeedback;
    if (tg?.impactOccurred) {
      const m = kind === 'heavy' ? 'heavy' : kind === 'medium' ? 'medium' : 'light';
      tg.impactOccurred(m);
      return;
    }
  } catch (_) { }

  // Capacitor haptics (if embedded in native shell)
  try {
    const haptics = window.Capacitor?.Plugins?.Haptics;
    if (haptics?.impact) {
      haptics.impact({ style });
      return;
    }
  } catch (_) { }

  // Cordova TapticEngine (if available)
  try {
    const taptic = window.TapticEngine;
    if (taptic?.impact) {
      const m = kind === 'heavy' ? 'heavy' : kind === 'medium' ? 'medium' : 'light';
      taptic.impact(m);
      return;
    }
  } catch (_) { }

  // Browser vibration fallback (Android browsers)
  try {
    if (!navigator.vibrate) return;
    const duration = kind === 'medium' ? 14 : kind === 'heavy' ? 20 : 8;
    navigator.vibrate(duration);
  } catch (_) { }
}

/**
 * @function wireHapticFeedback
 * @description Wires haptic feedback.
 */

function wireHapticFeedback() {
  const supportsTouch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  if (!supportsTouch) return;

  let lastPulse = 0;
  const pulse = target => {
    if (!target) return;
    if (target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true') return;
    const now = Date.now();
    if (now - lastPulse < 60) return;
    lastPulse = now;
    const kind = target.dataset.grade ? 'medium' : 'light';
    triggerHaptic(kind);
  };

  document.addEventListener('touchstart', e => {
    const target = e.target.closest('button, .btn');
    pulse(target);
  }, { passive: true });

  document.addEventListener('click', e => {
    const target = e.target.closest('button, .btn');
    pulse(target);
  }, true);
}

/**
 * @function wireNoZoomGuards
 * @description Wires no zoom guards.
 */

function wireNoZoomGuards() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
    document.addEventListener(evt, e => e.preventDefault(), { passive: false });
  });

  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    if (e.target.closest('input, textarea, select, [contenteditable=\"true\"]')) return;
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('wheel', e => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', e => {
    const zoomKeys = ['+', '-', '=', '0'];
    if ((e.ctrlKey || e.metaKey) && zoomKeys.includes(e.key)) e.preventDefault();
  });
}

/**
 * @function wireHomePullToRefresh
 * @description Adds pull-to-refresh for Home view with a fill animation and release threshold.
 */

function wireHomePullToRefresh() {
  const homePanel = el('homePanel');
  const homeScroll = el('dailyReviewHomePanel');
  const indicator = el('homePullToRefresh');
  const labelEl = el('homePullToRefreshLabel');
  if (!homePanel || !homeScroll || !indicator || !labelEl) return;

  const supportsTouch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  if (!supportsTouch) return;

  const PULL_THRESHOLD_PX = 92;
  const MAX_PULL_PX = 150;
  const RELEASE_TRANSITION = 'transform 220ms cubic-bezier(0.22, 0.85, 0.26, 1)';
  const SETTLE_DISTANCE_PX = 66;
  const LABEL_PULL = 'Pull to refresh';
  const LABEL_RELEASE = 'Release to refresh';
  const LABEL_CLEARING = 'Clearing cache...';
  const LABEL_REFRESH = 'Refreshing...';
  let tracking = false;
  let pulling = false;
  let armed = false;
  let refreshing = false;
  let thresholdPulseSent = false;
  let startX = 0;
  let startY = 0;
  let pullDistance = 0;

  const setIndicatorProgress = value => {
    const clamped = Math.max(0, Math.min(1, Number(value) || 0));
    homePanel.style.setProperty('--home-pull-progress', clamped.toFixed(3));
  };

  const setVisualState = () => {
    homePanel.classList.toggle('pull-refresh-active', pulling || refreshing);
    homePanel.classList.toggle('pull-refresh-armed', armed && !refreshing);
    homePanel.classList.toggle('pull-refresh-refreshing', refreshing);
  };

  const resetPullState = (immediate = false) => {
    tracking = false;
    pulling = false;
    armed = false;
    refreshing = false;
    startX = 0;
    startY = 0;
    pullDistance = 0;
    thresholdPulseSent = false;
    setIndicatorProgress(0);
    labelEl.textContent = LABEL_PULL;
    setVisualState();
    if (immediate) {
      homeScroll.style.transition = '';
      homeScroll.style.transform = '';
      return;
    }
    homeScroll.style.transition = RELEASE_TRANSITION;
    homeScroll.style.transform = '';
    window.setTimeout(() => {
      if (!refreshing) homeScroll.style.transition = '';
    }, 240);
  };

  const clearCachesBeforeReload = async () => {
    if (typeof invalidateApiStoreCache === 'function') {
      try {
        invalidateApiStoreCache();
      } catch (_) { }
    }
    if (!('caches' in window)) return;
    let cacheNames = [];
    try {
      cacheNames = await caches.keys();
    } catch (_) {
      return;
    }
    const appCacheNames = cacheNames.filter(name => String(name || '').startsWith('flashcards-'));
    if (!appCacheNames.length) return;
    await Promise.all(appCacheNames.map(async cacheName => {
      try {
        await caches.delete(cacheName);
      } catch (_) { }
    }));
  };

  document.addEventListener('touchstart', e => {
    if (refreshing) return;
    if (currentView !== 0) return;
    if (document.querySelector('dialog[open]')) return;
    if (!e.touches || e.touches.length !== 1) return;
    if (homeScroll.scrollTop > 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest('#homePanel')) return;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    tracking = true;
    pulling = false;
    armed = false;
    pullDistance = 0;
    thresholdPulseSent = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    homeScroll.style.transition = '';
    labelEl.textContent = LABEL_PULL;
    setIndicatorProgress(0);
    setVisualState();
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!tracking || refreshing) return;
    if (currentView !== 0) {
      resetPullState(true);
      return;
    }
    if (!e.touches || !e.touches.length) return;

    const touch = e.touches[0];
    const dy = touch.clientY - startY;
    const dx = touch.clientX - startX;

    if (!pulling) {
      if (dy <= 0) return;
      if (Math.abs(dx) > Math.abs(dy) + 4) {
        tracking = false;
        return;
      }
      if (homeScroll.scrollTop > 0) {
        tracking = false;
        return;
      }
      pulling = true;
    }

    if (dy <= 0) {
      resetPullState(false);
      return;
    }
    if (homeScroll.scrollTop > 0) {
      resetPullState(false);
      return;
    }

    // Keep drag responsive but damped so long pulls feel controlled.
    const damped = dy * 0.58;
    const eased = damped <= PULL_THRESHOLD_PX
      ? damped
      : PULL_THRESHOLD_PX + Math.sqrt(damped - PULL_THRESHOLD_PX) * 12;
    pullDistance = Math.min(MAX_PULL_PX, eased);
    const wasArmed = armed;
    armed = pullDistance >= PULL_THRESHOLD_PX;
    if (armed && !wasArmed && !thresholdPulseSent) {
      thresholdPulseSent = true;
      triggerHaptic('medium');
    }
    labelEl.textContent = armed ? LABEL_RELEASE : LABEL_PULL;
    setIndicatorProgress(pullDistance / PULL_THRESHOLD_PX);
    setVisualState();
    homeScroll.style.transform = `translate3d(0, ${pullDistance.toFixed(2)}px, 0)`;
    e.preventDefault();
  }, { passive: false });

  const handleTouchEnd = async () => {
    if (!tracking && !pulling) return;
    tracking = false;
    if (!pulling) {
      resetPullState(false);
      return;
    }
    if (!armed) {
      resetPullState(false);
      return;
    }
    refreshing = true;
    pulling = false;
    armed = false;
    labelEl.textContent = LABEL_CLEARING;
    setIndicatorProgress(1);
    setVisualState();
    homeScroll.style.transition = RELEASE_TRANSITION;
    homeScroll.style.transform = `translate3d(0, ${SETTLE_DISTANCE_PX}px, 0)`;
    // Keep UX responsive: cache clear should not block indefinitely.
    await Promise.race([
      clearCachesBeforeReload(),
      new Promise(resolve => window.setTimeout(resolve, 1600))
    ]);
    labelEl.textContent = LABEL_REFRESH;
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  };

  document.addEventListener('touchend', handleTouchEnd);
  document.addEventListener('touchcancel', handleTouchEnd);
}

const uid = () => {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};

// ============================================================================
