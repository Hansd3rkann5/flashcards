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
