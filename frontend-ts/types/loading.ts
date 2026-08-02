// Shared loading helper component types (global script scope)
// ============================================================================

interface LoadingHelperOptions {
  overlayId?: string;
  labelId?: string;
  defaultMessage?: string;
}

interface LoadingHelperComponentLike {
  show(message?: string): void;
  hide(): void;
  setMessage(message?: string): void;
  forceHide(): void;
  withTask<T>(message: string, task: (() => Promise<T>) | (() => T)): Promise<T>;
}

declare function setAppLoadingState(active?: boolean, label?: string): void;
declare function setAppLoadingLabel(label?: string): void;

interface Window {
  loadingHelper?: LoadingHelperComponentLike;
  showGlobalLoading?: (message?: string) => void;
  hideGlobalLoading?: () => void;
  setGlobalLoadingMessage?: (message?: string) => void;
}
