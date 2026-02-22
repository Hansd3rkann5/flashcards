// Bootstrap + Event Wiring
// ============================================================================
/**
 * @function setAuthGateVisibility
 * @description Shows or hides the initial Supabase authentication gate.
 */

function setAuthGateVisibility(visible = false) {
  const gate = el('authGate');
  if (!gate) return;
  gate.classList.toggle('hidden', !visible);
  gate.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/**
 * @function setAuthMessage
 * @description Updates authentication status text.
 */

function setAuthMessage(message = '', type = '') {
  const messageEl = el('authMessage');
  if (!messageEl) return;
  messageEl.textContent = String(message || '');
  messageEl.classList.remove('error', 'success');
  if (type === 'error' || type === 'success') {
    messageEl.classList.add(type);
  }
}

/**
 * @function readAuthCredentials
 * @description Reads and validates auth input values from the auth gate.
 */

function readAuthCredentials() {
  const email = String(el('authEmail')?.value || '').trim();
  const password = String(el('authPassword')?.value || '');
  if (!email || !password) {
    setAuthMessage('Please enter email and password.', 'error');
    return null;
  }
  return { email, password };
}

const ONBOARDING_TUTORIAL_STORAGE_PREFIX = 'flashcards.onboarding-tutorial.v1.';
const ONBOARDING_TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    title: 'Welcome to Engineering Flashcards',
    body: 'Create your first Subject to define what you want to learn. Start by adding your name below so your profile is complete.'
  }),
  Object.freeze({
    title: 'Build a Clean Learning Structure',
    body: 'Use Subject -> Topic -> Cards to stay organized. Subjects hold your big area, topics split it into focused units.'
  }),
  Object.freeze({
    title: 'Use the Editor Efficiently',
    body: 'Open a topic and create cards quickly in the editor. Use the Shortcuts button in the editor header to see all key actions.'
  }),
  Object.freeze({
    title: 'Start and Run Study Sessions',
    body: 'Select topics, choose your session size, and start. Flip with Space and grade using Correct / Not quite / Wrong (or keys 1/2/3).'
  }),
  Object.freeze({
    title: 'Check Status and Filter Details',
    body: 'In Settings, open Check Status to inspect all cards. Use the column filter toggles to sort and narrow your result list.'
  }),
  Object.freeze({
    title: 'Share via Content Exchange',
    body: 'Open Settings -> Content Exchange to browse other users, inspect their subject/topic/card tree, and import selected content into your account.'
  })
]);

const ONBOARDING_PROFILE_NAME_MAX_LEN = 80;
let authenticatedSupabaseUser = null;
let onboardingProfileName = '';
let onboardingNameRequired = false;
let onboardingNameOnlyMode = false;
let onboardingNameSaving = false;
let onboardingTutorialStepIndex = 0;
let onboardingTutorialOpen = false;
let onboardingTutorialWired = false;

/**
 * @function normalizeOnboardingProfileName
 * @description Normalizes user profile names for onboarding and Supabase metadata writes.
 */

function normalizeOnboardingProfileName(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ONBOARDING_PROFILE_NAME_MAX_LEN);
}

/**
 * @function extractOnboardingProfileNameFromUser
 * @description Extracts a display name from Supabase auth user metadata.
 */

function extractOnboardingProfileNameFromUser(user = null) {
  const meta = (user?.user_metadata && typeof user.user_metadata === 'object')
    ? user.user_metadata
    : {};
  const candidates = [meta.full_name, meta.name, meta.display_name, meta.displayName];
  for (const raw of candidates) {
    const normalized = normalizeOnboardingProfileName(raw);
    if (normalized) return normalized;
  }
  return '';
}

/**
 * @function refreshAuthenticatedProfileName
 * @description Refreshes profile-name state from Supabase auth user data.
 */

async function refreshAuthenticatedProfileName() {
  if (isLocalSnapshotModeEnabled()) {
    onboardingProfileName = '';
    onboardingNameRequired = false;
    return;
  }
  let user = authenticatedSupabaseUser;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    if (data?.user) {
      user = data.user;
      authenticatedSupabaseUser = data.user;
    }
  } catch (err) {
    // Keep fallback from current session user when network is unavailable.
  }
  const hasUser = !!user;
  onboardingProfileName = extractOnboardingProfileNameFromUser(user);
  onboardingNameRequired = hasUser ? !onboardingProfileName : false;
}

/**
 * @function syncAuthenticatedProfileNameRecord
 * @description Mirrors the authenticated display name into a per-user settings/profile row for exchange listing.
 */

async function syncAuthenticatedProfileNameRecord() {
  const safeOwnerId = String(supabaseOwnerId || '').trim();
  const safeName = normalizeOnboardingProfileName(onboardingProfileName);
  if (!safeOwnerId || !safeName) return;
  try {
    const existing = await getById('settings', 'profile', {
      uiBlocking: false,
      loadingLabel: ''
    });
    const existingName = normalizeOnboardingProfileName(
      existing?.displayName || existing?.fullName || existing?.name || ''
    );
    if (existingName === safeName) return;
    const nowIso = new Date().toISOString();
    await put('settings', {
      ...(existing && typeof existing === 'object' ? existing : {}),
      id: 'profile',
      uid: safeOwnerId,
      displayName: safeName,
      name: safeName,
      fullName: safeName,
      updatedAt: nowIso,
      meta: {
        ...((existing?.meta && typeof existing.meta === 'object') ? existing.meta : {}),
        updatedAt: nowIso
      }
    }, {
      uiBlocking: false,
      loadingLabel: '',
      invalidate: 'settings'
    });
  } catch (err) {
    console.warn('Profile name sync failed:', err);
  }
}

/**
 * @function setOnboardingNameMessage
 * @description Sets onboarding name validation/sync feedback.
 */

function setOnboardingNameMessage(message = '', type = '') {
  const messageEl = el('onboardingNameMessage');
  if (!messageEl) return;
  messageEl.textContent = String(message || '');
  messageEl.classList.remove('error', 'success');
  if (type === 'error' || type === 'success') messageEl.classList.add(type);
}

/**
 * @function getOnboardingVisibleStepCount
 * @description Returns the active number of onboarding steps (full tutorial or profile-completion only).
 */

function getOnboardingVisibleStepCount() {
  return onboardingNameOnlyMode ? 1 : ONBOARDING_TUTORIAL_STEPS.length;
}

/**
 * @function getOnboardingTutorialStorageKey
 * @description Returns the per-user localStorage key that tracks tutorial completion.
 */

function getOnboardingTutorialStorageKey(ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return '';
  return `${ONBOARDING_TUTORIAL_STORAGE_PREFIX}${safeOwnerId}`;
}

/**
 * @function hasCompletedOnboardingTutorial
 * @description Returns true when the current user already completed the onboarding tutorial.
 */

function hasCompletedOnboardingTutorial(ownerId = '') {
  const key = getOnboardingTutorialStorageKey(ownerId);
  if (!key || typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch (_) {
    return false;
  }
}

/**
 * @function markOnboardingTutorialCompleted
 * @description Persists tutorial completion for the current user.
 */

function markOnboardingTutorialCompleted(ownerId = '') {
  const key = getOnboardingTutorialStorageKey(ownerId);
  if (!key || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, '1');
  } catch (_) {
    // Ignore storage write failures (private mode/quota/etc.).
  }
}

/**
 * @function shouldShowOnboardingTutorial
 * @description Returns true when onboarding should be shown for the authenticated user.
 */

function shouldShowOnboardingTutorial(ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return false;
  return !hasCompletedOnboardingTutorial(safeOwnerId);
}

/**
 * @function setOnboardingTutorialVisibility
 * @description Shows or hides the onboarding tutorial overlay.
 */

function setOnboardingTutorialVisibility(visible = false) {
  const overlay = el('onboardingTutorial');
  if (!overlay) return;
  const show = !!visible;
  overlay.classList.toggle('hidden', !show);
  overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('tutorial-open', show);
}

/**
 * @function renderOnboardingTutorialStep
 * @description Renders the current tutorial step text and progress indicators.
 */

function renderOnboardingTutorialStep() {
  const totalSteps = getOnboardingVisibleStepCount();
  const safeIndex = Math.max(0, Math.min(totalSteps - 1, onboardingTutorialStepIndex));
  const step = ONBOARDING_TUTORIAL_STEPS[safeIndex];
  if (!step) return;
  const titleEl = el('onboardingTutorialTitle');
  const bodyEl = el('onboardingTutorialBody');
  const stepMetaEl = el('onboardingTutorialStepMeta');
  const prevBtn = el('onboardingTutorialPrevBtn');
  const nextBtn = el('onboardingTutorialNextBtn');
  const dotsWrap = el('onboardingTutorialDots');
  const nameBlock = el('onboardingNameBlock');
  const nameInput = el('onboardingNameInput');
  const main = el('onboardingTutorialMain');
  const isFirstStep = safeIndex === 0;
  const isLastStep = safeIndex >= totalSteps - 1;
  if (titleEl) titleEl.textContent = step.title;
  if (bodyEl) bodyEl.textContent = step.body;
  if (stepMetaEl) stepMetaEl.textContent = `Step ${safeIndex + 1} of ${totalSteps}`;
  if (prevBtn) prevBtn.disabled = onboardingNameSaving || safeIndex <= 0;
  if (nextBtn) {
    nextBtn.disabled = onboardingNameSaving;
    nextBtn.setAttribute('aria-label', isLastStep ? 'Finish tutorial' : 'Next step');
    nextBtn.title = isLastStep ? 'Finish' : 'Next';
  }
  if (nameBlock) nameBlock.classList.toggle('hidden', !isFirstStep);
  if (nameInput instanceof HTMLInputElement) {
    if (isFirstStep && onboardingProfileName && !nameInput.value.trim()) {
      nameInput.value = onboardingProfileName;
    }
    nameInput.disabled = onboardingNameSaving;
    nameInput.required = onboardingNameRequired;
  }
  if (dotsWrap) {
    dotsWrap.innerHTML = '';
    for (let idx = 0; idx < totalSteps; idx += 1) {
      const dot = document.createElement('span');
      dot.className = idx === safeIndex ? 'onboarding-dot active' : 'onboarding-dot';
      dot.setAttribute('aria-hidden', 'true');
      dotsWrap.appendChild(dot);
    }
  }
  if (main) main.scrollTop = 0;
}

/**
 * @function setOnboardingTutorialStep
 * @description Changes the active tutorial step to a clamped index.
 */

function setOnboardingTutorialStep(nextIndex = 0) {
  const max = Math.max(0, getOnboardingVisibleStepCount() - 1);
  const clamped = Math.max(0, Math.min(max, Math.trunc(Number(nextIndex) || 0)));
  onboardingTutorialStepIndex = clamped;
  renderOnboardingTutorialStep();
}

/**
 * @function closeOnboardingTutorial
 * @description Closes the onboarding overlay and optionally persists completion.
 */

function closeOnboardingTutorial(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  onboardingTutorialOpen = false;
  setOnboardingTutorialVisibility(false);
  setOnboardingNameMessage('');
  onboardingNameSaving = false;
  if (opts.completed) {
    markOnboardingTutorialCompleted(supabaseOwnerId);
  }
}

/**
 * @function persistOnboardingNameFromInput
 * @description Persists the entered name into Supabase auth user metadata.
 */

async function persistOnboardingNameFromInput() {
  const nameInput = el('onboardingNameInput');
  if (!(nameInput instanceof HTMLInputElement)) return true;
  const normalized = normalizeOnboardingProfileName(nameInput.value);
  if (!normalized) {
    setOnboardingNameMessage('Please enter your name.', 'error');
    nameInput.focus({ preventScroll: true });
    return false;
  }
  if (onboardingNameSaving) return false;
  onboardingNameSaving = true;
  setOnboardingNameMessage('Saving name...');
  renderOnboardingTutorialStep();
  try {
    await initSupabaseBackend();
    const { data, error } = await supabaseClient.auth.updateUser({
      data: {
        full_name: normalized,
        name: normalized
      }
    });
    if (error) throw error;
    if (data?.user) authenticatedSupabaseUser = data.user;
    onboardingProfileName = normalized;
    onboardingNameRequired = false;
    nameInput.value = normalized;
    setOnboardingNameMessage('Name saved.', 'success');
    void syncAuthenticatedProfileNameRecord();
    return true;
  } catch (err) {
    setOnboardingNameMessage(err?.message || 'Could not save your name. Please try again.', 'error');
    return false;
  } finally {
    onboardingNameSaving = false;
    renderOnboardingTutorialStep();
  }
}

/**
 * @function advanceOnboardingTutorial
 * @description Moves tutorial backward/forward and finishes on the final step.
 */

async function advanceOnboardingTutorial(direction = 1) {
  if (!onboardingTutorialOpen) return;
  if (onboardingNameSaving) return;
  const delta = Math.trunc(Number(direction) || 0);
  if (delta === 0) return;
  if (delta > 0 && onboardingTutorialStepIndex === 0 && onboardingNameRequired) {
    const saved = await persistOnboardingNameFromInput();
    if (!saved) return;
    if (onboardingNameOnlyMode) {
      closeOnboardingTutorial({ completed: false });
      return;
    }
  }
  const total = getOnboardingVisibleStepCount();
  const nextIndex = onboardingTutorialStepIndex + delta;
  if (delta > 0 && nextIndex >= total) {
    closeOnboardingTutorial({ completed: true });
    return;
  }
  setOnboardingTutorialStep(nextIndex);
}

/**
 * @function handleOnboardingTutorialKeydown
 * @description Handles arrow-key navigation while onboarding is visible.
 */

function handleOnboardingTutorialKeydown(event) {
  if (!onboardingTutorialOpen) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    void advanceOnboardingTutorial(1);
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    event.stopPropagation();
    void advanceOnboardingTutorial(-1);
  }
}

/**
 * @function wireOnboardingTutorial
 * @description Wires onboarding buttons and keyboard listeners once.
 */

function wireOnboardingTutorial() {
  if (onboardingTutorialWired) return;
  onboardingTutorialWired = true;
  const prevBtn = el('onboardingTutorialPrevBtn');
  const nextBtn = el('onboardingTutorialNextBtn');
  const nameInput = el('onboardingNameInput');
  if (prevBtn) prevBtn.onclick = () => { void advanceOnboardingTutorial(-1); };
  if (nextBtn) nextBtn.onclick = () => { void advanceOnboardingTutorial(1); };
  if (nameInput instanceof HTMLInputElement) {
    nameInput.addEventListener('input', () => setOnboardingNameMessage(''));
    nameInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      void advanceOnboardingTutorial(1);
    });
  }
  document.addEventListener('keydown', handleOnboardingTutorialKeydown, true);
}

/**
 * @function openOnboardingTutorial
 * @description Opens onboarding from the first step.
 */

function openOnboardingTutorial() {
  const overlay = el('onboardingTutorial');
  if (!overlay) return;
  onboardingTutorialOpen = true;
  setOnboardingTutorialStep(0);
  const nameInput = el('onboardingNameInput');
  if (nameInput instanceof HTMLInputElement) {
    nameInput.value = onboardingProfileName || '';
  }
  setOnboardingNameMessage('');
  setOnboardingTutorialVisibility(true);
  const main = el('onboardingTutorialMain');
  if (main) main.scrollTop = 0;
  if (onboardingNameRequired && nameInput instanceof HTMLInputElement) {
    nameInput.focus({ preventScroll: true });
    nameInput.select();
    return;
  }
  const nextBtn = el('onboardingTutorialNextBtn');
  nextBtn?.focus?.({ preventScroll: true });
}

const EDITOR_INTRO_STORAGE_PREFIX = 'flashcards.editor-intro.v1.';
const EDITOR_INTRO_SHORTCUTS = Object.freeze([
  Object.freeze({
    keys: ['Shift', 'Enter'],
    description: 'Create a flashcard in the create editor or save changes in the edit dialog.'
  }),
  Object.freeze({
    keys: ['Ctrl', '+'],
    description: 'Add one additional MCQ answer option in create and edit fields.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'B'],
    description: 'Toggle bold markdown markers around the current selection.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'I'],
    description: 'Toggle italic markdown markers around the current selection.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'U'],
    description: 'Toggle underline markdown markers around the current selection.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'L'],
    description: 'Apply left alignment to the active editor field.'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'C'],
    description: 'Apply center alignment when no text is selected (copy still works with selected text).'
  }),
  Object.freeze({
    keys: ['Cmd/Ctrl', 'J'],
    description: 'Apply justify alignment to the active editor field.'
  }),
  Object.freeze({
    keys: ['Escape'],
    description: 'Close an open inline color picker menu.'
  }),
  Object.freeze({
    keys: ['Tab'],
    description: 'In the Question field: jump directly to the Answer field.'
  }),
  Object.freeze({
    keys: ['Tab', 'Shift', 'Tab'],
    description: 'In list lines: indent (Tab) or outdent (Shift+Tab).'
  }),
  Object.freeze({
    keys: ['Enter'],
    description: 'In list lines: continue numbering/bullets, or exit the list on empty item.'
  }),
  Object.freeze({
    keys: ['Enter'],
    description: 'In primary MCQ answer mode: Enter is blocked to keep the answer single-line.'
  }),
  Object.freeze({
    keys: ['Shift', 'Enter'],
    description: 'In the table dialog: insert or update the generated markdown table.'
  }),
  Object.freeze({
    keys: ['(', '[', '{', '$'],
    description: 'Wrap current selection with matching pairs in editor text fields.'
  })
]);

let editorIntroOpen = false;
let editorIntroWired = false;

/**
 * @function getEditorIntroStorageKey
 * @description Returns the per-user localStorage key for editor intro completion.
 */

function getEditorIntroStorageKey(ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return '';
  return `${EDITOR_INTRO_STORAGE_PREFIX}${safeOwnerId}`;
}

/**
 * @function hasCompletedEditorIntro
 * @description Returns true when the editor intro was already dismissed for this user.
 */

function hasCompletedEditorIntro(ownerId = '') {
  const key = getEditorIntroStorageKey(ownerId);
  if (!key || typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch (_) {
    return false;
  }
}

/**
 * @function markEditorIntroCompleted
 * @description Marks the editor intro as completed for the current user.
 */

function markEditorIntroCompleted(ownerId = '') {
  const key = getEditorIntroStorageKey(ownerId);
  if (!key || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, '1');
  } catch (_) {
    // Ignore storage write failures (private mode/quota/etc.).
  }
}

/**
 * @function shouldShowEditorIntro
 * @description Returns true when the editor intro should be shown for the active user.
 */

function shouldShowEditorIntro(ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return false;
  return !hasCompletedEditorIntro(safeOwnerId);
}

/**
 * @function setEditorIntroVisibility
 * @description Shows or hides the editor intro overlay.
 */

function setEditorIntroVisibility(visible = false) {
  const overlay = el('editorIntro');
  if (!overlay) return;
  const show = !!visible;
  overlay.classList.toggle('hidden', !show);
  overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('editor-intro-open', show);
}

/**
 * @function renderEditorIntroShortcutList
 * @description Renders all available editor keyboard shortcuts into the intro panel.
 */

function renderEditorIntroShortcutList() {
  const list = el('editorIntroShortcutList');
  if (!list) return;
  list.innerHTML = '';
  EDITOR_INTRO_SHORTCUTS.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'editor-intro-shortcut';
    const keysWrap = document.createElement('div');
    keysWrap.className = 'editor-intro-shortcut-keys';
    const keys = Array.isArray(entry.keys) ? entry.keys : [];
    keys.forEach(keyLabel => {
      const keyNode = document.createElement('kbd');
      keyNode.textContent = String(keyLabel || '');
      keysWrap.appendChild(keyNode);
    });
    const desc = document.createElement('div');
    desc.className = 'editor-intro-shortcut-desc';
    desc.textContent = String(entry.description || '');
    row.append(keysWrap, desc);
    list.appendChild(row);
  });
}

/**
 * @function closeEditorIntro
 * @description Closes the editor intro and stores completion.
 */

function closeEditorIntro() {
  if (!editorIntroOpen) return;
  editorIntroOpen = false;
  setEditorIntroVisibility(false);
  markEditorIntroCompleted(supabaseOwnerId);
}

/**
 * @function openEditorIntro
 * @description Opens the editor intro panel.
 */

function openEditorIntro() {
  const overlay = el('editorIntro');
  if (!overlay) return;
  renderEditorIntroShortcutList();
  const card = overlay.querySelector('.editor-intro-card');
  const main = el('editorIntroMain');
  const shortcutList = el('editorIntroShortcutList');
  if (card) card.scrollTop = 0;
  if (main) main.scrollTop = 0;
  if (shortcutList) shortcutList.scrollTop = 0;
  overlay.scrollTop = 0;
  editorIntroOpen = true;
  setEditorIntroVisibility(true);
  requestAnimationFrame(() => {
    if (card) card.scrollTop = 0;
    if (main) main.scrollTop = 0;
    overlay.scrollTop = 0;
  });
  const closeBtn = el('editorIntroCloseBtn');
  closeBtn?.focus?.({ preventScroll: true });
}

/**
 * @function maybeOpenEditorIntro
 * @description Opens the editor intro only if the user has not seen it before.
 */

function maybeOpenEditorIntro() {
  if (!shouldShowEditorIntro(supabaseOwnerId)) return;
  openEditorIntro();
}

/**
 * @function handleEditorIntroKeydown
 * @description Handles key actions while the editor intro is open.
 */

function handleEditorIntroKeydown(event) {
  if (!editorIntroOpen) return;
  if (event.key === 'Escape' || event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    closeEditorIntro();
  }
}

/**
 * @function wireEditorIntro
 * @description Wires editor intro controls once.
 */

function wireEditorIntro() {
  if (editorIntroWired) return;
  editorIntroWired = true;
  const overlay = el('editorIntro');
  const closeBtn = el('editorIntroCloseBtn');
  if (closeBtn) closeBtn.onclick = () => closeEditorIntro();
  if (overlay) {
    overlay.addEventListener('click', event => {
      if (event.target !== overlay) return;
      closeEditorIntro();
    });
  }
  document.addEventListener('keydown', handleEditorIntroKeydown, true);
}

/**
 * @function ensureAuthenticatedSession
 * @description Requires a valid Supabase session before the app can initialize.
 */

async function ensureAuthenticatedSession() {
  if (isLocalSnapshotModeEnabled()) {
    authenticatedSupabaseUser = null;
    supabaseOwnerId = 'offline-snapshot-user';
    setAuthMessage('');
    setAuthGateVisibility(false);
    return true;
  }
  await initSupabaseBackend();
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (data?.session) {
    authenticatedSupabaseUser = data.session?.user || null;
    supabaseOwnerId = String(authenticatedSupabaseUser?.id || '').trim();
    setAuthGateVisibility(false);
    return true;
  }

  setAuthMessage('');
  setAuthGateVisibility(true);
  const emailInput = el('authEmail');
  const passwordInput = el('authPassword');
  const authForm = el('authForm');
  const signUpBtn = el('authSignUpBtn');
  if (emailInput) emailInput.focus({ preventScroll: true });

  return await new Promise(resolve => {
    let busy = false;
    const setBusy = nextBusy => {
      busy = !!nextBusy;
      if (emailInput) emailInput.disabled = busy;
      if (passwordInput) passwordInput.disabled = busy;
      const signInBtn = el('authSignInBtn');
      if (signInBtn) signInBtn.disabled = busy;
      if (signUpBtn) signUpBtn.disabled = busy;
    };
    const complete = () => {
      setBusy(false);
      setAuthMessage('');
      setAuthGateVisibility(false);
      cleanup();
      resolve(true);
    };
    const handleSignIn = async event => {
      event?.preventDefault?.();
      if (busy) return;
      const credentials = readAuthCredentials();
      if (!credentials) return;
      setBusy(true);
      setAuthMessage('Signing in...');
      try {
        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword(credentials);
        if (signInError) throw signInError;
        authenticatedSupabaseUser = signInData?.user || null;
        supabaseOwnerId = String(authenticatedSupabaseUser?.id || '').trim();
        complete();
      } catch (err) {
        setBusy(false);
        setAuthMessage(err?.message || 'Sign in failed.', 'error');
      }
    };
    const handleSignUp = async event => {
      event?.preventDefault?.();
      if (busy) return;
      const credentials = readAuthCredentials();
      if (!credentials) return;
      setBusy(true);
      setAuthMessage('Creating account...');
      try {
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp(credentials);
        if (signUpError) throw signUpError;
        if (signUpData?.session) {
          authenticatedSupabaseUser = signUpData?.user || signUpData?.session?.user || null;
          supabaseOwnerId = String(authenticatedSupabaseUser?.id || '').trim();
          complete();
          return;
        }
        setBusy(false);
        setAuthMessage('Account created. Confirm your email, then sign in.', 'success');
      } catch (err) {
        setBusy(false);
        setAuthMessage(err?.message || 'Sign up failed.', 'error');
      }
    };
    const cleanup = () => {
      authForm?.removeEventListener('submit', handleSignIn);
      signUpBtn?.removeEventListener('click', handleSignUp);
    };

    authForm?.addEventListener('submit', handleSignIn);
    signUpBtn?.addEventListener('click', handleSignUp);
  });
}

/**
* @function boot
 * @description Initializes app state, wires UI events, and loads initial data for the first screen.
 */

async function boot() {
  void registerOfflineServiceWorker();
  try {
    await ensureAuthenticatedSession();
  } catch (err) {
    alert(err?.message || 'Authentication failed.');
    return;
  }
  let showOnboardingTutorial = shouldShowOnboardingTutorial(supabaseOwnerId);
  await refreshAuthenticatedProfileName();
  void syncAuthenticatedProfileNameRecord();
  onboardingNameOnlyMode = onboardingNameRequired && !showOnboardingTutorial;
  showOnboardingTutorial = showOnboardingTutorial || onboardingNameRequired;
  wireOnboardingTutorial();
  wireEditorIntro();

  let backendReachable = false;
  try {
    backendReachable = await openDB();
    await openCardBankDB();
    await preloadTopicDirectory({ force: true });
  } catch (err) {
    alert(err.message || 'Unable to connect to Supabase backend.');
    return;
  }
  if (!backendReachable) {
    console.info('Backend not reachable. Running with offline cache and queued local changes.');
  }
  wireNoZoomGuards();
  wireSwipe();
  wireSessionScaleDebugControls();
  wireHapticFeedback();
  wireHomePullToRefresh();
  wireSidebarSwipeGesture();
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!appLoadingDebugPinned) return;
    e.preventDefault();
    e.stopPropagation();
    closeDebugLoadingOverlay();
  });
  window.addEventListener('online', () => { void openDB(); });

  el('homeBtn').onclick = () => {
    setView(0);
    document.body.classList.remove('sidebar-open');
    void refreshDailyReviewHomePanel({ useExisting: false });
  };
  el('settingsBtn').onclick = () => {
    const settingsDialog = el('settingsDialog');
    if (!settingsDialog) return;
    // Modal interactions should not keep the background sidebar state alive.
    document.body.classList.remove('sidebar-open');
    showDialog(settingsDialog);
  };
  const closeSettingsBtn = el('closeSettingsBtn');
  if (closeSettingsBtn) closeSettingsBtn.onclick = () => closeDialog(el('settingsDialog'));
  const signOutBtn = el('signOutBtn');
  if (signOutBtn) {
    if (isLocalSnapshotModeEnabled()) {
      signOutBtn.classList.add('hidden');
    }
    signOutBtn.onclick = async () => {
      if (!confirm('Sign out from this device?')) return;
      signOutBtn.disabled = true;
      try {
        await initSupabaseBackend();
        const { error: signOutError } = await supabaseClient.auth.signOut();
        if (signOutError) throw signOutError;
        supabaseOwnerId = '';
        authenticatedSupabaseUser = null;
        onboardingProfileName = '';
        onboardingNameRequired = false;
        onboardingNameOnlyMode = false;
        onboardingNameSaving = false;
        supabaseTenantColumn = '';
        window.location.reload();
      } catch (err) {
        signOutBtn.disabled = false;
        alert(err?.message || 'Sign out failed.');
      }
    };
  }
  const quickAddSubjectBtn = el('quickAddSubject');
  if (quickAddSubjectBtn) quickAddSubjectBtn.onclick = openSubjectDialog;
  el('addSubjectBtn').onclick = openSubjectDialog;
  const quickExportBtn = el('quickExport');
  if (quickExportBtn) quickExportBtn.onclick = exportJSON;
  const exportJsonBtn = el('exportJsonBtn');
  if (exportJsonBtn) exportJsonBtn.onclick = exportJSON;
  const exportCsvBtn = el('exportCsvBtn');
  if (exportCsvBtn) exportCsvBtn.onclick = exportCSV;
  const importJsonBtn = el('importJsonBtn');
  if (importJsonBtn) {
    importJsonBtn.onclick = () => {
      const input = el('importInput');
      if (!input) return;
      // Allow re-importing the same file by clearing previous selection first.
      input.value = '';
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
      input.click();
    };
  }
  const openContentExchangeBtn = el('openContentExchangeBtn');
  if (openContentExchangeBtn) {
    if (isLocalSnapshotModeEnabled()) {
      openContentExchangeBtn.classList.add('hidden');
    } else {
      openContentExchangeBtn.onclick = () => { void openContentExchangeDialog(); };
    }
  }
  const migrateImagesToStorageBtn = el('migrateImagesToStorageBtn');
  if (migrateImagesToStorageBtn) migrateImagesToStorageBtn.onclick = migrateImagesToStorage;
  const importInput = el('importInput');
  if (importInput) {
    importInput.addEventListener('change', e => {
      const file = e.target?.files?.[0];
      if (file) importJSON(file);
      importInput.value = '';
    });
  }
  const openProgressCheckBtn = el('openProgressCheckBtn');
  if (openProgressCheckBtn) openProgressCheckBtn.onclick = openProgressCheckDialog;
  const openIntroFromSettingsBtn = el('openIntroFromSettingsBtn');
  if (openIntroFromSettingsBtn) {
    openIntroFromSettingsBtn.onclick = () => {
      const settingsDialog = el('settingsDialog');
      if (settingsDialog?.open) closeDialog(settingsDialog);
      openOnboardingTutorial();
    };
  }
  const openProgressCheckFromSettingsBtn = el('openProgressCheckFromSettingsBtn');
  if (openProgressCheckFromSettingsBtn) {
    openProgressCheckFromSettingsBtn.onclick = async () => {
      const settingsDialog = el('settingsDialog');
      if (settingsDialog?.open) closeDialog(settingsDialog);
      await openProgressCheckDialog();
    };
  }
  const startBtn = el('startSessionBtn');
  if (startBtn) startBtn.onclick = startSession;
  const openSessionFilterBtn = el('openSessionFilterBtn');
  if (openSessionFilterBtn) {
    openSessionFilterBtn.onclick = () => {
      fillSessionFilterDialogFromState();
      showDialog(el('sessionFilterDialog'));
    };
  }

  const sessionFilterDialog = el('sessionFilterDialog');
  if (sessionFilterDialog) {
    sessionFilterDialog.addEventListener('click', e => {
      if (e.target === sessionFilterDialog) closeDialog(sessionFilterDialog);
    });
  }
  const sessionFilterAll = el('sessionFilterAll');
  const sessionFilterCorrect = el('sessionFilterCorrect');
  const sessionFilterWrong = el('sessionFilterWrong');
  const sessionFilterPartial = el('sessionFilterPartial');
  const sessionFilterNotAnswered = el('sessionFilterNotAnswered');
  const sessionFilterNotAnsweredYet = el('sessionFilterNotAnsweredYet');
  if (sessionFilterAll) {
    sessionFilterAll.addEventListener('change', () => {
      if (sessionFilterAll.checked) {
        if (sessionFilterCorrect) sessionFilterCorrect.checked = false;
        if (sessionFilterWrong) sessionFilterWrong.checked = false;
        if (sessionFilterPartial) sessionFilterPartial.checked = false;
        if (sessionFilterNotAnswered) sessionFilterNotAnswered.checked = false;
        if (sessionFilterNotAnsweredYet) sessionFilterNotAnsweredYet.checked = false;
      }
      syncSessionFilterDialogControls();
    });
  }
  [sessionFilterCorrect, sessionFilterWrong, sessionFilterPartial, sessionFilterNotAnswered, sessionFilterNotAnsweredYet].forEach(input => {
    if (!input) return;
    input.addEventListener('change', () => {
      if (input.checked && sessionFilterAll) sessionFilterAll.checked = false;
      syncSessionFilterDialogControls();
    });
  });
  const closeSessionFilterBtn = el('closeSessionFilterBtn');
  if (closeSessionFilterBtn) {
    closeSessionFilterBtn.onclick = () => closeDialog(el('sessionFilterDialog'));
  }
  const saveSessionFilterBtn = el('saveSessionFilterBtn');
  if (saveSessionFilterBtn) {
    saveSessionFilterBtn.onclick = async () => {
      const next = pullSessionFiltersFromDialog();
      await setSessionFilterState(next, { refresh: true });
      closeDialog(el('sessionFilterDialog'));
    };
  }

  const sessionCompleteDialog = el('sessionCompleteDialog');
  if (sessionCompleteDialog) {
    sessionCompleteDialog.addEventListener('click', e => {
      if (e.target === sessionCompleteDialog) dismissSessionCompleteDialog();
    });
    sessionCompleteDialog.addEventListener('close', () => {
      if (sessionCompleteConfettiEmitter && typeof sessionCompleteConfettiEmitter.reset === 'function') {
        sessionCompleteConfettiEmitter.reset();
      }
      document.body.classList.remove('session-complete-confetti-active');
    });
    sessionCompleteDialog.addEventListener('cancel', e => {
      e.preventDefault();
      dismissSessionCompleteDialog();
    });
  }
  const closeSessionCompleteBtn = el('closeSessionCompleteBtn');
  if (closeSessionCompleteBtn) {
    closeSessionCompleteBtn.onclick = () => dismissSessionCompleteDialog();
  }
  const sessionRepeatMinus = el('sessionRepeatMinus');
  if (sessionRepeatMinus) {
    sessionRepeatMinus.onclick = () => {
      if (sessionRepeatState.remaining <= 0) return;
      sessionRepeatState.size = Math.max(1, sessionRepeatState.size - 1);
      updateSessionRepeatCounter();
    };
  }
  const sessionRepeatPlus = el('sessionRepeatPlus');
  if (sessionRepeatPlus) {
    sessionRepeatPlus.onclick = () => {
      if (sessionRepeatState.remaining <= 0) return;
      sessionRepeatState.size = Math.min(sessionRepeatState.remaining, sessionRepeatState.size + 1);
      updateSessionRepeatCounter();
    };
  }
  const startAnotherSessionBtn = el('startAnotherSessionBtn');
  if (startAnotherSessionBtn) {
    startAnotherSessionBtn.onclick = async () => {
      if (sessionRepeatState.remaining <= 0) {
        dismissSessionCompleteDialog();
        return;
      }
      const forcedSize = Math.min(Math.max(sessionRepeatState.size, 1), sessionRepeatState.remaining);
      closeDialog(el('sessionCompleteDialog'));
      await startSession({
        topicIds: [...sessionRepeatState.topicIds],
        cardIds: [...sessionRepeatState.cardIds],
        filters: { ...sessionRepeatState.filters },
        forcedSize,
        reviewMode: sessionRepeatState.mode === 'daily-review'
      });
    };
  }

  const startDailyReviewBtn = el('startDailyReviewBtn');
  if (startDailyReviewBtn) startDailyReviewBtn.onclick = startDailyReviewFromHomePanel;
  const toggleDailyReviewAnalyticsBtn = el('toggleDailyReviewAnalyticsBtn');
  if (toggleDailyReviewAnalyticsBtn) {
    toggleDailyReviewAnalyticsBtn.onclick = toggleDailyReviewAnalytics;
    updateDailyReviewAnalyticsVisibility();
  }
  const debugLoaderBtn = el('debugLoaderBtn');
  if (debugLoaderBtn) debugLoaderBtn.onclick = openDebugLoadingOverlay;
  const dailyReviewFilterIds = ['dailyReviewFilterGreen', 'dailyReviewFilterYellow', 'dailyReviewFilterRed'];
  dailyReviewFilterIds.forEach(filterId => {
    const input = el(filterId);
    if (!input) return;
    input.addEventListener('change', () => {
      dailyReviewState.statusFilter = pullDailyReviewStatusFilterFromControls();
      syncDailyReviewDateKeysFromStatus();
      renderDailyReviewDateSlider();
      renderDailyReviewFilterSummary();
      renderDailyReviewTopicList();
    });
  });
  const dailyReviewDateStart = el('dailyReviewDateStart');
  const dailyReviewDateEnd = el('dailyReviewDateEnd');
  const commitDailyReviewDateFromActiveHandle = () => {
    const sliderWrap = el('dailyReviewDateSliderWrap');
    if (!sliderWrap) return;
    const isStartActive = sliderWrap.classList.contains('active-start');
    const isEndActive = sliderWrap.classList.contains('active-end');
    if (!isStartActive && !isEndActive) return;
    applyDailyReviewDateRangeFromControls(isEndActive ? 'end' : 'start');
    setDailyReviewActiveRangeHandle('');
  };
  if (dailyReviewDateStart) {
    const commitStart = () => applyDailyReviewDateRangeFromControls('start');
    const activateStart = () => setDailyReviewActiveRangeHandle('start');
    dailyReviewDateStart.addEventListener('pointerdown', activateStart);
    dailyReviewDateStart.addEventListener('mousedown', activateStart);
    dailyReviewDateStart.addEventListener('touchstart', activateStart, { passive: true });
    dailyReviewDateStart.addEventListener('focus', activateStart);
    dailyReviewDateStart.addEventListener('input', () => applyDailyReviewDateRangeFromControls('start', { preview: true }));
    dailyReviewDateStart.addEventListener('change', commitStart);
    dailyReviewDateStart.addEventListener('mouseup', commitStart);
    dailyReviewDateStart.addEventListener('touchend', commitStart);
    dailyReviewDateStart.addEventListener('blur', commitStart);
  }
  if (dailyReviewDateEnd) {
    const commitEnd = () => applyDailyReviewDateRangeFromControls('end');
    const activateEnd = () => setDailyReviewActiveRangeHandle('end');
    dailyReviewDateEnd.addEventListener('pointerdown', activateEnd);
    dailyReviewDateEnd.addEventListener('mousedown', activateEnd);
    dailyReviewDateEnd.addEventListener('touchstart', activateEnd, { passive: true });
    dailyReviewDateEnd.addEventListener('focus', activateEnd);
    dailyReviewDateEnd.addEventListener('input', () => applyDailyReviewDateRangeFromControls('end', { preview: true }));
    dailyReviewDateEnd.addEventListener('change', commitEnd);
    dailyReviewDateEnd.addEventListener('mouseup', commitEnd);
    dailyReviewDateEnd.addEventListener('touchend', commitEnd);
    dailyReviewDateEnd.addEventListener('blur', commitEnd);
  }
  document.addEventListener('pointerup', commitDailyReviewDateFromActiveHandle);
  document.addEventListener('pointercancel', commitDailyReviewDateFromActiveHandle);
  const dailyReviewMinus = el('dailyReviewMinus');
  if (dailyReviewMinus) {
    dailyReviewMinus.onclick = () => {
      const selectedCount = getDailyReviewSelectedCardIds().length;
      if (selectedCount <= 0) return;
      dailyReviewState.size = Math.max(1, dailyReviewState.size - 1);
      updateDailyReviewSizeCounter();
    };
  }
  const dailyReviewPlus = el('dailyReviewPlus');
  if (dailyReviewPlus) {
    dailyReviewPlus.onclick = () => {
      const selectedCount = getDailyReviewSelectedCardIds().length;
      if (selectedCount <= 0) return;
      dailyReviewState.size = Math.min(selectedCount, dailyReviewState.size + 1);
      updateDailyReviewSizeCounter();
    };
  }
  renderSessionFilterSummary();

  el('backToTopicsBtn').onclick = () => {
    setDeckSelectionMode(false);
    setView(1);
    // Render immediately from local subject cache; refreshes run in background.
    void loadTopics({ preferCached: true, uiBlocking: false });
    if (selectedSubject) void refreshTopicSessionMeta(currentSubjectTopics);
  };
  el('backToTopicsBtnSession').onclick = () => {
    closeStudyImageLightbox();
    setDeckSelectionMode(false);
    session.active = false;
    el('cardsOverviewSection').classList.remove('hidden');
    el('studySessionSection')?.classList.add('hidden');
    renderSessionPills();
    if (selectedSubject) refreshTopicSessionMeta();
    const returnToHome = session.mode === 'daily-review';
    setView(returnToHome ? 0 : 1);
    if (returnToHome) void refreshDailyReviewHomePanel({ useExisting: false });
    else if (selectedSubject && typeof refreshSubjectProgressPanel === 'function') {
      void refreshSubjectProgressPanel({ topicsForSubject: currentSubjectTopics });
    }
  };
  el('backToDeckBtn').onclick = () => {
    setView(2);
    if (selectedTopic) void loadDeck();
  };
  const flashcardEl = el('flashcard');
  if (flashcardEl) {
    const canFlipSessionFlashcard = (eventTarget = null, opts = {}) => {
      const options = opts && typeof opts === 'object' ? opts : {};
      const allowButtonTarget = !!options.allowButtonTarget;
      if (!session.active || !isStudySessionVisible()) return false;
      if (document.body.classList.contains('session-image-open')) return false;
      if (document.querySelector('dialog[open]')) return false;
      if (Date.now() < suppressFlashcardTapUntil) return false;
      if (flashcardEl.classList.contains('swiping')) return false;
      if (flashcardEl.dataset.type === 'mcq') return false;
      if (hasActiveTextSelection()) return false;
      const target = eventTarget instanceof Element ? eventTarget : null;
      if (target && target.closest('.card-edit-btn, input, textarea, select, [contenteditable="true"]')) {
        return false;
      }
      if (!allowButtonTarget && target && target.closest('button')) return false;
      return true;
    };
    const flipSessionFlashcard = () => {
      flashcardEl.classList.toggle('flipped');
    };

    flashcardEl.onclick = e => {
      if (!canFlipSessionFlashcard(e.target)) return;
      flipSessionFlashcard();
    };

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeStudyImageLightbox();
      const target = e.target instanceof Element ? e.target : null;
      const editingTarget = target && target.closest('input, textarea, select, [contenteditable="true"]');
      const isSessionShortcutContext = (
        !editingTarget
        && !hasActiveTextSelection()
        && session.active
        && isStudySessionVisible()
        && !document.body.classList.contains('session-image-open')
        && !document.querySelector('dialog[open]')
      );
      const isMcqSessionCard = isSessionShortcutContext && flashcardEl.dataset.type === 'mcq';

      if (
        isMcqSessionCard &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const isEnter = (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.shiftKey;
        if (isEnter) {
          const { checkBtn } = getActiveSessionMcqControls();
          if (checkBtn) {
            e.preventDefault();
            checkBtn.click();
            return;
          }
        }
        if (!e.shiftKey) {
          let optionNumber = 0;
          if (/^Digit[1-9]$/.test(e.code)) optionNumber = Number(e.code.slice(5));
          else if (/^Numpad[1-9]$/.test(e.code)) optionNumber = Number(e.code.slice(6));
          else if (/^[1-9]$/.test(e.key)) optionNumber = Number(e.key);
          if (optionNumber > 0) {
            const { optionButtons, checkBtn } = getActiveSessionMcqControls();
            const checkMode = String(checkBtn?.dataset?.mode || checkBtn?.textContent || '').trim().toLowerCase();
            if (checkMode.startsWith('check')) {
              const optionBtn = optionButtons[optionNumber - 1] || null;
              if (optionBtn) {
                e.preventDefault();
                optionBtn.click();
                return;
              }
            }
          }
        }
      }

      const gradeByCode = {
        Digit1: 'correct',
        Numpad1: 'correct',
        Digit2: 'partial',
        Numpad2: 'partial',
        Digit3: 'wrong',
        Numpad3: 'wrong'
      };
      const gradeFromCode = gradeByCode[e.code] || null;
      const gradeFromKey = e.key === '1' ? 'correct' : e.key === '2' ? 'partial' : e.key === '3' ? 'wrong' : null;
      const gradeResult = gradeFromCode || gradeFromKey;
      if (
        gradeResult &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        isSessionShortcutContext &&
        !isMcqSessionCard
      ) {
        e.preventDefault();
        gradeCard(gradeResult);
        return;
      }
      const isShiftBackspace = (e.code === 'Backspace' || e.key === 'Backspace')
        && e.shiftKey
        && !e.repeat
        && !e.metaKey
        && !e.ctrlKey
        && !e.altKey;
      if (
        isShiftBackspace &&
        isSessionShortcutContext
      ) {
        e.preventDefault();
        el('editSessionCardBtn')?.click();
        return;
      }
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Numpad0';
      if (!isSpace || e.repeat) return;
      if (!canFlipSessionFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
      flipSessionFlashcard();
    });
    document.addEventListener('keyup', e => {
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Numpad0';
      if (!isSpace) return;
      if (!canFlipSessionFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
    });
  }
  const editBtn = el('editSessionCardBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      if (!session.active) return;
      const card = session.activeQueue[0];
      if (!card) return;
      openEditDialog(card);
    };
  }
  const editBtnBack = el('editSessionCardBtnBack');
  if (editBtnBack && editBtn) editBtnBack.onclick = () => editBtn.click();
  const editDialog = el('editCardDialog');
  if (editDialog) {
    editDialog.addEventListener('click', e => {
      if (e.target === editDialog) editDialog.close();
    });
    editDialog.addEventListener('close', () => {
      editingCardId = null;
      editingCardSnapshot = null;
    });
  }
  const cardPreviewDialog = el('cardPreviewDialog');
  const closeCardPreviewBtn = el('closeCardPreviewBtn');
  const previewFlashcardEl = el('previewFlashcard');
  if (closeCardPreviewBtn && cardPreviewDialog) {
    closeCardPreviewBtn.onclick = () => closeDialog(cardPreviewDialog);
  }
  if (cardPreviewDialog) {
    cardPreviewDialog.addEventListener('click', e => {
      if (e.target === cardPreviewDialog) closeDialog(cardPreviewDialog);
    });
    cardPreviewDialog.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog(cardPreviewDialog);
        return;
      }
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      if (!isSpace || e.repeat) return;
      if (!canFlipPreviewFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
      flipPreviewFlashcard();
    });
  }
  if (previewFlashcardEl) {
    previewFlashcardEl.addEventListener('click', e => {
      if (!canFlipPreviewFlashcard(e.target)) return;
      flipPreviewFlashcard();
    });
  }

  const sessionImageLightbox = el('sessionImageLightbox');
  const sessionImageLightboxImg = el('sessionImageLightboxImg');
  if (sessionImageLightbox) {
    sessionImageLightbox.addEventListener('click', e => {
      if (e.target !== sessionImageLightbox) return;
      closeStudyImageLightbox();
    });
  }
  if (sessionImageLightboxImg) {
    sessionImageLightboxImg.addEventListener('click', handleStudyImageLightboxImageClick);
    sessionImageLightboxImg.addEventListener('touchstart', handleStudyImageLightboxTouchStart, { passive: false });
    sessionImageLightboxImg.addEventListener('touchmove', handleStudyImageLightboxTouchMove, { passive: false });
    sessionImageLightboxImg.addEventListener('touchend', handleStudyImageLightboxTouchEnd, { passive: false });
    sessionImageLightboxImg.addEventListener('touchcancel', handleStudyImageLightboxTouchEnd, { passive: false });
    sessionImageLightboxImg.addEventListener('wheel', handleStudyImageLightboxWheel, { passive: false });
  }

  const moveCardsDialog = el('moveCardsDialog');
  if (moveCardsDialog) {
    moveCardsDialog.addEventListener('click', e => {
      if (e.target === moveCardsDialog) closeDialog(moveCardsDialog);
    });
  }

  const toggleCardSelectBtn = el('toggleCardSelectBtn');
  if (toggleCardSelectBtn) {
    toggleCardSelectBtn.onclick = () => {
      setDeckSelectionMode(!deckSelectionMode);
      loadDeck();
    };
  }
  const cancelCardSelectionBtn = el('cancelCardSelectionBtn');
  if (cancelCardSelectionBtn) {
    cancelCardSelectionBtn.onclick = () => {
      setDeckSelectionMode(false);
      loadDeck();
    };
  }
  const deleteSelectedCardsBtn = el('deleteSelectedCardsBtn');
  if (deleteSelectedCardsBtn) deleteSelectedCardsBtn.onclick = deleteSelectedDeckCards;
  const moveSelectedCardsBtn = el('moveSelectedCardsBtn');
  if (moveSelectedCardsBtn) moveSelectedCardsBtn.onclick = openMoveCardsDialog;

  const moveCardsSubjectSelect = el('moveCardsSubjectSelect');
  if (moveCardsSubjectSelect) {
    moveCardsSubjectSelect.addEventListener('change', () => populateMoveTopics(moveCardsSubjectSelect.value));
  }
  const confirmMoveCardsBtn = el('confirmMoveCardsBtn');
  if (confirmMoveCardsBtn) confirmMoveCardsBtn.onclick = moveSelectedDeckCards;
  const cancelMoveCardsBtn = el('cancelMoveCardsBtn');
  if (cancelMoveCardsBtn) cancelMoveCardsBtn.onclick = () => closeDialog(el('moveCardsDialog'));
  updateDeckSelectionUi();

  const moveTopicsDialog = el('moveTopicsDialog');
  if (moveTopicsDialog) {
    moveTopicsDialog.addEventListener('click', e => {
      if (e.target === moveTopicsDialog) closeDialog(moveTopicsDialog);
    });
  }
  const progressCheckDialog = el('progressCheckDialog');
  if (progressCheckDialog) {
    progressCheckDialog.addEventListener('click', e => {
      if (e.target === progressCheckDialog) {
        closeProgressCheckHeaderMenu();
        closeDialog(progressCheckDialog);
      }
    });
  }
  const closeProgressCheckBtn = el('closeProgressCheckBtn');
  if (closeProgressCheckBtn) {
    closeProgressCheckBtn.onclick = () => {
      closeProgressCheckHeaderMenu();
      closeDialog(el('progressCheckDialog'));
    };
  }
  const refreshProgressCheckBtn = el('refreshProgressCheckBtn');
  if (refreshProgressCheckBtn) {
    refreshProgressCheckBtn.onclick = async () => {
      await renderProgressCheckTable();
      if (progressCheckHeaderMenuState.column) renderProgressCheckHeaderMenu();
    };
  }
  wireProgressCheckHeaderMenus();
  const topicSearchDialog = el('topicSearchDialog');
  if (topicSearchDialog) {
    topicSearchDialog.addEventListener('click', e => {
      if (e.target === topicSearchDialog) closeDialog(topicSearchDialog);
    });
  }
  const toggleTopicSelectBtn = el('toggleTopicSelectBtn');
  if (toggleTopicSelectBtn) {
    toggleTopicSelectBtn.onclick = () => {
      setTopicSelectionMode(!topicSelectionMode);
      loadTopics();
    };
  }
  const openTopicSearchBtn = el('openTopicSearchBtn');
  if (openTopicSearchBtn) openTopicSearchBtn.onclick = openTopicSearchModal;
  const closeTopicSearchBtn = el('closeTopicSearchBtn');
  if (closeTopicSearchBtn) closeTopicSearchBtn.onclick = () => closeDialog(el('topicSearchDialog'));
  const runTopicSearchBtn = el('runTopicSearchBtn');
  if (runTopicSearchBtn) runTopicSearchBtn.onclick = runTopicSearch;
  const topicSearchInput = el('topicSearchInput');
  if (topicSearchInput) {
    topicSearchInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      runTopicSearch();
    });
  }
  const cancelTopicSelectionBtn = el('cancelTopicSelectionBtn');
  if (cancelTopicSelectionBtn) {
    cancelTopicSelectionBtn.onclick = () => {
      setTopicSelectionMode(false);
      loadTopics();
    };
  }
  const selectAllBulkTopicsBtn = el('selectAllBulkTopicsBtn');
  if (selectAllBulkTopicsBtn) selectAllBulkTopicsBtn.onclick = toggleAllTopicsForBulk;
  const deleteSelectedTopicsBtn = el('deleteSelectedTopicsBtn');
  if (deleteSelectedTopicsBtn) deleteSelectedTopicsBtn.onclick = deleteSelectedTopics;
  const selectAllSessionTopicsBtn = el('selectAllSessionTopicsBtn');
  if (selectAllSessionTopicsBtn) {
    selectAllSessionTopicsBtn.onclick = () => {
      void selectAllTopicsForSession();
    };
  }
  const moveSelectedTopicsBtn = el('moveSelectedTopicsBtn');
  if (moveSelectedTopicsBtn) moveSelectedTopicsBtn.onclick = openMoveTopicsDialog;
  const confirmMoveTopicsBtn = el('confirmMoveTopicsBtn');
  if (confirmMoveTopicsBtn) confirmMoveTopicsBtn.onclick = moveSelectedTopics;
  const cancelMoveTopicsBtn = el('cancelMoveTopicsBtn');
  if (cancelMoveTopicsBtn) cancelMoveTopicsBtn.onclick = () => closeDialog(el('moveTopicsDialog'));
  updateTopicSelectionUi();

  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = el('sidebarToggle');
  const sidebarToggleHome = el('sidebarToggleHome');
  const sidebarToggleButtons = [sidebarToggle, sidebarToggleHome].filter(Boolean);
  const sidebarOverlay = el('sidebarOverlay');
  sidebarToggleButtons.forEach(toggleBtn => {
    toggleBtn.onclick = () => document.body.classList.toggle('sidebar-open');
  });
  if (sidebarOverlay) {
    sidebarOverlay.onclick = () => document.body.classList.remove('sidebar-open');
  }
  document.addEventListener('click', e => {
    if (!document.body.classList.contains('sidebar-open')) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('dialog[open]')) return;
    if (sidebarToggleButtons.some(toggleBtn => toggleBtn.contains(target))) return;
    if (sidebar && sidebar.contains(target)) return;
    document.body.classList.remove('sidebar-open');
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) document.body.classList.remove('sidebar-open');
  });

  const editorShell = document.querySelector('#editorPanel .editor-shell');
  const editorOverlay = el('editorOverlay');
  const toggleSidebarBtn = el('toggleEditorSidebarBtn');
  const openEditorIntroBtn = el('openEditorIntroBtn');
  if (toggleSidebarBtn && editorShell) {
    toggleSidebarBtn.onclick = () => editorShell.classList.toggle('sidebar-open');
  }
  if (openEditorIntroBtn) {
    openEditorIntroBtn.onclick = () => {
      if (editorIntroOpen) closeEditorIntro();
      else openEditorIntro();
    };
  }
  if (editorOverlay && editorShell) {
    editorOverlay.onclick = () => editorShell.classList.remove('sidebar-open');
  }
  window.addEventListener('resize', () => {
    if (window.innerWidth > 980 && editorShell) editorShell.classList.remove('sidebar-open');
    if (currentView !== 3 && editorShell) editorShell.classList.remove('sidebar-open');
  });
  window.addEventListener('resize', queueSessionFaceOverflowSync);
  window.addEventListener('resize', scheduleOverviewTableFit);
  el('closeEditCardBtn').onclick = () => {
    editingCardId = null;
    editingCardSnapshot = null;
    el('editCardDialog').close();
  };
  el('editAddMcqOptionBtn').onclick = () => {
    setMcqModeState(true, true);
    addEditMcqRow();
    syncMcqPrimaryAnswerMode(true);
  };
  el('openCreateCardBtn').onclick = openCreateCardEditor;
  el('addMcqOptionBtn').onclick = () => {
    setMcqModeState(false, true);
    addMcqRow();
    syncMcqPrimaryAnswerMode(false);
  };
  attachAutoClose(el('cardPrompt'));
  attachAutoClose(el('cardAnswer'));
  attachAutoClose(el('editCardPrompt'));
  attachAutoClose(el('editCardAnswer'));
  [el('cardAnswer'), el('editCardAnswer')].forEach(input => {
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.addEventListener('keydown', handlePrimaryMcqAnswerKeydown);
    input.addEventListener('input', () => enforcePrimaryMcqAnswerSingleLine(input));
  });
  ['dragover', 'drop'].forEach(evt => {
    document.addEventListener(evt, e => {
      e.preventDefault();
    }, true);
  });
  const plusLikeCode = new Set(['NumpadAdd', 'Equal', 'BracketRight', 'Backslash', 'IntlBackslash']);
  const isAddAnswerShortcut = e => {
    const isPlusLikeKey = e.key === '+' || e.key === '*';
    const isCtrlPlus = e.ctrlKey
      && !e.metaKey
      && !e.altKey
      && (isPlusLikeKey || plusLikeCode.has(e.code));
    return isCtrlPlus;
  };
  const createShortcut = e => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      el('addCardBtn').click();
      return;
    }
    if (isAddAnswerShortcut(e)) {
      e.preventDefault();
      el('addMcqOptionBtn')?.click();
    }
  };
  el('cardPrompt').addEventListener('keydown', createShortcut);
  el('cardAnswer').addEventListener('keydown', createShortcut);
  el('mcqOptions')?.addEventListener('keydown', createShortcut);
  el('cardPrompt').addEventListener('input', () => updateCreateValidation());
  el('cardAnswer').addEventListener('input', () => updateCreateValidation());
  wireLivePreview('cardPrompt', 'questionPreview', () => createQuestionTextAlign);
  wireLivePreview('cardAnswer', 'answerPreview', () => createAnswerTextAlign);
  const saveShortcut = e => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      el('saveEditCardBtn').click();
      return;
    }
    if (isAddAnswerShortcut(e)) {
      e.preventDefault();
      el('editAddMcqOptionBtn')?.click();
    }
  };
  el('editCardPrompt').addEventListener('keydown', saveShortcut);
  el('editCardAnswer').addEventListener('keydown', saveShortcut);
  el('editMcqOptions')?.addEventListener('keydown', saveShortcut);
  wireLivePreview('editCardPrompt', 'editQuestionPreview', () => editQuestionTextAlign);
  wireLivePreview('editCardAnswer', 'editAnswerPreview', () => editAnswerTextAlign);
  wireTextFormattingToolbar();
  document.querySelectorAll('.formula-btn').forEach(btn => {
    btn.onclick = () => openFormulaDialog(btn.dataset.formulaTarget);
  });
  const formulaDialog = el('formulaDialog');
  if (formulaDialog) {
    formulaDialog.addEventListener('click', e => {
      if (e.target === formulaDialog) formulaDialog.close();
    });
  }
  const closeFormulaBtn = el('closeFormulaBtn');
  const cancelFormulaBtn = el('cancelFormulaBtn');
  if (closeFormulaBtn) closeFormulaBtn.onclick = () => formulaDialog?.close();
  if (cancelFormulaBtn) cancelFormulaBtn.onclick = () => formulaDialog?.close();
  const formulaInput = el('formulaInput');
  const formulaDisplayToggle = el('formulaDisplayToggle');
  const insertFormulaBtn = el('insertFormulaBtn');
  const debouncedFormulaPreview = debounce(renderFormulaPreview, 300);
  if (formulaInput) formulaInput.addEventListener('input', debouncedFormulaPreview);
  if (formulaDisplayToggle) formulaDisplayToggle.addEventListener('change', renderFormulaPreview);
  if (insertFormulaBtn) insertFormulaBtn.onclick = insertFormulaImage;
  const tableDialog = el('tableDialog');
  if (tableDialog) {
    tableDialog.addEventListener('click', e => {
      if (e.target === tableDialog) closeDialog(tableDialog);
    });
    tableDialog.addEventListener('pointerdown', handleTableBuilderPointerDown);
    tableDialog.addEventListener('input', handleTableBuilderInput);
    tableDialog.addEventListener('focusin', handleTableBuilderSelection);
    tableDialog.addEventListener('click', handleTableBuilderSelection);
    tableDialog.addEventListener('keydown', e => {
      const isShiftEnter = e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isMetaEnter = e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
      if (!isShiftEnter && !isMetaEnter) return;
      e.preventDefault();
      insertTableFromDialog();
    });
  }
  const closeTableBtn = el('closeTableBtn');
  const cancelTableBtn = el('cancelTableBtn');
  const insertTableBtn = el('insertTableBtn');
  const tableRowsInput = el('tableRowsInput');
  const tableColsInput = el('tableColsInput');
  const tableHeaderToggle = el('tableHeaderToggle');
  const tableRowsDownBtn = el('tableRowsDownBtn');
  const tableRowsUpBtn = el('tableRowsUpBtn');
  const tableColsDownBtn = el('tableColsDownBtn');
  const tableColsUpBtn = el('tableColsUpBtn');
  const tableBuilderGrid = el('tableBuilderGrid');
  const tableAlignLeftBtn = el('tableAlignLeftBtn');
  const tableAlignCenterBtn = el('tableAlignCenterBtn');
  const tableAlignRightBtn = el('tableAlignRightBtn');
  const tableMergeBtn = el('tableMergeBtn');
  const tableUnmergeBtn = el('tableUnmergeBtn');
  if (closeTableBtn) closeTableBtn.onclick = () => closeDialog(el('tableDialog'));
  if (cancelTableBtn) cancelTableBtn.onclick = () => closeDialog(el('tableDialog'));
  if (insertTableBtn) insertTableBtn.onclick = insertTableFromDialog;
  if (tableRowsInput) tableRowsInput.addEventListener('input', updateTableBuilderFromControls);
  if (tableColsInput) tableColsInput.addEventListener('input', updateTableBuilderFromControls);
  if (tableHeaderToggle) tableHeaderToggle.addEventListener('change', updateTableBuilderFromControls);
  if (tableRowsDownBtn) tableRowsDownBtn.onclick = () => stepTableBuilderSize('rows', -1);
  if (tableRowsUpBtn) tableRowsUpBtn.onclick = () => stepTableBuilderSize('rows', 1);
  if (tableColsDownBtn) tableColsDownBtn.onclick = () => stepTableBuilderSize('cols', -1);
  if (tableColsUpBtn) tableColsUpBtn.onclick = () => stepTableBuilderSize('cols', 1);
  if (tableBuilderGrid) {
    tableBuilderGrid.addEventListener('click', e => {
      const target = e.target;
      if (target instanceof HTMLInputElement && target.classList.contains('table-builder-cell-input')) return;
      clearTableBuilderSelection();
    });
  }
  if (tableAlignLeftBtn) tableAlignLeftBtn.onclick = () => applyTableBuilderSelectedAlignment('left');
  if (tableAlignCenterBtn) tableAlignCenterBtn.onclick = () => applyTableBuilderSelectedAlignment('center');
  if (tableAlignRightBtn) tableAlignRightBtn.onclick = () => applyTableBuilderSelectedAlignment('right');
  if (tableMergeBtn) tableMergeBtn.onclick = mergeTableBuilderSelection;
  if (tableUnmergeBtn) tableUnmergeBtn.onclick = unmergeTableBuilderSelection;
  attachImageDrop(el('cardPrompt'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImageDrop(el('questionImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImagePicker(el('questionImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImageDrop(el('cardAnswer'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImageDrop(el('answerImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImagePicker(el('answerImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImageDrop(el('editCardPrompt'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImageDrop(el('editQuestionImagePreview'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImagePicker(el('editQuestionImagePreview'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImageDrop(el('editCardAnswer'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });
  attachImageDrop(el('editAnswerImagePreview'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });
  attachImagePicker(el('editAnswerImagePreview'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });

  el('cancelSubjectBtn').onclick = () => closeDialog(el('subjectDialog'));
  el('createSubjectBtn').onclick = addSubjectFromDialog;
  el('cancelSubjectEditBtn').onclick = () => el('subjectEditDialog').close();
  el('saveSubjectEditBtn').onclick = async () => {
    if (!editingSubjectId) return;
    const name = el('editSubjectName').value.trim();
    const accent = el('editSubjectColor').value || '#2dd4bf';
    if (!name) return;
    const existingSubject = (await getAll('subjects')).find(subject => subject.id === editingSubjectId);
    if (!existingSubject) return;
    const updatedSubject = buildSubjectRecord(existingSubject, { name, accent });
    await put('subjects', updatedSubject);
    if (selectedSubject?.id === editingSubjectId) {
      selectedSubject = { ...selectedSubject, ...updatedSubject };
      applySubjectTheme(accent);
    }
    editingSubjectId = null;
    el('subjectEditDialog').close();
    refreshSidebar();
    if (selectedSubject) loadTopics();
  };
  el('deleteSubjectBtn').onclick = async () => {
    if (!editingSubjectId) return;
    if (!confirm('Delete this subject and all its topics/cards?')) return;
    const id = editingSubjectId;
    editingSubjectId = null;
    el('subjectEditDialog').close();
    await deleteSubjectById(id);
  };

  el('subjectAccentPicker').addEventListener('input', e => {
    el('subjectAccentText').value = e.target.value;
  });
  el('subjectAccentText').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) el('subjectAccentPicker').value = v;
  });
  el('subjectPalette').addEventListener('click', e => {
    const btn = e.target.closest('button[data-color]');
    if (!btn) return;
    const c = btn.dataset.color;
    el('subjectAccentPicker').value = c;
    el('subjectAccentText').value = c;
  });

  // subject accent editing moved to subject edit dialog

  const sessionMinus = el('sessionMinus');
  const sessionPlus = el('sessionPlus');
  const sessionSizeValue = el('sessionSizeValue');
  if (sessionMinus && sessionPlus && sessionSizeValue) {
    const SESSION_PLUS_LONG_PRESS_MS = 420;
    let sessionPlusLongPressTimer = null;
    let sessionPlusDidLongPress = false;

    const clearSessionPlusLongPress = () => {
      if (sessionPlusLongPressTimer !== null) {
        clearTimeout(sessionPlusLongPressTimer);
        sessionPlusLongPressTimer = null;
      }
    };

    const setSessionSizeToMax = () => {
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      const next = Math.max(1, availableSessionCards);
      if (sessionSize !== next) {
        markSessionSizeManualOverride();
        sessionSize = next;
        renderSessionSizeCounter();
      }
    };

    const startSessionPlusLongPress = () => {
      clearSessionPlusLongPress();
      sessionPlusDidLongPress = false;
      sessionPlusLongPressTimer = setTimeout(() => {
        sessionPlusLongPressTimer = null;
        sessionPlusDidLongPress = true;
        setSessionSizeToMax();
      }, SESSION_PLUS_LONG_PRESS_MS);
    };

    sessionMinus.onclick = () => {
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      markSessionSizeManualOverride();
      sessionSize = Math.max(1, sessionSize - 1);
      renderSessionSizeCounter();
    };
    sessionPlus.onclick = () => {
      if (sessionPlusDidLongPress) {
        sessionPlusDidLongPress = false;
        return;
      }
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      markSessionSizeManualOverride();
      sessionSize = Math.min(availableSessionCards, sessionSize + 1);
      renderSessionSizeCounter();
    };
    sessionPlus.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      startSessionPlusLongPress();
    });
    sessionPlus.addEventListener('pointerup', clearSessionPlusLongPress);
    sessionPlus.addEventListener('pointercancel', clearSessionPlusLongPress);
    sessionPlus.addEventListener('pointerleave', clearSessionPlusLongPress);
    sessionPlus.addEventListener('blur', clearSessionPlusLongPress);
    renderSessionSizeCounter();
  }

  const addTopicFromInput = async () => {
    if (!selectedSubject) return alert('Pick a subject first.');
    const name = el('topicName').value.trim();
    if (!name) return;
    await put('topics', { id: uid(), subjectId: selectedSubject.id, name });
    await touchSubject(selectedSubject.id);
    el('topicName').value = '';
    loadTopics();
    refreshSidebar();
  };
  el('addTopicBtn').onclick = addTopicFromInput;
  el('topicName').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTopicFromInput();
  });

  el('addCardBtn').onclick = async () => {
    if (!selectedTopic) return alert('Pick a topic first.');
    if (!updateCreateValidation(true)) {
      createTouched = true;
      updateCreateValidation(true);
      return;
    }
    const imagesQ = getFieldImageList(el('cardPrompt'), 'imageDataQ');
    const imagesA = getFieldImageList(el('cardAnswer'), 'imageDataA');
    const cardId = uid();
    let imagePayload;
    try {
      imagePayload = await buildCardImagePayloadForSave(cardId, imagesQ, imagesA);
    } catch (err) {
      alert('Image upload failed. Please check your connection and try again.');
      console.warn('Card image upload failed:', err);
      return;
    }
    const options = parseMcqOptions();
    const type = options.length > 1 ? 'mcq' : 'qa';
    const createdAt = new Date().toISOString();
    const card = {
      id: cardId,
      topicId: selectedTopic.id,
      type,
      textAlign: normalizeTextAlign(createQuestionTextAlign),
      questionTextAlign: normalizeTextAlign(createQuestionTextAlign),
      answerTextAlign: normalizeTextAlign(createAnswerTextAlign),
      optionsTextAlign: normalizeTextAlign(createOptionsTextAlign),
      prompt: el('cardPrompt').value,
      answer: el('cardAnswer').value,
      options: type === 'mcq' ? options : [],
      ...imagePayload,
      createdAt,
      meta: { createdAt }
    };
    applyOptimisticCardCreate(card);
    const createdTopicId = String(card.topicId || '').trim();
    if (createdTopicId) {
      const bumpTopicCount = topic => {
        if (!topic || String(topic.id || '').trim() !== createdTopicId) return;
        const current = Number(topic.cardCount);
        topic.cardCount = Number.isFinite(current) ? current + 1 : 1;
      };
      currentSubjectTopics.forEach(bumpTopicCount);
      if (selectedTopic) bumpTopicCount(selectedTopic);
      const topicDirEntry = topicDirectoryById.get(createdTopicId);
      if (topicDirEntry) bumpTopicCount(topicDirEntry);
    }
    // Keep local snapshots in sync first, then persist remotely in background.
    void applyMutationToOfflineSnapshots('cards', 'put', card);
    apiQueryCache.set(`${API_BASE}/cards/${encodeURIComponent(card.id)}`, {
      ts: Date.now(),
      data: cloneData(card)
    });
    el('cardPrompt').value = '';
    el('cardAnswer').value = '';
    replaceFieldImages(el('cardPrompt'), el('questionImagePreview'), [], 'imageDataQ', updateCreateValidation);
    replaceFieldImages(el('cardAnswer'), el('answerImagePreview'), [], 'imageDataA', updateCreateValidation);
    const primaryToggle = el('primaryAnswerToggle');
    if (primaryToggle) primaryToggle.checked = true;
    el('mcqOptions').innerHTML = '';
    setMcqModeState(false, false);
    createTouched = false;
    updateCreateValidation();
    applyCreateQuestionTextAlign('center');
    applyCreateAnswerTextAlign('center');
    applyCreateOptionsTextAlign('center');
    void (async () => {
      try {
        await put('cards', card, {
          uiBlocking: false,
          skipFlushPending: true,
          invalidate: false
        });
        await putCardBank(card, { uiBlocking: false });
        if (selectedSubject?.id) await touchSubject(selectedSubject.id, undefined, { uiBlocking: false });
      } catch (err) {
        console.warn('Deferred post-create sync failed:', err);
      } finally {
        try {
          await refreshSidebar({ uiBlocking: false });
        } catch (err) {
          console.warn('Deferred post-create refresh failed:', err);
        }
      }
    })();
  };

  el('saveEditCardBtn').onclick = async () => {
    const saveBtn = el('saveEditCardBtn');
    if (!saveBtn || !editingCardId) return;
    if (saveBtn.dataset.busy === '1') return;
    saveBtn.dataset.busy = '1';
    saveBtn.disabled = true;

    const editingId = String(editingCardId || '').trim();
    const snapshot = (editingCardSnapshot && String(editingCardSnapshot?.id || '').trim() === editingId)
      ? cloneData(editingCardSnapshot)
      : null;
    const card = snapshot || await getById('cards', editingId);
    if (!card) {
      saveBtn.dataset.busy = '0';
      saveBtn.disabled = false;
      return;
    }

    const createdAt = card?.meta?.createdAt || card?.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const imagesQ = getFieldImageList(el('editCardPrompt'), 'imageDataQ');
    const imagesA = getFieldImageList(el('editCardAnswer'), 'imageDataA');
    let imagePayload;
    try {
      imagePayload = await buildCardImagePayloadForSave(card.id, imagesQ, imagesA);
    } catch (err) {
      alert('Image upload failed. Please check your connection and try again.');
      console.warn('Card image upload failed:', err);
      saveBtn.dataset.busy = '0';
      saveBtn.disabled = false;
      return;
    }

    const options = parseEditMcqOptions();
    const type = options.length > 1 ? 'mcq' : 'qa';
    const updated = {
      ...card,
      createdAt,
      meta: {
        ...(card.meta || {}),
        createdAt,
        updatedAt
      },
      textAlign: normalizeTextAlign(editQuestionTextAlign),
      questionTextAlign: normalizeTextAlign(editQuestionTextAlign),
      answerTextAlign: normalizeTextAlign(editAnswerTextAlign),
      optionsTextAlign: normalizeTextAlign(editOptionsTextAlign),
      prompt: el('editCardPrompt').value,
      answer: el('editCardAnswer').value,
      options: type === 'mcq' ? options : [],
      type,
      ...imagePayload
    };

    // Immediate UI update first (fast close and optimistic rendering).
    syncSessionCard(updated);
    applyOptimisticCardUpdate(updated);
    if (session.active) void renderSessionCard();

    const editDialog = el('editCardDialog');
    if (editDialog?.open) editDialog.close();
    replaceFieldImages(el('editCardPrompt'), el('editQuestionImagePreview'), [], 'imageDataQ');
    replaceFieldImages(el('editCardAnswer'), el('editAnswerImagePreview'), [], 'imageDataA');
    setPreview('editQuestionPreview', '', editQuestionTextAlign);
    setPreview('editAnswerPreview', '', editAnswerTextAlign);

    void (async () => {
      try {
        await put('cards', updated, { uiBlocking: false });
        await putCardBank(updated, { uiBlocking: false });
        await touchSubjectByTopicId(updated.topicId, undefined, { uiBlocking: false });
      } catch (err) {
        console.warn('Deferred card edit sync failed:', err);
      } finally {
        try {
          await refreshSidebar({ uiBlocking: false });
          const cardsOverviewSection = el('cardsOverviewSection');
          const cardsOverviewVisible = cardsOverviewSection
            ? !cardsOverviewSection.classList.contains('hidden')
            : false;
          if (cardsOverviewVisible && selectedTopic?.id === updated.topicId) {
            void loadDeck();
          }
          if (currentView === 3 && selectedTopic?.id === updated.topicId) {
            void loadEditorCards();
          }
        } catch (err) {
          console.warn('Deferred post-edit refresh failed:', err);
        } finally {
          saveBtn.dataset.busy = '0';
          saveBtn.disabled = false;
        }
      }
    })();
  };

  document.querySelectorAll('[data-grade]').forEach(btn => {
    btn.addEventListener('click', () => gradeCard(btn.dataset.grade));
  });

  ensureKatexLoaded().then(loaded => {
    if (!loaded) return;
    rerenderAllRichMath();
  });
  await Promise.all([
    refreshSidebar(),
    refreshDailyReviewHomePanel({ useExisting: false })
  ]);
  if (showOnboardingTutorial) openOnboardingTutorial();
}

window.addEventListener('DOMContentLoaded', boot);
