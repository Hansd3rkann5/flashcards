// AI Assistant — Chat panel (Phase 3)
// ============================================================================
// Global slide-over chat + FAB. Talks to the Supabase Edge Function
// `assistant` (Phase 2): grounded, streamed answers per subject, with model
// and language switches and study-session card context.

const ASSISTANT_MODEL_STORAGE_KEY = 'flashcards.assistant.model.v1';
const ASSISTANT_LANG_STORAGE_KEY = 'flashcards.assistant.language.v1';
const ASSISTANT_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
  { id: 'mistral-small-latest', label: 'Mistral Small' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet' },
  { id: 'claude-opus-4-8', label: 'Opus' }
];
const ASSISTANT_LANGS = [
  { id: 'auto', label: 'Auto' },
  { id: 'de', label: 'German' },
  { id: 'en', label: 'English' }
];

const assistantState = {
  subjectId: '',
  model: localStorage.getItem(ASSISTANT_MODEL_STORAGE_KEY) || 'claude-haiku-4-5-20251001',
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
      return { subjectId, card };
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
          <div class="assistant-ctl assistant-ctl-wide assistant-tpl-note tiny" data-role="template-note"></div>
        </div>
      </div>
      <div class="assistant-messages" data-role="messages"></div>
    </div>
    <div class="assistant-input">
      <textarea data-role="input" rows="2" placeholder="What's on your mind?"></textarea>
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

  updateAssistantTemplateNote(panel);

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
 * @function assistantTemplateSubject
 * @description Returns the user's subject literally named "Template" (or null).
 */
function assistantTemplateSubject() {
  try {
    if (subjectDirectoryById && typeof subjectDirectoryById.values === 'function') {
      for (const s of subjectDirectoryById.values()) {
        if (String(s?.name || '').trim().toLowerCase() === 'template') return s;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * @function updateAssistantTemplateNote
 * @description Explains, in ⚙ settings, that card style comes from a "Template" subject.
 */
function updateAssistantTemplateNote(panel) {
  const box = (panel || el('assistantPanel'))?.querySelector('[data-role="template-note"]');
  if (!box) return;
  if (assistantTemplateSubject()) {
    box.innerHTML = 'Card style comes from your <strong>“Template”</strong> subject — edit its example cards to change how generated cards look.';
    box.classList.add('ok');
  } else {
    box.innerHTML = 'Tip: create a subject named <strong>“Template”</strong> with a few example cards — the assistant will imitate their style when generating cards.';
    box.classList.remove('ok');
  }
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
  const inSession = typeof session !== 'undefined' && session?.active === true;
  if (!subjectId && !inSession) {
    alert('Open a subject first to use the assistant.');
    return;
  }
  ensureAssistantUi();
  const panel = el('assistantPanel');
  const backdrop = el('assistantBackdrop');

  // Use subject if available, otherwise use a review-session sentinel so chat
  // is not accidentally merged with a later subject's history.
  const contextId = subjectId || '__review__';
  if (contextId !== assistantState.subjectId) {
    assistantState.subjectId = contextId;
    assistantState.msgs = [];
  }
  const nameEl = panel.querySelector('[data-role="subject-name"]');
  if (nameEl) {
    nameEl.textContent = subjectId
      ? String(selectedSubject?.name || '').trim()
      : 'Daily Review';
  }

  el('assistantFab')?.classList.remove('assistant-fab--has-response');
  panel.removeAttribute('hidden');
  backdrop.classList.add('visible');
  document.body.classList.add('assistant-open');
  requestAnimationFrame(() => panel.classList.add('open'));
  updateAssistantTemplateNote(panel);
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
  const hasCards = Array.isArray(msg.cards) && msg.cards.length;
  if (msg.role === 'assistant' && !text.trim() && !hasCards) {
    // No content yet → show the "thinking" indicator until the first token.
    body.appendChild(buildAssistantTyping());
  } else if (msg.role === 'assistant' && typeof renderRich === 'function' && text.trim()) {
    try { renderRich(body, text); } catch (_) { body.textContent = text; }
  } else {
    body.textContent = text;
  }
  wrap.appendChild(body);
  if (msg.role === 'assistant' && Array.isArray(msg.cards) && msg.cards.length) {
    wrap.appendChild(buildAssistantCardPreview(msg));
  }
  if (msg.role === 'assistant' && Array.isArray(msg.citations) && msg.citations.length) {
    wrap.appendChild(buildCitations(msg.citations));
  }
  return wrap;
}

/**
 * @function getAssistantTopics
 * @description Returns the current subject's topics ([{id,name}]) for the picker.
 */
function getAssistantTopics() {
  try {
    if (Array.isArray(currentSubjectTopics) && currentSubjectTopics.length) {
      return currentSubjectTopics
        .map(t => ({ id: String(t?.id || '').trim(), name: String(t?.name || '').trim() || 'Untitled topic' }))
        .filter(t => t.id);
    }
  } catch (_) { /* ignore */ }
  return [];
}

/**
 * @function defaultAssistantTopicId
 * @description Best-guess target topic: current study card's topic → selected topic → first.
 */
function defaultAssistantTopicId(topics) {
  const ctx = getStudySessionContext();
  const fromCard = String(ctx?.card?.topicId || '').trim();
  if (fromCard && topics.some(t => t.id === fromCard)) return fromCard;
  try {
    const sel = String(selectedTopic?.id || '').trim();
    if (sel && topics.some(t => t.id === sel)) return sel;
  } catch (_) { /* ignore */ }
  return topics[0]?.id || '';
}

/**
 * @function buildAssistantCardPreview
 * @description Renders the proposed cards with include-checkboxes, a topic picker
 * and an "Add to deck" button that writes them into the cards store.
 */
function buildAssistantCardPreview(msg) {
  const box = document.createElement('div');
  box.className = 'assistant-cards';

  if (msg.cardsSaved) {
    const done = document.createElement('div');
    done.className = 'assistant-cards-done tiny';
    done.textContent = `✓ Added ${msg.cardsSaved} card${msg.cardsSaved === 1 ? '' : 's'}${msg.cardsSavedTopic ? ` to “${msg.cardsSavedTopic}”` : ''}.`;
    box.appendChild(done);
    return box;
  }

  const list = document.createElement('div');
  list.className = 'assistant-cards-list';
  const checks = [];
  msg.cards.forEach((card, i) => {
    const isMcq = card?.type === 'mcq' && Array.isArray(card?.options) && card.options.length > 1;
    const requireOrder = isMcq && !!card.optionsRequireOrder;
    const row = document.createElement('label');
    row.className = 'assistant-card-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.index = String(i);
    checks.push(cb);
    row.appendChild(cb);
    const content = document.createElement('div');
    content.className = 'assistant-card-content';
    const badge = requireOrder ? 'Sort' : (isMcq ? 'MCQ' : 'Q&A');
    const q = document.createElement('div');
    q.className = 'assistant-card-q';
    q.innerHTML = `<span class="assistant-card-badge tiny">${badge}</span>${escapeHtml(assistantStripText(card.prompt, 300))}`;
    content.appendChild(q);
    if (isMcq) {
      const opts = document.createElement('div');
      opts.className = 'assistant-card-opts tiny';
      const rows = requireOrder
        ? card.options.slice().sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))
        : card.options;
      rows.forEach((o, idx) => {
        const line = document.createElement('div');
        if (requireOrder) {
          line.className = 'assistant-opt correct';
          line.textContent = `${idx + 1}. ${assistantStripText(o?.text, 160)}`;
        } else {
          line.className = o?.correct ? 'assistant-opt correct' : 'assistant-opt';
          line.textContent = `${o?.correct ? '✓' : '✗'} ${assistantStripText(o?.text, 160)}`;
        }
        opts.appendChild(line);
      });
      content.appendChild(opts);
    } else {
      const a = document.createElement('div');
      a.className = 'assistant-card-a tiny';
      a.textContent = assistantStripText(card.answer, 300);
      content.appendChild(a);
    }
    row.appendChild(content);
    list.appendChild(row);
  });
  box.appendChild(list);

  const controls = document.createElement('div');
  controls.className = 'assistant-cards-controls';

  const topics = getAssistantTopics();
  const topicSel = document.createElement('select');
  topicSel.className = 'assistant-cards-topic';
  if (topics.length) {
    topics.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      topicSel.appendChild(opt);
    });
    topicSel.value = defaultAssistantTopicId(topics);
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No topics — create one first';
    topicSel.appendChild(opt);
    topicSel.disabled = true;
  }
  controls.appendChild(topicSel);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn assistant-cards-add';
  const refreshLabel = () => {
    const n = checks.filter(c => c.checked).length;
    addBtn.textContent = `Add ${n} to deck`;
    addBtn.disabled = n === 0 || !topicSel.value;
  };
  checks.forEach(c => c.addEventListener('change', refreshLabel));
  refreshLabel();
  addBtn.addEventListener('click', async () => {
    const topicId = String(topicSel.value || '').trim();
    if (!topicId) return;
    const chosen = checks.filter(c => c.checked).map(c => msg.cards[Number(c.dataset.index)]);
    if (!chosen.length) return;
    addBtn.disabled = true;
    addBtn.textContent = 'Adding…';
    try {
      const n = await saveGeneratedCards(chosen, topicId);
      msg.cardsSaved = n;
      msg.cardsSavedTopic = topics.find(t => t.id === topicId)?.name || '';
      renderAssistantMessages();
    } catch (err) {
      addBtn.disabled = false;
      refreshLabel();
      alert(`Could not add cards: ${err?.message || err}`);
    }
  });
  controls.appendChild(addBtn);
  box.appendChild(controls);
  return box;
}

/**
 * @function saveGeneratedCards
 * @description Writes assistant-proposed cards into the `cards` store using the
 * same schema and persistence path as manual card creation. Returns the count.
 */
async function saveGeneratedCards(proposed, topicId) {
  const createdAt = new Date().toISOString();
  let saved = 0;
  for (const p of proposed) {
    const requireOrder = p?.type === 'mcq' && !!p?.optionsRequireOrder;
    const isMcq = p?.type === 'mcq' && Array.isArray(p?.options) && p.options.length > 1;
    let options = [];
    if (isMcq) {
      options = p.options
        .map((o, idx) => ({
          text: String(o?.text || '').trim(),
          correct: requireOrder ? true : !!o?.correct,
          order: Number(o?.order) || idx + 1
        }))
        .filter(o => o.text);
      // Sorting cards: the correct sequence is defined by `order` (mirrors parseMcqOptions).
      if (requireOrder) options.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    const answer = String(p?.answer || '').trim() ||
      (isMcq ? (options.find(o => o.correct)?.text || options[0]?.text || '') : '');
    const cardId = uid();
    const card = {
      id: cardId,
      topicId,
      type: isMcq && options.length > 1 ? 'mcq' : 'qa',
      textAlign: 'center',
      questionTextAlign: 'center',
      answerTextAlign: p?.answerTextAlign === 'left' ? 'left' : 'center',
      optionsTextAlign: 'center',
      prompt: String(p?.prompt || '').trim(),
      answer,
      options: isMcq && options.length > 1 ? options : [],
      optionsRequireOrder: isMcq && options.length > 1 ? requireOrder : false,
      createdAt,
      meta: { createdAt }
    };
    if (!card.prompt) continue;
    try { if (typeof applyOptimisticCardCreate === 'function') applyOptimisticCardCreate(card); } catch (_) { /* ignore */ }
    try { await applyMutationToOfflineSnapshots('cards', 'put', card); } catch (_) { /* ignore */ }
    await put('cards', card, { uiBlocking: false, skipFlushPending: true });
    try { if (typeof putCardBank === 'function') await putCardBank(card, { uiBlocking: false }); } catch (_) { /* ignore */ }
    // Keep topic card counts in sync (mirrors manual creation).
    try {
      const bump = t => {
        if (t && String(t.id || '').trim() === String(topicId).trim()) {
          const c = Number(t.cardCount);
          t.cardCount = Number.isFinite(c) ? c + 1 : 1;
        }
      };
      if (Array.isArray(currentSubjectTopics)) currentSubjectTopics.forEach(bump);
      if (typeof selectedTopic !== 'undefined') bump(selectedTopic);
    } catch (_) { /* ignore */ }
    saved += 1;
  }
  return saved;
}

/**
 * @function buildAssistantTyping
 * @description Animated "assistant is thinking" indicator (three bouncing dots).
 */
function buildAssistantTyping() {
  const wrap = document.createElement('span');
  wrap.className = 'assistant-typing';
  wrap.setAttribute('aria-label', 'Assistant is thinking…');
  wrap.setAttribute('role', 'status');
  wrap.innerHTML = '<span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span>';
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
  const contextId = String(assistantState.subjectId || '').trim();
  if (!contextId) { alert('Please select a subject first.'); return; }
  // Strip the review sentinel before sending to the API; Edge Function treats
  // empty subjectId as "no knowledge base" which is correct for review sessions.
  const subjectId = contextId === '__review__' ? '' : contextId;

  // In a study session, always include the current card as context.
  // In the subject panel (no active session) there is no card to include.
  const chips = [];
  let apiContent = raw;
  const ctx = getStudySessionContext();
  if (ctx?.card && (ctx.subjectId === subjectId || contextId === '__review__')) {
    const q = assistantStripText(ctx.card.prompt, 200);
    const a = assistantStripText(ctx.card.answer, 200);
    apiContent = `Card: Q: ${q} / A: ${a}\n${raw}`;
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
    .filter(m => m.content.trim() !== '')
    .slice(-6);

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
      onCards: cards => {
        aiMsg.cards = cards;
        if (!aiMsg.uiText.trim()) aiMsg.uiText = `Proposed ${cards.length} card${cards.length === 1 ? '' : 's'} — review and add them below.`;
        renderAssistantMessages();
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
    // Never leave the thinking indicator spinning on an empty result.
    if (!String(aiMsg.uiText || '').trim() && !(Array.isArray(aiMsg.cards) && aiMsg.cards.length)) {
      aiMsg.uiText = '(No response.)';
      renderAssistantMessages();
    }
    // Notify via FAB pulse if the panel was closed while waiting for the response.
    if (!document.body.classList.contains('assistant-open')) {
      el('assistantFab')?.classList.add('assistant-fab--has-response');
    }
  }
}

/**
 * @function callAssistantStream
 * @description Calls the Edge Function and dispatches SSE events.
 */
async function callAssistantStream({ subjectId, model, language, messages, onDelta, onCards, onDone, onError }) {
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
      else if (event.type === 'cards') onCards?.(Array.isArray(event.cards) ? event.cards : []);
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
  const inSession = typeof session !== 'undefined' && session?.active === true;
  fab.style.display = (online && view >= 1 && (hasSubject || inSession)) ? 'flex' : 'none';
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
