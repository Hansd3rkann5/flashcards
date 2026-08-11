// AI Assistant — Chat panel (Phase 3)
// ============================================================================
// Global slide-over chat + FAB. Talks to the Supabase Edge Function
// `assistant` (Phase 2): grounded, streamed answers per subject, with model
// and language switches and study-session card context.

const ASSISTANT_MODEL_STORAGE_KEY = 'flashcards.assistant.model.v1';
const ASSISTANT_LANG_STORAGE_KEY = 'flashcards.assistant.language.v1';
const ASSISTANT_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet (fast)' },
  { id: 'claude-opus-4-8', label: 'Opus (powerful)' }
];
const ASSISTANT_LANGS = [
  { id: 'auto', label: 'Auto' },
  { id: 'de', label: 'German' },
  { id: 'en', label: 'English' }
];

const assistantState = {
  subjectId: '',
  model: localStorage.getItem(ASSISTANT_MODEL_STORAGE_KEY) || 'claude-sonnet-4-6',
  language: localStorage.getItem(ASSISTANT_LANG_STORAGE_KEY) || 'auto',
  msgs: [],          // [{ role, apiContent, uiText, chips }]
  streaming: false
};

/**
 * @function assistantStripText
 * @description Reduces stored HTML/markdown to a plain-text snippet for context.
 */
function assistantStripText(value, maxLen = 600) {
  let text = String(value == null ? '' : value);
  text = text.replace(/<[^>]+>/g, ' ').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/**
 * @function getStudySessionContext
 * @description Returns { subjectId, card } when a study session is active.
 */
function getStudySessionContext() {
  try {
    if (typeof session !== 'undefined' && session?.active && Array.isArray(session.activeQueue) && session.activeQueue.length) {
      const card = session.activeQueue[0] || null;
      const subjectId = String(selectedSubject?.id || '').trim();
      if (subjectId) return { subjectId, card };
    }
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * @function ensureAssistantUi
 * @description Creates (once) the FAB and slide-over panel.
 */
function ensureAssistantUi() {
  if (el('assistantPanel')) return;

  const fab = document.createElement('button');
  fab.id = 'assistantFab';
  fab.className = 'assistant-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Open Claude');
  fab.title = 'Claude';
  fab.innerHTML = `
    <span class="assistant-fab-stack" aria-hidden="true">
      <span class="assistant-fab-card c1"></span>
      <span class="assistant-fab-card c2"></span>
      <span class="assistant-fab-card c3"></span>
    </span>
  `;
  fab.addEventListener('click', () => openAssistantPanel());
  document.body.appendChild(fab);

  const backdrop = document.createElement('div');
  backdrop.id = 'assistantBackdrop';
  backdrop.className = 'assistant-backdrop';
  backdrop.addEventListener('click', () => closeAssistantPanel());
  document.body.appendChild(backdrop);

  const panel = document.createElement('div');
  panel.id = 'assistantPanel';
  panel.className = 'assistant-panel';
  panel.setAttribute('hidden', '');
  panel.innerHTML = `
    <div class="assistant-scroll" data-role="scroll">
      <div class="assistant-head">
        <div class="assistant-head-top">
          <div class="assistant-titles">
            <div class="assistant-title">Claude</div>
            <div class="assistant-subject tiny" data-role="subject-name"></div>
          </div>
          <div class="assistant-head-actions">
            <button class="btn assistant-icon-btn" type="button" data-action="settings" aria-label="Settings" title="Model &amp; language">⚙</button>
            <button class="btn assistant-icon-btn" type="button" data-action="close" aria-label="Close" title="Close">✕</button>
          </div>
        </div>
        <div class="assistant-controls" data-role="controls" hidden>
          <label class="assistant-ctl">
            <span class="tiny">Model</span>
            <select data-role="model">
              ${ASSISTANT_MODELS.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
            </select>
          </label>
          <label class="assistant-ctl">
            <span class="tiny">Language</span>
            <select data-role="language">
              ${ASSISTANT_LANGS.map(l => `<option value="${l.id}">${l.label}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      <div class="assistant-messages" data-role="messages"></div>
    </div>
    <div class="assistant-input">
      <textarea data-role="input" rows="2" placeholder="Ask something about this subject…"></textarea>
      <button class="btn assistant-send" type="button" data-action="send">Send</button>
    </div>
  `;
  document.body.appendChild(panel);

  panel.querySelector('[data-action="close"]').addEventListener('click', () => closeAssistantPanel());
  panel.querySelector('[data-action="settings"]').addEventListener('click', () => {
    panel.querySelector('[data-role="controls"]')?.toggleAttribute('hidden');
  });

  const modelSel = panel.querySelector('[data-role="model"]');
  modelSel.value = assistantState.model;
  modelSel.addEventListener('change', () => {
    assistantState.model = modelSel.value;
    localStorage.setItem(ASSISTANT_MODEL_STORAGE_KEY, modelSel.value);
  });

  const langSel = panel.querySelector('[data-role="language"]');
  langSel.value = assistantState.language;
  langSel.addEventListener('change', () => {
    assistantState.language = langSel.value;
    localStorage.setItem(ASSISTANT_LANG_STORAGE_KEY, langSel.value);
  });

  const input = panel.querySelector('[data-role="input"]');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void sendAssistantTurn();
    }
  });
  // Keyboard show/hide on mobile: re-fit the panel to the visible area.
  input.addEventListener('focus', scheduleAssistantFit);
  input.addEventListener('blur', scheduleAssistantFit);
  panel.querySelector('[data-action="send"]').addEventListener('click', () => void sendAssistantTurn());
}

/**
 * @function openAssistantPanel
 * @description Opens the chat panel for the currently open subject.
 */
function openAssistantPanel() {
  if (!isSupabaseBackendEnabled()) {
    alert('The Claude assistant requires the Supabase (online) mode.');
    return;
  }
  const subjectId = String(selectedSubject?.id || '').trim();
  if (!subjectId) {
    alert('Open a subject first to use the assistant.');
    return;
  }
  ensureAssistantUi();
  const panel = el('assistantPanel');
  const backdrop = el('assistantBackdrop');

  // Subject is always the currently open subject; switching subjects resets chat.
  if (subjectId !== assistantState.subjectId) {
    assistantState.subjectId = subjectId;
    assistantState.msgs = [];
  }
  const nameEl = panel.querySelector('[data-role="subject-name"]');
  if (nameEl) nameEl.textContent = String(selectedSubject?.name || '').trim();

  panel.removeAttribute('hidden');
  backdrop.classList.add('visible');
  document.body.classList.add('assistant-open');
  requestAnimationFrame(() => panel.classList.add('open'));
  renderAssistantMessages();
  assistantMaxVvH = 0; // recapture the no-keyboard baseline for this open
  bindAssistantViewport();
  fitAssistantToVisualViewport();
  window.setTimeout(() => panel.querySelector('[data-role="input"]')?.focus(), 260);
}

let assistantViewportBound = false;
let assistantMaxVvH = 0; // largest visualViewport height seen this open = "no keyboard" baseline
let assistantSafeAreaTop = null;

/**
 * @function getAssistantSafeAreaTop
 * @description Measures env(safe-area-inset-top) in px (cached) via a probe element.
 */
function getAssistantSafeAreaTop() {
  if (assistantSafeAreaTop != null) return assistantSafeAreaTop;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  assistantSafeAreaTop = Math.round(probe.getBoundingClientRect().height) || 0;
  probe.remove();
  return assistantSafeAreaTop;
}

/**
 * @function fitAssistantToVisualViewport
 * @description Shrinks the mobile panel to the area above the on-screen keyboard
 * (pinned to the visual viewport) so the sticky head never scrolls off-screen.
 * Clears the inline sizing when the keyboard is closed so CSS insets resume.
 */
function fitAssistantToVisualViewport() {
  const panel = el('assistantPanel');
  const vv = window.visualViewport;
  const clear = () => {
    if (!panel) return;
    panel.style.top = '';
    panel.style.bottom = '';
    panel.style.height = '';
  };
  if (!panel || panel.hasAttribute('hidden') || !vv) return clear();
  if (!window.matchMedia('(max-width: 640px)').matches) { clear(); return; }

  // Keyboard detection via the largest visualViewport height seen while open as
  // the "no keyboard" baseline. Robust in standalone PWAs where window.innerHeight
  // itself shrinks and offsetTop grows (so an innerHeight-based formula breaks).
  assistantMaxVvH = Math.max(assistantMaxVvH, vv.height);
  const keyboardOpen = (assistantMaxVvH - vv.height) > 150;
  if (!keyboardOpen) { clear(); return; }

  // If the layout viewport shrank for the keyboard (interactive-widget=
  // resizes-content honored → no visual-viewport scroll), the CSS top/bottom
  // insets already size the panel above the keyboard — stay out of the way.
  if (vv.offsetTop <= 20) { clear(); return; }

  // Otherwise iOS just scrolled the visual viewport (resizes-visual): pin the
  // panel to the visible area. position:fixed is relative to the layout viewport,
  // so add offsetTop to land at the visible top; add the safe-area inset so the
  // top edge clears the notch/status bar.
  const margin = 8;
  const safeTop = getAssistantSafeAreaTop();
  panel.style.top = `${vv.offsetTop + safeTop + margin}px`;
  panel.style.bottom = 'auto';
  panel.style.height = `${Math.max(160, vv.height - safeTop - margin * 2)}px`;
}

/**
 * @function scheduleAssistantFit
 * @description Re-runs the viewport fit across a few frames — iOS keeps scrolling
 * for a moment after the input gains focus, so a single call isn't enough.
 */
function scheduleAssistantFit() {
  fitAssistantToVisualViewport();
  [60, 150, 300, 500, 800].forEach(ms => window.setTimeout(fitAssistantToVisualViewport, ms));
}

/**
 * @function bindAssistantViewport
 * @description Binds viewport/keyboard listeners once (show/hide + scroll).
 */
function bindAssistantViewport() {
  if (assistantViewportBound) return;
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitAssistantToVisualViewport);
    window.visualViewport.addEventListener('scroll', fitAssistantToVisualViewport);
  }
  window.addEventListener('resize', fitAssistantToVisualViewport);
  // Fit on any scroll (iOS scrolls the page on focus).
  window.addEventListener('scroll', fitAssistantToVisualViewport, true);
  assistantViewportBound = true;
}

/**
 * @function closeAssistantPanel
 * @description Hides the chat panel.
 */
function closeAssistantPanel() {
  const panel = el('assistantPanel');
  const backdrop = el('assistantBackdrop');
  if (!panel) return;
  panel.classList.remove('open');
  backdrop?.classList.remove('visible');
  document.body.classList.remove('assistant-open');
  panel.style.top = '';
  panel.style.bottom = '';
  panel.style.height = '';
  window.setTimeout(() => panel.setAttribute('hidden', ''), 340);
}

/**
 * @function renderAssistantMessages
 * @description Renders all messages of the current conversation.
 */
function renderAssistantMessages() {
  const panel = el('assistantPanel');
  const box = panel?.querySelector('[data-role="messages"]');
  if (!box) return;
  box.innerHTML = '';
  assistantState.msgs.forEach(msg => box.appendChild(buildAssistantBubble(msg)));
  const scroller = panel?.querySelector('[data-role="scroll"]');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

/**
 * @function buildAssistantBubble
 * @description Builds one message bubble element.
 */
function buildAssistantBubble(msg) {
  const wrap = document.createElement('div');
  wrap.className = `assistant-msg assistant-msg-${msg.role === 'assistant' ? 'ai' : 'user'}`;
  if (Array.isArray(msg.chips) && msg.chips.length) {
    const chips = document.createElement('div');
    chips.className = 'assistant-chips';
    msg.chips.forEach(text => {
      const chip = document.createElement('span');
      chip.className = 'assistant-chip tiny';
      chip.textContent = text;
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
  }
  const body = document.createElement('div');
  body.className = 'assistant-msg-body';
  const text = String(msg.uiText || '');
  if (msg.role === 'assistant' && typeof renderRich === 'function' && text.trim()) {
    try { renderRich(body, text); } catch (_) { body.textContent = text; }
  } else {
    body.textContent = text;
  }
  wrap.appendChild(body);
  if (msg.role === 'assistant' && Array.isArray(msg.citations) && msg.citations.length) {
    wrap.appendChild(buildCitations(msg.citations));
  }
  return wrap;
}

/**
 * @function buildCitations
 * @description Renders a collapsible sources list.
 */
function buildCitations(citations) {
  const details = document.createElement('details');
  details.className = 'assistant-citations tiny';
  const summary = document.createElement('summary');
  summary.textContent = `Quellen (${citations.length})`;
  details.appendChild(summary);
  citations.forEach(c => {
    const item = document.createElement('div');
    item.className = 'assistant-citation';
    const title = c.title ? `${c.title}: ` : '';
    item.textContent = `${title}“${assistantStripText(c.cited_text || '', 240)}”`;
    details.appendChild(item);
  });
  return details;
}

/**
 * @function sendAssistantTurn
 * @description Sends the current input to the assistant and streams the reply.
 */
async function sendAssistantTurn() {
  const panel = el('assistantPanel');
  if (!panel || assistantState.streaming) return;
  const input = panel.querySelector('[data-role="input"]');
  const raw = String(input?.value || '').trim();
  if (!raw) return;
  const subjectId = String(assistantState.subjectId || '').trim();
  if (!subjectId) { alert('Please select a subject first.'); return; }

  // In a study session, always include the current card as context.
  // In the subject panel (no active session) there is no card to include.
  const chips = [];
  let apiContent = raw;
  const ctx = getStudySessionContext();
  if (ctx?.card && ctx.subjectId === subjectId) {
    const q = assistantStripText(ctx.card.prompt);
    const a = assistantStripText(ctx.card.answer);
    apiContent = `Context – current flashcard:\nQuestion: ${q}\nAnswer: ${a}\n\nMy question: ${raw}`;
    chips.push('📎 Current card');
  }

  assistantState.msgs.push({ role: 'user', apiContent, uiText: raw, chips });
  input.value = '';
  const aiMsg = { role: 'assistant', apiContent: '', uiText: '', chips: [], citations: [] };
  assistantState.msgs.push(aiMsg);
  renderAssistantMessages();

  const box = panel.querySelector('[data-role="messages"]');
  const scroller = panel.querySelector('[data-role="scroll"]');
  const aiBubble = box.lastElementChild;
  const aiBody = aiBubble?.querySelector('.assistant-msg-body');
  const sendBtn = panel.querySelector('[data-action="send"]');
  assistantState.streaming = true;
  if (sendBtn) sendBtn.disabled = true;

  const apiMessages = assistantState.msgs
    .filter(m => (m.role === 'assistant' ? m.apiContent : m.apiContent).trim() !== '' || m.role === 'user')
    .map(m => ({ role: m.role, content: m.apiContent }))
    .filter(m => m.content.trim() !== '');

  try {
    await callAssistantStream({
      subjectId,
      model: assistantState.model,
      language: assistantState.language,
      messages: apiMessages,
      onDelta: text => {
        aiMsg.uiText += text;
        aiMsg.apiContent += text;
        if (aiBody) { aiBody.textContent = aiMsg.uiText; if (scroller) scroller.scrollTop = scroller.scrollHeight; }
      },
      onDone: payload => {
        aiMsg.citations = Array.isArray(payload?.citations) ? payload.citations : [];
        renderAssistantMessages();
      },
      onError: message => {
        aiMsg.uiText = `⚠️ Error: ${message}`;
        aiMsg.apiContent = '';
        renderAssistantMessages();
      }
    });
  } catch (err) {
    aiMsg.uiText = `⚠️ Error: ${err?.message || err}`;
    renderAssistantMessages();
  } finally {
    assistantState.streaming = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

/**
 * @function callAssistantStream
 * @description Calls the Edge Function and dispatches SSE events.
 */
async function callAssistantStream({ subjectId, model, language, messages, onDelta, onDone, onError }) {
  const { data: { session: authSession } } = await supabaseClient.auth.getSession();
  if (!authSession) { onError?.('Not logged in.'); return; }

  const res = await fetch(`${window.__SUPABASE_URL__}/functions/v1/assistant`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authSession.access_token}`,
      apikey: window.__SUPABASE_ANON_KEY__,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ subjectId, model, language, messages })
  });

  if (!res.ok && !res.body) {
    onError?.(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data: ')) continue;
      let event;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }
      if (event.type === 'delta') onDelta?.(event.text);
      else if (event.type === 'done') onDone?.(event);
      else if (event.type === 'error') onError?.(event.message || 'Unknown error');
    }
  }
}

/**
 * @function updateAssistantFabVisibility
 * @description Shows the FAB only inside an opened subject (view >= 1), online.
 */
function updateAssistantFabVisibility() {
  const fab = el('assistantFab');
  if (!fab) return;
  const online = typeof isSupabaseBackendEnabled !== 'function' || isSupabaseBackendEnabled();
  const view = typeof getCurrentView === 'function' ? Number(getCurrentView()) : 0;
  const hasSubject = !!String(selectedSubject?.id || '').trim();
  fab.style.display = (online && view >= 1 && hasSubject) ? 'flex' : 'none';
}

// Create the FAB once the DOM is ready (only in Supabase/online mode) and keep
// its visibility in sync with navigation (available only inside a subject).
(function initAssistantUi() {
  const boot = () => {
    if (typeof isSupabaseBackendEnabled === 'function' && !isSupabaseBackendEnabled()) return;
    ensureAssistantUi();
    // Re-evaluate FAB visibility whenever the active view changes.
    if (typeof setView === 'function' && !setView.__assistantWrapped) {
      const originalSetView = setView;
      setView = function wrappedSetView(...args) {
        const result = originalSetView.apply(this, args);
        try { updateAssistantFabVisibility(); } catch (_) { /* ignore */ }
        return result;
      };
      setView.__assistantWrapped = true;
    }
    updateAssistantFabVisibility();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
