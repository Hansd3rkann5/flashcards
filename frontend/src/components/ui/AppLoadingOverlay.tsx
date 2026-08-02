import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const DEFAULT_LOADING_MESSAGE = 'Loading...';

type LoadingTask<T> = () => Promise<T> | T;

declare global {
  interface Window {
    showGlobalLoading?: (message?: string) => void;
    hideGlobalLoading?: () => void;
    setGlobalLoadingMessage?: (message?: string) => void;
    forceHideGlobalLoading?: () => void;
  }
}

export interface AppLoadingControls {
  isVisible: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
  forceHide: () => void;
  setMessage: (message?: string) => void;
  withTask: <T>(task: LoadingTask<T>, message?: string) => Promise<T>;
}

const AppLoadingContext = createContext<AppLoadingControls | null>(null);

function normalizeLoadingMessage(message: string | undefined): string {
  const safe = String(message || '').trim();
  return safe || DEFAULT_LOADING_MESSAGE;
}

export function AppLoadingProvider({ children }: { children: ReactNode }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [message, setMessageState] = useState(DEFAULT_LOADING_MESSAGE);

  const setMessage = useCallback((nextMessage?: string) => {
    setMessageState(normalizeLoadingMessage(nextMessage));
  }, []);

  const show = useCallback((nextMessage?: string) => {
    setMessageState(normalizeLoadingMessage(nextMessage));
    setVisibleCount(prev => prev + 1);
  }, []);

  const hide = useCallback(() => {
    setVisibleCount(prev => Math.max(0, prev - 1));
  }, []);

  const forceHide = useCallback(() => {
    setVisibleCount(0);
  }, []);

  const withTask = useCallback(
    async <T,>(task: LoadingTask<T>, nextMessage?: string): Promise<T> => {
      show(nextMessage);
      try {
        return await Promise.resolve(task());
      } finally {
        hide();
      }
    },
    [show, hide]
  );

  const isVisible = visibleCount > 0;

  useEffect(() => {
    document.body.classList.toggle('app-loading', isVisible);
    return () => {
      document.body.classList.remove('app-loading');
    };
  }, [isVisible]);

  useEffect(() => {
    window.showGlobalLoading = show;
    window.hideGlobalLoading = hide;
    window.setGlobalLoadingMessage = setMessage;
    window.forceHideGlobalLoading = forceHide;
    return () => {
      delete window.showGlobalLoading;
      delete window.hideGlobalLoading;
      delete window.setGlobalLoadingMessage;
      delete window.forceHideGlobalLoading;
    };
  }, [show, hide, setMessage, forceHide]);

  const controls = useMemo<AppLoadingControls>(
    () => ({
      isVisible,
      message,
      show,
      hide,
      forceHide,
      setMessage,
      withTask
    }),
    [isVisible, message, show, hide, forceHide, setMessage, withTask]
  );

  return (
    <AppLoadingContext.Provider value={controls}>
      {children}
      <dialog
        id="appLoadingOverlay"
        className={`app-loading-overlay${isVisible ? ' is-visible' : ''}`}
        aria-hidden={isVisible ? 'false' : 'true'}
        open={isVisible}
      >
        <div id="appLoadingOverlayInner" role="status" aria-live="polite" aria-atomic="true" className="app-loading-inner">
          <div id="appLoadingOverlayLoaderStack" aria-hidden="true" className="app-loader-stack">
            <span id="appLoadingOverlayLoaderCard1" className="app-loader-card card-one" />
            <span id="appLoadingOverlayLoaderCard2" className="app-loader-card card-two" />
            <span id="appLoadingOverlayLoaderCard3" className="app-loader-card card-three" />
          </div>
          <div id="appLoadingOverlayLabel" className="app-loading-label">{message}</div>
        </div>
      </dialog>
    </AppLoadingContext.Provider>
  );
}

export function useAppLoading(): AppLoadingControls {
  const context = useContext(AppLoadingContext);
  if (!context) {
    throw new Error('useAppLoading must be used within AppLoadingProvider.');
  }
  return context;
}
