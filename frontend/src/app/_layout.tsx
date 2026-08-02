import { MenuOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useLocation, useMatch, useNavigate, useOutlet } from 'react-router-dom';
import { AppButton } from '../components/ui/AppButton';
import { AppDialog } from '../components/ui/AppDialog';
import { AppHeader } from '../components/ui/AppHeader';
import { useAppLoading } from '../components/ui/AppLoadingOverlay';
import { AppPanel } from '../components/ui/AppPanel';
import { AppSidebar } from '../components/ui/AppSidebar';
import { ArchivedSubjectsDialog } from '../components/ui/ArchivedSubjectsDialog';
import { SubjectTile } from '../components/ui/SubjectTile';
import { getSubjects, type SubjectRecord } from '../lib/api';
import { sortSubjectsByLastEdited } from '../lib/subjects';
import {
  getSubjectsFromSupabaseIfConfigured,
  hasValidSupabaseSession,
  isSupabaseConfigured,
  signOutFromSupabase,
  signInWithSupabase,
  signUpWithSupabase
} from '../lib/supabase-subjects';

const PANEL_SLIDE_MS = 520;

type SlideDirection = 'left' | 'right';

interface RouteTransitionState {
  direction: SlideDirection;
  active: boolean;
  leaving: ReactNode;
  entering: ReactNode;
}

interface LayoutPanelSurfaceStyle extends CSSProperties {
  marginInlineStart?: string;
  marginInlineEnd?: string;
}

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= 900);
  const [sidebarForcedHidden, setSidebarForcedHidden] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => window.innerWidth <= 900);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsError, setSubjectsError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authBootstrapLoading, setAuthBootstrapLoading] = useState(true);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { show: showAppLoading, hide: hideAppLoading } = useAppLoading();

  const loadSubjects = useCallback(async () => {
    const authErrorPattern = /auth|authentication|session|required|user/i;
    showAppLoading('Loading subjects...');
    setSubjectsLoading(true);
    setSubjectsError('');
    try {
      let apiRows: SubjectRecord[] = [];
      let apiError: unknown = null;
      let supabaseRows: SubjectRecord[] = [];
      let supabaseError: unknown = null;

      try {
        apiRows = await getSubjects();
      } catch (error) {
        apiError = error;
      }

      try {
        const fallbackRows = await getSubjectsFromSupabaseIfConfigured();
        if (Array.isArray(fallbackRows)) supabaseRows = fallbackRows;
      } catch (error) {
        supabaseError = error;
      }

      const rows = mergeSubjectSources(apiRows, supabaseRows);
      const visible = rows.filter(subject => subject?.isArchived !== true);
      if (!rows.length && (apiError || supabaseError)) throw supabaseError || apiError;
      setSubjects(sortSubjectsByLastEdited(visible));
    } catch (error) {
      try {
        const fallbackRows = await getSubjectsFromSupabaseIfConfigured();
        if (Array.isArray(fallbackRows) && fallbackRows.length) {
          const visible = fallbackRows.filter(subject => subject?.isArchived !== true);
          setSubjects(sortSubjectsByLastEdited(visible));
          setSubjectsError('');
          return;
        }
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        setSubjectsError(`Could not load subjects from API/Supabase: ${fallbackMessage}`);
        setSubjects([]);
        if (isSupabaseConfigured() && authErrorPattern.test(fallbackMessage)) {
          setIsAuthenticated(false);
          setAuthDialogOpen(true);
          setAuthMessage('Please sign in to load your subjects.');
        }
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setSubjects([]);
      setSubjectsError(`Could not load subjects: ${message}`);
      if (isSupabaseConfigured() && authErrorPattern.test(message)) {
        setIsAuthenticated(false);
        setAuthDialogOpen(true);
        setAuthMessage('Please sign in to load your subjects.');
      }
    } finally {
      setSubjectsLoading(false);
      hideAppLoading();
    }
  }, [showAppLoading, hideAppLoading]);

  const sidebarOptions = useMemo(
    () => [
      { id: 'home', label: 'Home', onClick: () => navigate('/') },
      { id: 'settings', label: 'Settings' },
      { id: 'archive', label: 'Archive', onClick: () => setArchiveDialogOpen(true) },
    ],
    [navigate]
  );

  const subjectTiles = useMemo(() => {
    if (subjectsLoading) return [<div key="loading" id="sidebarSubjectsLoading" style={styles.subjectsStatus}>Loading subjects…</div>];
    if (subjectsError) return [<div key="error" id="sidebarSubjectsError" style={styles.subjectsStatus}>{subjectsError}</div>];
    if (!subjects.length) return [<div key="empty" id="sidebarSubjectsEmpty" style={styles.subjectsStatus}>No subjects yet.</div>];
    return subjects.map(subject => {
      const subjectName = String(subject?.name || '').trim() || 'Untitled subject';
      const subjectId = String(subject?.id || '').trim();
      const subjectIdSuffix = toDomIdSuffix(subjectId);
      return (
        <SubjectTile
          key={subject.id}
          id={`sidebarSubjectTile-${subjectIdSuffix}`}
          subjectName={subjectName}
          accent={String(subject?.accent || '#2dd4bf')}
          onClick={() => navigate(`/subject/${encodeURIComponent(subjectId)}`)}
          onEdit={() => {
            window.alert(`Subject edit for "${subjectName}" is not migrated yet.`);
          }}
          onArchive={() => {
            window.alert(`Subject archive for "${subjectName}" is not migrated yet.`);
          }}
          onDelete={() => {
            window.alert(`Subject delete for "${subjectName}" is not migrated yet.`);
          }}
        />
      );
    });
  }, [subjects, subjectsLoading, subjectsError, navigate]);

  const openSidebarWidth = isNarrowViewport
    ? 'min(82vw, 340px)'
    : 'clamp(240px, 26vw, 310px)';
  const sidebarHidden = sidebarCollapsed || sidebarForcedHidden;
  const openSidebarTrackWidth = `calc(${openSidebarWidth} + (var(--s20) * 2))`;
  const shellStyle = useMemo(() => ({
    ...styles.appShell,
    gridTemplateColumns: `${sidebarHidden ? '0px' : openSidebarTrackWidth} minmax(0, 1fr)`
  }), [sidebarHidden, openSidebarTrackWidth]);
  const panelInsetStart = sidebarHidden ? 'var(--s20)' : openSidebarTrackWidth;
  const panelSurfaceStyle = useMemo(() => ({
    width: 'auto',
    marginInlineStart: panelInsetStart,
    marginInlineEnd: 'var(--s20)'
  } satisfies CSSProperties), [panelInsetStart]);
  const transitionViewportStyle = useMemo(() => ({
    ...styles.panelTransitionViewport,
    marginInlineStart: sidebarHidden ? '0px' : `calc(${openSidebarTrackWidth} * -1)`,
    width: sidebarHidden ? '100%' : `calc(100% + ${openSidebarTrackWidth})`
  } satisfies CSSProperties), [sidebarHidden, openSidebarTrackWidth]);
  const sidebarStyle = useMemo(() => ({
    ...styles.appSidebar,
    width: openSidebarWidth,
    ...(sidebarHidden ? styles.appSidebarHidden : styles.appSidebarVisible)
  }), [openSidebarWidth, sidebarHidden]);

  const subjectMatch = useMatch('/subject/:subjectId');
  const isSubjectRoute = !!subjectMatch;
  const openSidebar = useCallback(() => {
    setSidebarCollapsed(false);
  }, []);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);
  const outletContext = useMemo(
    () => ({
      subjects,
      subjectsLoading,
      subjectsError,
      openSidebar,
      toggleSidebar,
      panelSurfaceStyle,
      setSidebarForcedHidden
    }),
    [subjects, subjectsLoading, subjectsError, openSidebar, toggleSidebar, panelSurfaceStyle]
  );
  const outletElement = useOutlet(outletContext);
  const currentPanelNode = useMemo(
    () => {
      if (isSubjectRoute) {
        return (
          <div id="subjectRouteContentWrap" style={styles.routeContentWrap}>
            {outletElement}
          </div>
        );
      }
      return (
        <AppPanel
          id="homeAppPanel"
          headerWrapId="homeAppPanelHeaderWrap"
          sectionsId="homeAppPanelSections"
          sectionIdPrefix="homeAppPanelSection"
          style={panelSurfaceStyle}
          header={(
            <AppHeader
              id="homePanelHeader"
              titleId="homePanelHeaderTitle"
              leftSlotId="homePanelHeaderLeftSlot"
              rightSlotId="homePanelHeaderRightSlot"
              title="Home Panel"
              leftSlot={(
                <AppButton
                  id="homePanelSidebarToggleBtn"
                  rect
                  icon={<MenuOutlined />}
                  ariaLabel="Toggle sidebar"
                  title="Toggle sidebar"
                  onClick={() => setSidebarCollapsed(prev => !prev)}
                />
              )}
            />
          )}
          sections={[
            {
              content: (
                <div id="homeRouteContentWrap" style={styles.routeContentWrap}>
                  {outletElement}
                </div>
              ),
              framed: false
            }
          ]}
        />
      );
    },
    [isSubjectRoute, outletElement, panelSurfaceStyle]
  );
  const [activePanelNode, setActivePanelNode] = useState<ReactNode>(currentPanelNode);
  const [routeTransition, setRouteTransition] = useState<RouteTransitionState | null>(null);
  const previousPathRef = useRef(location.pathname);
  const getRouteTransitionDirection = useCallback((previousPath: string, nextPath: string): SlideDirection | null => {
    const from = classifyPanelPath(previousPath);
    const to = classifyPanelPath(nextPath);
    if (from === 'home' && to === 'subject') return 'left';
    if (from === 'subject' && to === 'home') return 'right';
    if (from !== 'subject' || to !== 'subject' || previousPath === nextPath) return null;

    const previousSubjectId = getSubjectIdFromPath(previousPath);
    const nextSubjectId = getSubjectIdFromPath(nextPath);
    if (!previousSubjectId || !nextSubjectId || previousSubjectId === nextSubjectId) return null;

    const orderedSubjectIds = subjects
      .map(subject => String(subject?.id || '').trim())
      .filter(Boolean);
    const previousIndex = orderedSubjectIds.indexOf(previousSubjectId);
    const nextIndex = orderedSubjectIds.indexOf(nextSubjectId);
    if (previousIndex >= 0 && nextIndex >= 0 && previousIndex !== nextIndex) {
      return nextIndex > previousIndex ? 'left' : 'right';
    }
    return nextSubjectId.localeCompare(previousSubjectId) > 0 ? 'left' : 'right';
  }, [subjects]);

  useEffect(() => {
    if (routeTransition) return;
    setActivePanelNode(currentPanelNode);
  }, [currentPanelNode, routeTransition]);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    if (location.pathname === previousPath) return;
    const direction = getRouteTransitionDirection(previousPath, location.pathname);
    if (!direction) {
      setActivePanelNode(currentPanelNode);
      previousPathRef.current = location.pathname;
      return;
    }
    setRouteTransition({
      direction,
      active: false,
      leaving: activePanelNode,
      entering: currentPanelNode
    });
    previousPathRef.current = location.pathname;
  }, [location.pathname, currentPanelNode, activePanelNode, getRouteTransitionDirection]);

  useEffect(() => {
    if (!routeTransition || routeTransition.active) return;
    const frame = window.requestAnimationFrame(() => {
      setRouteTransition(prev => (prev ? { ...prev, active: true } : prev));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [routeTransition]);

  useEffect(() => {
    if (!routeTransition?.active) return;
    const timeout = window.setTimeout(() => {
      setActivePanelNode(routeTransition.entering);
      setRouteTransition(null);
    }, PANEL_SLIDE_MS);
    return () => window.clearTimeout(timeout);
  }, [routeTransition]);

  useEffect(() => {
    const handleResize = () => setIsNarrowViewport(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    let closedBootstrapLoading = false;
    const closeBootstrapLoading = () => {
      if (closedBootstrapLoading) return;
      closedBootstrapLoading = true;
      hideAppLoading();
    };
    showAppLoading('Loading your workspace...');
    const bootstrapAuth = async () => {
      setAuthBootstrapLoading(true);
      setAuthDialogOpen(false);
      try {
        if (!isSupabaseConfigured()) {
          if (!active) return;
          setIsAuthenticated(false);
          setSubjects([]);
          setSubjectsLoading(false);
          setAuthMessage('Supabase is not configured. Please add Supabase config first.');
          return;
        }
        const hasSession = await hasValidSupabaseSession();
        if (!active) return;
        if (hasSession) {
          setIsAuthenticated(true);
          setAuthDialogOpen(false);
          setAuthMessage('');
          await loadSubjects();
          return;
        }
        setIsAuthenticated(false);
        setSubjects([]);
        setSubjectsLoading(false);
        setAuthMessage('Please sign in with your Supabase account to open the app.');
        setAuthDialogOpen(true);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setIsAuthenticated(false);
        setSubjects([]);
        setSubjectsLoading(false);
        setAuthMessage(message || 'Could not validate your session. Please sign in.');
        setAuthDialogOpen(true);
      } finally {
        if (active) setAuthBootstrapLoading(false);
        closeBootstrapLoading();
      }
    };
    void bootstrapAuth();
    return () => {
      active = false;
      closeBootstrapLoading();
    };
  }, [loadSubjects, showAppLoading, hideAppLoading]);

  const handleAuthSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage('');
    try {
      await signInWithSupabase(authEmail, authPassword);
      setIsAuthenticated(true);
      setAuthDialogOpen(false);
      setAuthPassword('');
      await loadSubjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthMessage(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSignUp = async () => {
    setAuthLoading(true);
    setAuthMessage('');
    try {
      await signUpWithSupabase(authEmail, authPassword);
      setAuthMessage('Account created. Check your inbox to confirm your email, then sign in.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthMessage(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await signOutFromSupabase();
      setIsAuthenticated(false);
      setSubjects([]);
      setSubjectsError('');
      setSubjectsLoading(false);
      setAuthPassword('');
      setAuthDialogOpen(true);
      setAuthMessage('You have been signed out.');
      navigate('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthMessage(`Logout failed: ${message}`);
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleAuthDialogClose = () => {
    if (!isAuthenticated) {
      setAuthDialogOpen(true);
      setAuthMessage(prev => prev || 'Sign in is required to use the app.');
      return;
    }
    setAuthDialogOpen(false);
  };

  return (
    <div id="appViewport" style={styles.viewport}>
      {isAuthenticated ? (
        <div id="appShell" style={shellStyle}>
          <aside id="appSidebarRail" style={styles.sidebarRail} aria-hidden={sidebarCollapsed}>
            <AppSidebar
              id="appSidebar"
              appTitle="MyFlashcards"
              options={sidebarOptions}
              subjects={subjectTiles}
              onLogout={handleLogout}
              logoutDisabled={logoutLoading}
              metaText="© SimonBader"
              style={sidebarStyle}
            />
          </aside>

          <main id="appMain" style={styles.appMain}>
            <div id="panelTransitionViewport" style={transitionViewportStyle}>
              {routeTransition ? (
                <>
                  <div
                    id="panelLayerEntering"
                    style={{
                      ...styles.panelLayer,
                      ...styles.panelLayerAnimated,
                      transform: getEnteringTransform(routeTransition.direction, routeTransition.active),
                      opacity: getEnteringOpacity(routeTransition.active),
                      transitionDuration: `${PANEL_SLIDE_MS}ms`
                    }}
                  >
                    {routeTransition.entering}
                  </div>
                  <div
                    id="panelLayerLeaving"
                    style={{
                      ...styles.panelLayer,
                      ...styles.panelLayerOverlay,
                      ...styles.panelLayerAnimated,
                      transform: getLeavingTransform(routeTransition.direction, routeTransition.active),
                      opacity: getLeavingOpacity(routeTransition.active),
                      transitionDuration: `${PANEL_SLIDE_MS}ms`
                    }}
                  >
                    {routeTransition.leaving}
                  </div>
                </>
              ) : (
                <div id="panelLayerActive" style={styles.panelLayer}>{activePanelNode}</div>
              )}
            </div>
          </main>
        </div>
      ) : null}

      <AppDialog
        id="authDialog"
        open={!authBootstrapLoading && (authDialogOpen || !isAuthenticated)}
        title="Sign In"
        description="Please sign in with your Supabase account to open the app."
        showCloseButton={false}
        message={authMessage}
        onClose={handleAuthDialogClose}
        onSubmit={handleAuthSignIn}
        fields={[
          {
            id: 'authEmail',
            label: 'Email',
            type: 'email',
            autoComplete: 'email',
            required: true,
            placeholder: 'name@example.com',
            value: authEmail,
            onChange: event => setAuthEmail(event.target.value)
          },
          {
            id: 'authPassword',
            label: 'Password',
            type: 'password',
            autoComplete: 'current-password',
            required: true,
            placeholder: 'Your password',
            value: authPassword,
            onChange: event => setAuthPassword(event.target.value)
          }
        ]}
        actions={[
          {
            id: 'signIn',
            label: authLoading || authBootstrapLoading ? 'Signing In…' : 'Sign In',
            type: 'submit',
            variant: 'primary',
            disabled: authLoading || authBootstrapLoading
          },
          {
            id: 'signUp',
            label: authLoading || authBootstrapLoading ? 'Please wait…' : 'Sign Up',
            type: 'button',
            variant: 'secondary',
            disabled: authLoading || authBootstrapLoading,
            onClick: handleAuthSignUp
          }
        ]}
      />

      <ArchivedSubjectsDialog
        open={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
        onChanged={loadSubjects}
      />
    </div>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  viewport: {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    margin: 0,
    fontFamily: 'Inter, Segoe UI, Roboto, system-ui, sans-serif',
    fontSize: 'clamp(0.9375rem, 0.9vw + 0.75rem, 1.125rem)',
    color: '#edf2ff',
    background: 'radial-gradient(circle at 20% 10%, rgba(12, 18, 34, 0.95) 0%, #0a0f1e 45%)'
  },
  appShell: {
    height: '100%',
    minHeight: '100%',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: 'clamp(240px, 26vw, 310px) minmax(0, 1fr)',
    gap: 0,
    padding: 'var(--s20) 0',
    transition: `grid-template-columns ${PANEL_SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
  },
  appSidebar: {
    willChange: 'transform, opacity',
    transition: `transform ${PANEL_SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${PANEL_SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
  },
  sidebarRail: {
    display: 'flex',
    position: 'relative',
    zIndex: 2,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
    paddingLeft: 'var(--s20)',
    borderRadius: 'var(--radius)'
  },
  appSidebarVisible: {
    transform: 'translateX(0)',
    opacity: 1,
    pointerEvents: 'auto'
  },
  appSidebarHidden: {
    transform: 'translateX(-100%)',
    opacity: 0,
    pointerEvents: 'none'
  },
  appMain: {
    position: 'relative',
    zIndex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column'
  },
  routeContentWrap: {
    display: 'grid',
    gap: 'var(--s12)',
    minWidth: 0,
    minHeight: 0
  },
  panelTransitionViewport: {
    position: 'relative',
    display: 'grid',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden'
  },
  panelLayer: {
    gridArea: '1 / 1',
    width: '100%',
    minWidth: 0,
    minHeight: 0
  },
  panelLayerOverlay: {
    pointerEvents: 'none',
    zIndex: 2
  },
  panelLayerAnimated: {
    willChange: 'transform, opacity',
    transitionProperty: 'transform, opacity',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
  },
  statusLine: {
    border: '1px solid rgba(59, 84, 126, 0.8)',
    background: 'rgba(18, 28, 48, 0.86)',
    borderRadius: 'var(--s8)',
    padding: 'var(--s8) var(--s12)',
    color: '#b8c9e5',
    fontSize: '0.85rem'
  },
  subjectsStatus: {
    color: '#9db2d9',
    fontSize: '0.85rem',
    padding: 'var(--s8) var(--s4)'
  }
});

function classifyPanelPath(pathname: string): 'home' | 'subject' | 'other' {
  const path = String(pathname || '').trim();
  if (path === '/') return 'home';
  if (/^\/subject\/[^/]+$/.test(path)) return 'subject';
  return 'other';
}

function getEnteringTransform(direction: SlideDirection, active: boolean): string {
  if (direction === 'left') return active ? 'translateX(0%)' : 'translateX(100%)';
  return active ? 'translateX(0%)' : 'translateX(-100%)';
}

function getLeavingTransform(direction: SlideDirection, active: boolean): string {
  if (direction === 'left') return active ? 'translateX(-100%)' : 'translateX(0%)';
  return active ? 'translateX(100%)' : 'translateX(0%)';
}

function getEnteringOpacity(active: boolean): number {
  return active ? 1 : 0.24;
}

function getLeavingOpacity(active: boolean): number {
  return active ? 0.18 : 1;
}

function getSubjectIdFromPath(pathname: string): string {
  const match = String(pathname || '').trim().match(/^\/subject\/([^/]+)$/);
  return String(match?.[1] || '').trim();
}

function mergeSubjectSources(...sources: SubjectRecord[][]): SubjectRecord[] {
  const byId = new Map<string, SubjectRecord>();
  sources.flat().forEach(subject => {
    const subjectId = String(subject?.id || '').trim();
    if (!subjectId) return;
    const existing = byId.get(subjectId);
    if (!existing || getSubjectTimestamp(subject) >= getSubjectTimestamp(existing)) {
      byId.set(subjectId, subject);
    }
  });
  return Array.from(byId.values());
}

function getSubjectTimestamp(subject: SubjectRecord): number {
  const raw = subject?.meta?.updatedAt
    ?? subject?.updatedAt
    ?? subject?.meta?.createdAt
    ?? subject?.createdAt
    ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDomIdSuffix(value: string): string {
  const safe = String(value || '').trim();
  if (!safe) return 'unknown';
  return safe.replace(/[^a-zA-Z0-9_-]/g, '-');
}
