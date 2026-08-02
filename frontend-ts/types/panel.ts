// Shared panel types (global script scope)
// ============================================================================

type PanelSelectorFn = (id: string) => HTMLElement | null;

interface PanelComponentLike {
  readonly id: string;
  readonly index: number;
  setActive(active: boolean): void;
}

interface PanelViewManagerOptions {
  trackId?: string;
  exchangeViewIndex?: number;
  hideSidebarViewIndex?: number;
}
