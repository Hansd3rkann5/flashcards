// Hook-like helper placeholder for future UI-framework migration.
// In the current vanilla app this is intentionally a simple utility.

function readCurrentPanelView(): number {
  const raw = Number((window as unknown as { currentView?: number }).currentView ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}
