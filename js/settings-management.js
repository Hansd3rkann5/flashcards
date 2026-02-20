// Settings, Import/Export, and Management Dialogs
// ============================================================================
/**
* @function openSubjectDialog
 * @description Opens the subject dialog.
 */

function openSubjectDialog() {
  el('subjectNameInput').value = '';
  el('subjectAccentPicker').value = '#2dd4bf';
  el('subjectAccentText').value = '#2dd4bf';
  showDialog(el('subjectDialog'));
}

/**
 * @function addSubjectFromDialog
 * @description Reads subject form values, creates the subject, and refreshes the sidebar.
 */

async function addSubjectFromDialog() {
  const name = el('subjectNameInput').value.trim();
  if (!name) return;
  const accent = el('subjectAccentText').value.trim() || '#2dd4bf';
  const subject = buildSubjectRecord({ id: uid(), name, accent });
  await put('subjects', subject);
  closeDialog(el('subjectDialog'));
  refreshSidebar();
}

const CONTENT_EXCHANGE_PROFILE_SETTINGS_ID = 'profile';
const CONTENT_EXCHANGE_FETCH_BATCH_SIZE = 20;
const CONTENT_EXCHANGE_CARD_PREVIEW_MAX_LEN = 120;
let contentExchangeSnapshot = null;
let contentExchangeLoading = false;
let contentExchangeImporting = false;
let contentExchangeLastLoadToken = 0;
let contentExchangeSelectedCardIdsByTopicKey = new Map();

/**
 * @function exportJSON
 * @description Exports JSON.
 */

async function exportJSON() {
  const subjects = await getAll('subjects');
  const topics = await getAll('topics');
  const cards = await getAll('cards');
  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]));
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));
  const payload = {
    subjects,
    topics: topics.map(t => ({
      ...t,
      subjectName: subjectMap[t.subjectId]?.name || ''
    })),
    cards: cards.map(c => ({
      ...c,
      topicName: topicMap[c.topicId]?.name || '',
      subjectName: subjectMap[topicMap[c.topicId]?.subjectId]?.name || ''
    })),
    progress: await getAll('progress')
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'flashcards-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @function exportCSV
 * @description Exports CSV.
 */

async function exportCSV() {
  const subjects = await getAll('subjects');
  const topics = await getAll('topics');
  const cards = await getAll('cards');
  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]));
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));
  const lines = ['id,topicId,topicName,subjectName,type,prompt,answer,options'];
  cards.forEach(c => {
    const options = c.options ? JSON.stringify(c.options).replaceAll('"', '""') : '';
    const esc = s => `"${String(s || '').replaceAll('"', '""')}"`;
    const topic = topicMap[c.topicId];
    const subject = topic ? subjectMap[topic.subjectId] : null;
    lines.push([
      c.id,
      c.topicId,
      esc(topic?.name || ''),
      esc(subject?.name || ''),
      c.type,
      esc(c.prompt),
      esc(c.answer),
      esc(options)
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'flashcards-cards.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @function importJSON
 * @description Imports JSON.
 */

async function importJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  for (const s of ['subjects', 'topics', 'cards', 'progress']) {
    for (const row of (data[s] || [])) {
      if (s === 'cards') {
        const cardId = String(row?.id || '').trim() || uid();
        const migratedImagePayload = await buildCardImagePayloadForSave(
          cardId,
          getCardImageList(row, 'Q'),
          getCardImageList(row, 'A')
        );
        const nextCard = {
          ...row,
          id: cardId,
          ...migratedImagePayload
        };
        await put('cards', nextCard);
        await putCardBank(nextCard);
      } else {
        await put(s, row);
      }
    }
  }
  progressByCardId = new Map();
  alert('Imported successfully.');
  refreshSidebar();
  if (selectedSubject) loadTopics();
  if (selectedTopic) loadDeck();
}

/**
 * @function formatImageMigrationLogTimestamp
 * @description Returns a compact local timestamp for migration log lines.
 */

function formatImageMigrationLogTimestamp(date = new Date()) {
  const safeDate = date instanceof Date ? date : new Date();
  const hh = String(safeDate.getHours()).padStart(2, '0');
  const mm = String(safeDate.getMinutes()).padStart(2, '0');
  const ss = String(safeDate.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * @function formatImageMigrationDurationMs
 * @description Formats a duration in milliseconds for migration logs.
 */

function formatImageMigrationDurationMs(ms = 0) {
  const safe = Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : 0;
  if (safe < 1000) return `${Math.round(safe)}ms`;
  return `${(safe / 1000).toFixed(2)}s`;
}

/**
 * @function chunkImageMigrationList
 * @description Splits a list into stable chunks for batched Supabase reads.
 */

function chunkImageMigrationList(list = [], size = 20) {
  const items = Array.isArray(list) ? list : [];
  const chunkSize = Number.isFinite(Number(size)) ? Math.max(1, Math.trunc(Number(size))) : 20;
  const chunks = [];
  for (let idx = 0; idx < items.length; idx += chunkSize) {
    chunks.push(items.slice(idx, idx + chunkSize));
  }
  return chunks;
}

/**
 * @function appendImageMigrationLogLine
 * @description Appends one line to the image migration output window.
 */

function appendImageMigrationLogLine(message = '') {
  const output = el('imageMigrationLogOutput');
  if (!output) return;
  const safeMessage = String(message || '').trim();
  if (!safeMessage) return;
  const prefix = `[${formatImageMigrationLogTimestamp()}] `;
  output.textContent += `${prefix}${safeMessage}\n`;
  output.scrollTop = output.scrollHeight;
}

/**
 * @function clearImageMigrationLogOutput
 * @description Clears all migration output lines.
 */

function clearImageMigrationLogOutput() {
  const output = el('imageMigrationLogOutput');
  if (!output) return;
  output.textContent = '';
}

/**
 * @function setImageMigrationStatusText
 * @description Updates the migration status text in the output dialog.
 */

function setImageMigrationStatusText(message = '') {
  const status = el('imageMigrationStatus');
  if (!status) return;
  status.textContent = String(message || '').trim() || 'Waiting to start...';
}

/**
 * @function setImageMigrationDialogRunningState
 * @description Locks/unlocks migration dialog controls while migration is running.
 */

function setImageMigrationDialogRunningState(running = false) {
  const dialog = el('imageMigrationLogDialog');
  const closeBtn = el('closeImageMigrationLogBtn');
  const doneBtn = el('doneImageMigrationLogBtn');
  const busy = !!running;
  if (dialog) dialog.dataset.busy = busy ? '1' : '0';
  if (closeBtn) closeBtn.disabled = busy;
  if (doneBtn) {
    doneBtn.disabled = busy;
    doneBtn.textContent = busy ? 'Running...' : 'Close';
  }
}

/**
 * @function closeImageMigrationLogDialog
 * @description Closes image migration output dialog when no migration is running.
 */

function closeImageMigrationLogDialog() {
  const dialog = el('imageMigrationLogDialog');
  if (!dialog) return;
  if (dialog.dataset.busy === '1') return;
  closeDialog(dialog);
}

/**
 * @function wireImageMigrationLogDialog
 * @description Wires migration output dialog interactions once.
 */

function wireImageMigrationLogDialog() {
  const dialog = el('imageMigrationLogDialog');
  if (!dialog || dialog.dataset.wired === '1') return;
  dialog.dataset.wired = '1';
  const closeBtn = el('closeImageMigrationLogBtn');
  const doneBtn = el('doneImageMigrationLogBtn');
  if (closeBtn) closeBtn.onclick = closeImageMigrationLogDialog;
  if (doneBtn) doneBtn.onclick = closeImageMigrationLogDialog;
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    closeImageMigrationLogDialog();
  });
  dialog.addEventListener('cancel', event => {
    if (dialog.dataset.busy !== '1') return;
    event.preventDefault();
  });
}

/**
 * @function migrateImagesToStorage
 * @description Migrates legacy inline base64 card images into Supabase Storage refs.
 */

async function migrateImagesToStorage() {
  wireImageMigrationLogDialog();
  const dialog = el('imageMigrationLogDialog');
  const settingsDialog = el('settingsDialog');
  if (settingsDialog?.open) closeDialog(settingsDialog);
  if (dialog) showDialog(dialog);
  clearImageMigrationLogOutput();
  setImageMigrationStatusText('Loading cards...');
  setImageMigrationDialogRunningState(false);
  appendImageMigrationLogLine('Preparing migration run.');
  const runStartedAt = performance.now();
  let migrated = 0;
  let failed = 0;
  let migratedImages = 0;
  let replacedLegacyFieldPayloads = 0;
  let shouldRefreshUi = false;

  try {
    appendImageMigrationLogLine('Initializing Supabase client...');
    {
      const startedAt = performance.now();
      await initSupabaseBackend();
      appendImageMigrationLogLine(`Supabase client ready (${formatImageMigrationDurationMs(performance.now() - startedAt)}).`);
    }

    appendImageMigrationLogLine('Resolving authenticated user...');
    {
      const startedAt = performance.now();
      const ownerId = await getSupabaseOwnerId();
      const maskedOwnerId = ownerId.length > 8 ? `${ownerId.slice(0, 8)}...` : ownerId;
      appendImageMigrationLogLine(`Authenticated as uid=${maskedOwnerId} (${formatImageMigrationDurationMs(performance.now() - startedAt)}).`);
    }

    setImageMigrationStatusText('Loading card id refs from Supabase...');
    appendImageMigrationLogLine('Requesting card ids via /api/cards?fields=id ...');
    const idsLoadStartedAt = performance.now();
    let heartbeatCounter = 0;
    const idsLoadHeartbeat = window.setInterval(() => {
      heartbeatCounter += 1;
      appendImageMigrationLogLine(`Still loading card ids... (${heartbeatCounter * 5}s elapsed)`);
    }, 5000);
    const cardIds = await getAllCardIds({
      force: true,
      uiBlocking: false,
      loadingLabel: '',
      payloadLabel: 'image-migration-card-ids'
    }).finally(() => {
      window.clearInterval(idsLoadHeartbeat);
    });

    appendImageMigrationLogLine(
      `Loaded ${cardIds.length} card id(s) in ${formatImageMigrationDurationMs(performance.now() - idsLoadStartedAt)}.`
    );
    if (!cardIds.length) {
      setImageMigrationStatusText('No cards found.');
      appendImageMigrationLogLine('No cards found for this user. Nothing to migrate.');
      return;
    }

    const scanBatchSize = 8;
    const idChunks = chunkImageMigrationList(cardIds, scanBatchSize);
    const candidatesById = new Map();
    let scanFailures = 0;
    setImageMigrationStatusText(`Scanning cards... 0/${idChunks.length} batches`);
    appendImageMigrationLogLine(
      `Scanning ${cardIds.length} card(s) in ${idChunks.length} batch(es) to detect legacy base64 images (batch size ${scanBatchSize}).`
    );

    for (let batchIdx = 0; batchIdx < idChunks.length; batchIdx += 1) {
      const batchIds = idChunks[batchIdx];
      if (!batchIds.length) continue;
      setImageMigrationStatusText(`Scanning cards... ${batchIdx + 1}/${idChunks.length} batches`);
      appendImageMigrationLogLine(`[scan ${batchIdx + 1}/${idChunks.length}] Loading ${batchIds.length} card(s)...`);
      const batchStartedAt = performance.now();
      let batchCards = [];
      try {
        batchCards = await getCardImageRefsByCardIds(batchIds, {
          force: true,
          uiBlocking: false,
          loadingLabel: '',
          payloadLabel: `image-migration-scan-${batchIdx + 1}`
        });
        appendImageMigrationLogLine(
          `[scan ${batchIdx + 1}/${idChunks.length}] Loaded ${batchCards.length} card(s) in ${formatImageMigrationDurationMs(performance.now() - batchStartedAt)}.`
        );
      } catch (batchErr) {
        scanFailures += 1;
        const batchMessage = String(batchErr?.message || 'Unknown error');
        appendImageMigrationLogLine(
          `[scan ${batchIdx + 1}/${idChunks.length}] Batch load failed: ${batchMessage}. Falling back to per-card reads.`
        );
        batchCards = [];
        for (let itemIdx = 0; itemIdx < batchIds.length; itemIdx += 1) {
          const singleId = String(batchIds[itemIdx] || '').trim();
          if (!singleId) continue;
          try {
            const rows = await getCardImageRefsByCardIds([singleId], {
              force: true,
              uiBlocking: false,
              loadingLabel: '',
              payloadLabel: `image-migration-scan-fallback-${batchIdx + 1}`
            });
            const one = Array.isArray(rows) ? rows[0] : null;
            if (one && typeof one === 'object') batchCards.push(one);
          } catch (singleErr) {
            const singleMessage = String(singleErr?.message || 'Unknown error');
            appendImageMigrationLogLine(
              `[scan ${batchIdx + 1}/${idChunks.length}] Card ${singleId} load failed: ${singleMessage}`
            );
          }
        }
        appendImageMigrationLogLine(
          `[scan ${batchIdx + 1}/${idChunks.length}] Fallback loaded ${batchCards.length} card(s).`
        );
      }

      let foundInBatch = 0;
      batchCards.forEach(card => {
        const cardId = String(card?.id || '').trim();
        if (!cardId) return;
        if (!cardHasLegacyBase64Images(card)) return;
        candidatesById.set(cardId, card);
        foundInBatch += 1;
      });
      appendImageMigrationLogLine(
        `[scan ${batchIdx + 1}/${idChunks.length}] Found ${foundInBatch} legacy card(s) in this batch.`
      );
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const candidates = Array.from(candidatesById.values());
    if (scanFailures > 0) {
      appendImageMigrationLogLine(`Scan completed with ${scanFailures} batch fallback(s).`);
    }
    if (!candidates.length) {
      setImageMigrationStatusText('No migration needed.');
      appendImageMigrationLogLine('No legacy base64 images found. Nothing to migrate.');
      return;
    }

    const total = candidates.length;
    appendImageMigrationLogLine(`${total} card(s) need migration to bucket "${SUPABASE_PICTURES_BUCKET}".`);
    const proceed = confirm(
      `Migrate ${total} card(s) with base64 images to Supabase Storage bucket "${SUPABASE_PICTURES_BUCKET}"?\n\nThis may take a while depending on image count and size.`
    );
    if (!proceed) {
      setImageMigrationStatusText('Cancelled.');
      appendImageMigrationLogLine('Migration cancelled by user.');
      return;
    }

    setImageMigrationDialogRunningState(true);
    setImageMigrationStatusText(`Running... 0/${total}`);
    appendImageMigrationLogLine('Migration started.');

    for (let idx = 0; idx < total; idx += 1) {
      const card = candidates[idx];
      const cardId = String(card?.id || '').trim();
      if (!cardId) {
        failed += 1;
        appendImageMigrationLogLine(`[${idx + 1}/${total}] Skipped card without id.`);
        continue;
      }

      const previewStats = getCardLegacyBase64Stats(card);
      appendImageMigrationLogLine(
        `[${idx + 1}/${total}] Migrating card ${cardId} (detected ${previewStats.total} base64 payload(s) in scan).`
      );
      const cardStartedAt = performance.now();

      try {
        appendImageMigrationLogLine(`[${idx + 1}/${total}] Loading full card payload...`);
        const fullCardStartedAt = performance.now();
        const fullCard = await getById('cards', cardId, {
          force: true,
          uiBlocking: false,
          loadingLabel: ''
        });
        if (!fullCard || typeof fullCard !== 'object') {
          throw new Error('Card payload not found.');
        }
        appendImageMigrationLogLine(
          `[${idx + 1}/${total}] Full card payload loaded (${formatImageMigrationDurationMs(performance.now() - fullCardStartedAt)}).`
        );

        const fullStats = getCardLegacyBase64Stats(fullCard);
        const qImages = getCardImageList(fullCard, 'Q');
        const aImages = getCardImageList(fullCard, 'A');
        const uploadCandidates = qImages.filter(isImageDataUrl).length + aImages.filter(isImageDataUrl).length;
        const legacyFieldOnly = Math.max(0, fullStats.total - uploadCandidates);
        if (uploadCandidates > 0) {
          appendImageMigrationLogLine(
            `[${idx + 1}/${total}] Upload candidates: ${uploadCandidates} image(s).`
          );
        }
        if (legacyFieldOnly > 0) {
          appendImageMigrationLogLine(
            `[${idx + 1}/${total}] Legacy field payloads to replace with storage paths: ${legacyFieldOnly}.`
          );
        }

        const imagePayload = await buildCardImagePayloadForSave(
          cardId,
          qImages,
          aImages,
          {
            log: message => appendImageMigrationLogLine(`[${idx + 1}/${total}] ${message}`)
          }
        );
        appendImageMigrationLogLine(`[${idx + 1}/${total}] Writing updated card row...`);
        const cardsPutStartedAt = performance.now();
        const nextCard = {
          ...fullCard,
          ...imagePayload
        };
        await put('cards', nextCard, { uiBlocking: false });
        appendImageMigrationLogLine(
          `[${idx + 1}/${total}] /api/cards update done (${formatImageMigrationDurationMs(performance.now() - cardsPutStartedAt)}).`
        );

        appendImageMigrationLogLine(`[${idx + 1}/${total}] Writing card bank mirror row...`);
        const cardBankPutStartedAt = performance.now();
        await putCardBank(nextCard, { uiBlocking: false });
        appendImageMigrationLogLine(
          `[${idx + 1}/${total}] /api/cardbank update done (${formatImageMigrationDurationMs(performance.now() - cardBankPutStartedAt)}).`
        );

        migrated += 1;
        migratedImages += uploadCandidates;
        replacedLegacyFieldPayloads += legacyFieldOnly;
        shouldRefreshUi = true;
        appendImageMigrationLogLine(
          `[${idx + 1}/${total}] OK: ${cardId} (${formatImageMigrationDurationMs(performance.now() - cardStartedAt)}).`
        );
      } catch (err) {
        failed += 1;
        const message = String(err?.message || 'Unknown error');
        appendImageMigrationLogLine(`[${idx + 1}/${total}] FAILED: ${cardId} -> ${message}`);
        console.warn(`Image migration failed for card "${cardId}":`, err);
      }
      setImageMigrationStatusText(`Running... ${idx + 1}/${total}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    appendImageMigrationLogLine(
      `Finished in ${formatImageMigrationDurationMs(performance.now() - runStartedAt)}. Migrated cards: ${migrated}, failed cards: ${failed}, uploaded images: ${migratedImages}, replaced legacy payloads: ${replacedLegacyFieldPayloads}.`
    );
    setImageMigrationStatusText(`Finished: ${migrated} migrated, ${failed} failed.`);
  } catch (err) {
    const message = String(err?.message || 'Unknown error');
    appendImageMigrationLogLine(`Migration aborted: ${message}`);
    setImageMigrationStatusText('Failed. See log output.');
    console.error('Image migration aborted:', err);
  } finally {
    setImageMigrationDialogRunningState(false);
    if (shouldRefreshUi) {
      if (selectedSubject) void loadTopics();
      if (selectedTopic) void loadDeck();
      void refreshSidebar({ uiBlocking: false });
    }
  }
}

/**
 * @function setContentExchangeStatusText
 * @description Updates the content-exchange status line.
 */

function setContentExchangeStatusText(message = '') {
  const status = el('contentExchangeStatus');
  if (!status) return;
  status.textContent = String(message || '').trim() || 'Load user datasets and import selected content.';
}

/**
 * @function setContentExchangePolicyHint
 * @description Updates the policy hint line shown in the content-exchange dialog.
 */

function setContentExchangePolicyHint(message = '') {
  const hint = el('contentExchangePolicyHint');
  if (!hint) return;
  hint.textContent = String(message || '').trim();
}

/**
 * @function clearContentExchangeLogOutput
 * @description Clears content-exchange log lines.
 */

function clearContentExchangeLogOutput() {
  const output = el('contentExchangeLogOutput');
  if (!output) return;
  output.textContent = '';
}

/**
 * @function appendContentExchangeLogLine
 * @description Appends one line to the content-exchange log output.
 */

function appendContentExchangeLogLine(message = '') {
  const output = el('contentExchangeLogOutput');
  if (!output) return;
  const safeMessage = String(message || '').trim();
  if (!safeMessage) return;
  const prefix = `[${formatImageMigrationLogTimestamp()}] `;
  output.textContent += `${prefix}${safeMessage}\n`;
  output.scrollTop = output.scrollHeight;
}

/**
 * @function setContentExchangeBusyState
 * @description Locks/unlocks content-exchange controls while loading/importing.
 */

function setContentExchangeBusyState() {
  const busy = contentExchangeLoading || contentExchangeImporting;
  const dialog = el('contentExchangeDialog');
  const closeBtn = el('closeContentExchangeBtn');
  const reloadBtn = el('reloadContentExchangeBtn');
  if (dialog) dialog.dataset.busy = busy ? '1' : '0';
  if (closeBtn) closeBtn.disabled = busy;
  if (reloadBtn) reloadBtn.disabled = busy;
  if (dialog) {
    dialog.querySelectorAll('.exchange-import-btn').forEach(btn => { btn.disabled = busy; });
    dialog.querySelectorAll('.exchange-select-all-btn, .exchange-clear-selection-btn, .exchange-import-selected-btn, .content-exchange-card-check')
      .forEach(node => { node.disabled = busy; });
  }
  if (!busy) refreshAllContentExchangeTopicSelectionUi();
}

/**
 * @function closeContentExchangeDialog
 * @description Closes the content-exchange dialog when no task is running.
 */

function closeContentExchangeDialog() {
  const dialog = el('contentExchangeDialog');
  if (!dialog) return;
  if (dialog.dataset.busy === '1') return;
  closeDialog(dialog);
}

/**
 * @function getContentExchangeRowOwnerId
 * @description Resolves the owner uid from a row using the active tenant-column name.
 */

function getContentExchangeRowOwnerId(row = null) {
  const tenantKey = String(supabaseTenantColumn || 'uid').trim() || 'uid';
  const direct = String(row?.[tenantKey] || '').trim();
  if (direct) return direct;
  const fallbackUid = String(row?.uid || '').trim();
  if (fallbackUid) return fallbackUid;
  return String(row?.UID || '').trim();
}

/**
 * @function normalizeContentExchangeDisplayName
 * @description Normalizes one profile display name read from shared settings rows.
 */

function normalizeContentExchangeDisplayName(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * @function buildContentExchangeCardPreview
 * @description Builds a compact one-line card preview label from lightweight card fields.
 */

function buildContentExchangeCardPreview(card = null) {
  const prompt = String(card?.prompt || '').trim();
  const question = String(card?.question || '').trim();
  const answer = String(card?.answer || '').trim();
  const base = prompt || question || answer || '[No text]';
  if (base.length <= CONTENT_EXCHANGE_CARD_PREVIEW_MAX_LEN) return base;
  return `${base.slice(0, CONTENT_EXCHANGE_CARD_PREVIEW_MAX_LEN - 1)}…`;
}

/**
 * @function normalizeContentExchangeCardOptions
 * @description Normalizes card options loaded from shared card payload rows.
 */

function normalizeContentExchangeCardOptions(rawOptions = null) {
  if (Array.isArray(rawOptions)) return rawOptions;
  if (!rawOptions || typeof rawOptions !== 'string') return [];
  try {
    const parsed = JSON.parse(rawOptions);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * @function getContentExchangeCardCreatedAt
 * @description Returns sortable created-at timestamps for exchange cards.
 */

function getContentExchangeCardCreatedAt(card = null) {
  if (typeof getCardCreatedAt === 'function') return getCardCreatedAt(card);
  const raw = card?.meta?.createdAt ?? card?.createdAt ?? 0;
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * @function buildContentExchangeCardTile
 * @description Builds one exchange card tile using the same Q/A layout as normal topic cards.
 */

function buildContentExchangeCardTile(card = null, ownerId = '', topicId = '', selected = false) {
  const safeOwnerId = String(ownerId || '').trim();
  const safeTopicId = String(topicId || '').trim();
  const safeCard = (card && typeof card === 'object') ? card : {};
  const safeCardId = String(safeCard?.id || '').trim();

  const tile = document.createElement('article');
  tile.className = 'card-tile card-tile-overview content-exchange-card-tile selection-mode';
  tile.dataset.ownerId = safeOwnerId;
  tile.dataset.topicId = safeTopicId;
  tile.dataset.cardId = safeCardId;
  tile.classList.toggle('selected-for-bulk', !!selected);

  const selectWrap = document.createElement('label');
  selectWrap.className = 'card-select-control';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'content-exchange-card-check';
  checkbox.dataset.ownerId = safeOwnerId;
  checkbox.dataset.topicId = safeTopicId;
  checkbox.dataset.cardId = safeCardId;
  checkbox.setAttribute('aria-label', 'Select card for import');
  checkbox.checked = !!selected;
  selectWrap.appendChild(checkbox);
  tile.appendChild(selectWrap);

  checkbox.addEventListener('click', event => event.stopPropagation());
  tile.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.card-select-control')) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const qTitle = document.createElement('div');
  qTitle.className = 'card-tile-title';
  qTitle.textContent = 'Q';

  const qBody = document.createElement('div');
  qBody.className = 'card-tile-body';
  renderRich(qBody, safeCard.prompt || safeCard.question || '', {
    textAlign: safeCard.questionTextAlign || safeCard.textAlign || 'center'
  });
  appendCardImages(qBody, getCardImageList(safeCard, 'Q'), 'card-thumb', 'Question image');

  const separator = document.createElement('div');
  separator.className = 'card-tile-separator';

  const aTitle = document.createElement('div');
  aTitle.className = 'card-tile-title';
  aTitle.textContent = 'A';

  const aBody = document.createElement('div');
  aBody.className = 'card-tile-body';
  if (typeof renderCardTileAnswerContent === 'function') {
    renderCardTileAnswerContent(aBody, safeCard, { compact: false });
  } else {
    renderRich(aBody, safeCard.answer || '', {
      textAlign: safeCard.answerTextAlign || safeCard.textAlign || 'center'
    });
  }
  appendCardImages(aBody, getCardImageList(safeCard, 'A'), 'card-thumb', 'Answer image');

  tile.append(qTitle, qBody, separator, aTitle, aBody);
  return tile;
}

/**
 * @function hydrateContentExchangeCardTiles
 * @description Renders full card-tile previews into each topic card container after tree HTML injection.
 */

function hydrateContentExchangeCardTiles(root = null) {
  const scope = root instanceof Element ? root : el('contentExchangeTree');
  if (!scope) return;
  scope.querySelectorAll('.content-exchange-card-list').forEach(list => {
    const ownerId = String(list?.dataset?.ownerId || '').trim();
    const topicId = String(list?.dataset?.topicId || '').trim();
    if (!ownerId || !topicId) return;
    const cards = getContentExchangeTopicCards(ownerId, topicId);
    const cardIds = cards
      .map(card => String(card?.id || '').trim())
      .filter(Boolean);
    const selectedSet = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
    list.innerHTML = '';
    if (!cards.length) {
      list.innerHTML = '<div class="tiny">No cards in this topic.</div>';
      return;
    }
    cards.forEach(card => {
      const cardId = String(card?.id || '').trim();
      if (!cardId) return;
      list.appendChild(buildContentExchangeCardTile(card, ownerId, topicId, selectedSet.has(cardId)));
    });
  });
}

/**
 * @function getContentExchangeTopicSelectionKey
 * @description Returns a stable selection-state key for one source-user topic.
 */

function getContentExchangeTopicSelectionKey(ownerId = '', topicId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  const safeTopicId = String(topicId || '').trim();
  if (!safeOwnerId || !safeTopicId) return '';
  return `${safeOwnerId}::${safeTopicId}`;
}

/**
 * @function getContentExchangeTopicCards
 * @description Returns cards for a source-user topic from the latest exchange snapshot.
 */

function getContentExchangeTopicCards(ownerId = '', topicId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  const safeTopicId = String(topicId || '').trim();
  const user = contentExchangeSnapshot?.usersById?.get(safeOwnerId);
  if (!user || !safeTopicId) return [];
  const rows = user.cardsByTopicId.get(safeTopicId);
  return Array.isArray(rows) ? rows : [];
}

/**
 * @function getContentExchangeTopicCardIds
 * @description Returns normalized card ids for a source-user topic.
 */

function getContentExchangeTopicCardIds(ownerId = '', topicId = '') {
  return getContentExchangeTopicCards(ownerId, topicId)
    .map(card => String(card?.id || '').trim())
    .filter(Boolean);
}

/**
 * @function getContentExchangeTopicSelectionSet
 * @description Returns and prunes the selected-card set for one topic.
 */

function getContentExchangeTopicSelectionSet(ownerId = '', topicId = '', cardIds = []) {
  const key = getContentExchangeTopicSelectionKey(ownerId, topicId);
  if (!key) return new Set();
  if (!contentExchangeSelectedCardIdsByTopicKey.has(key)) {
    contentExchangeSelectedCardIdsByTopicKey.set(key, new Set());
  }
  const selected = contentExchangeSelectedCardIdsByTopicKey.get(key);
  const validIds = new Set((Array.isArray(cardIds) ? cardIds : [])
    .map(value => String(value || '').trim())
    .filter(Boolean));
  Array.from(selected).forEach(id => {
    if (!validIds.has(id)) selected.delete(id);
  });
  return selected;
}

/**
 * @function pruneContentExchangeSelectionState
 * @description Drops stale selection entries after a snapshot reload.
 */

function pruneContentExchangeSelectionState() {
  const snapshot = contentExchangeSnapshot;
  if (!snapshot?.usersById) {
    contentExchangeSelectedCardIdsByTopicKey = new Map();
    return;
  }
  const validTopicCardIdsByKey = new Map();
  snapshot.users.forEach(user => {
    if (user?.isCurrentUser) return;
    user.cardsByTopicId.forEach((cards, topicId) => {
      const key = getContentExchangeTopicSelectionKey(user.uid, topicId);
      if (!key) return;
      const validIds = new Set((Array.isArray(cards) ? cards : [])
        .map(card => String(card?.id || '').trim())
        .filter(Boolean));
      validTopicCardIdsByKey.set(key, validIds);
    });
  });
  Array.from(contentExchangeSelectedCardIdsByTopicKey.entries()).forEach(([key, selected]) => {
    const validIds = validTopicCardIdsByKey.get(key);
    if (!validIds) {
      contentExchangeSelectedCardIdsByTopicKey.delete(key);
      return;
    }
    Array.from(selected).forEach(id => {
      if (!validIds.has(id)) selected.delete(id);
    });
  });
}

/**
 * @function forEachContentExchangeTopicControl
 * @description Applies a callback to all topic controls matching owner/topic ids.
 */

function forEachContentExchangeTopicControl(className = '', ownerId = '', topicId = '', callback = null) {
  const safeClassName = String(className || '').trim();
  const safeOwnerId = String(ownerId || '').trim();
  const safeTopicId = String(topicId || '').trim();
  if (!safeClassName || !safeOwnerId || !safeTopicId || typeof callback !== 'function') return;
  document.querySelectorAll(`.${safeClassName}`).forEach(node => {
    if (String(node?.dataset?.ownerId || '').trim() !== safeOwnerId) return;
    if (String(node?.dataset?.topicId || '').trim() !== safeTopicId) return;
    callback(node);
  });
}

/**
 * @function refreshContentExchangeTopicSelectionUi
 * @description Refreshes one topic selection counter/buttons/checkboxes from current selection state.
 */

function refreshContentExchangeTopicSelectionUi(ownerId = '', topicId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  const safeTopicId = String(topicId || '').trim();
  if (!safeOwnerId || !safeTopicId) return;
  const cardIds = getContentExchangeTopicCardIds(safeOwnerId, safeTopicId);
  const selectedSet = getContentExchangeTopicSelectionSet(safeOwnerId, safeTopicId, cardIds);
  const selectedCount = cardIds.reduce((sum, id) => sum + (selectedSet.has(id) ? 1 : 0), 0);
  const totalCount = cardIds.length;
  const busy = contentExchangeLoading || contentExchangeImporting;

  forEachContentExchangeTopicControl('content-exchange-topic-selection-meta', safeOwnerId, safeTopicId, node => {
    node.textContent = `${selectedCount} / ${totalCount} selected`;
  });
  forEachContentExchangeTopicControl('exchange-select-all-btn', safeOwnerId, safeTopicId, node => {
    node.disabled = busy || totalCount <= 0 || selectedCount >= totalCount;
  });
  forEachContentExchangeTopicControl('exchange-clear-selection-btn', safeOwnerId, safeTopicId, node => {
    node.disabled = busy || selectedCount <= 0;
  });
  forEachContentExchangeTopicControl('exchange-import-selected-btn', safeOwnerId, safeTopicId, node => {
    node.disabled = busy || selectedCount <= 0;
  });
  forEachContentExchangeTopicControl('content-exchange-card-check', safeOwnerId, safeTopicId, node => {
    const cardId = String(node?.dataset?.cardId || '').trim();
    node.checked = selectedSet.has(cardId);
    node.disabled = busy;
  });
  forEachContentExchangeTopicControl('content-exchange-card-tile', safeOwnerId, safeTopicId, node => {
    const cardId = String(node?.dataset?.cardId || '').trim();
    node.classList.toggle('selected-for-bulk', selectedSet.has(cardId));
  });
}

/**
 * @function refreshAllContentExchangeTopicSelectionUi
 * @description Refreshes all visible topic selection controls.
 */

function refreshAllContentExchangeTopicSelectionUi() {
  const snapshot = contentExchangeSnapshot;
  if (!snapshot?.users) return;
  snapshot.users.forEach(user => {
    if (user?.isCurrentUser) return;
    user.topics.forEach(topic => {
      const topicId = String(topic?.id || '').trim();
      if (!topicId) return;
      refreshContentExchangeTopicSelectionUi(user.uid, topicId);
    });
  });
}

/**
 * @function fetchContentExchangeRows
 * @description Fetches lightweight rows from `records` without tenant scoping (depends on RLS policy).
 */

async function fetchContentExchangeRows(store = '', selectTail = '') {
  const safeStore = String(store || '').trim();
  const tenantColumn = String(supabaseTenantColumn || 'uid').trim() || 'uid';
  if (!safeStore) return [];
  const tail = String(selectTail || '').trim();
  const selectClause = tail
    ? `${tenantColumn},record_key,updated_at,${tail}`
    : `${tenantColumn},record_key,updated_at`;
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select(selectClause)
    .eq('store', safeStore)
    .order(tenantColumn, { ascending: true })
    .order('updated_at', { ascending: true });
  assertSupabaseSuccess(error, `Failed to load ${safeStore} rows for content exchange.`);
  return Array.isArray(data) ? data : [];
}

/**
 * @function fetchContentExchangeProfileRows
 * @description Fetches optional per-user profile rows used to display names next to user ids.
 */

async function fetchContentExchangeProfileRows() {
  const tenantColumn = String(supabaseTenantColumn || 'uid').trim() || 'uid';
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select(`${tenantColumn},record_key,displayName:payload->>displayName,name:payload->>name,fullName:payload->>fullName,updated_at`)
    .eq('store', 'settings')
    .eq('record_key', CONTENT_EXCHANGE_PROFILE_SETTINGS_ID)
    .order(tenantColumn, { ascending: true })
    .order('updated_at', { ascending: false });
  assertSupabaseSuccess(error, 'Failed to load profile rows for content exchange.');
  return Array.isArray(data) ? data : [];
}

/**
 * @function buildContentExchangeSnapshot
 * @description Builds a normalized user->subject->topic->card snapshot for rendering and imports.
 */

function buildContentExchangeSnapshot(ownerId = '', subjectRows = [], topicRows = [], cardRows = [], profileRows = []) {
  const safeOwnerId = String(ownerId || '').trim();
  const profileNameByUid = new Map();
  (Array.isArray(profileRows) ? profileRows : []).forEach(row => {
    const uidValue = getContentExchangeRowOwnerId(row);
    if (!uidValue || profileNameByUid.has(uidValue)) return;
    const label = normalizeContentExchangeDisplayName(
      row?.displayName || row?.fullName || row?.name || ''
    );
    if (!label) return;
    profileNameByUid.set(uidValue, label);
  });

  const usersById = new Map();
  const ensureUser = uidValue => {
    const safeUid = String(uidValue || '').trim();
    if (!safeUid) return null;
    if (usersById.has(safeUid)) return usersById.get(safeUid);
    const next = {
      uid: safeUid,
      displayName: profileNameByUid.get(safeUid) || '',
      isCurrentUser: safeUid === safeOwnerId,
      subjects: [],
      topics: [],
      cards: [],
      subjectById: new Map(),
      topicById: new Map(),
      cardById: new Map(),
      topicsBySubjectId: new Map(),
      cardsByTopicId: new Map()
    };
    usersById.set(safeUid, next);
    return next;
  };

  (Array.isArray(subjectRows) ? subjectRows : []).forEach(row => {
    const uidValue = getContentExchangeRowOwnerId(row);
    const user = ensureUser(uidValue);
    if (!user) return;
    const id = String(row?.record_key || '').trim();
    if (!id || user.subjectById.has(id)) return;
    const subject = {
      id,
      name: String(row?.name || '').trim() || 'Untitled subject',
      accent: String(row?.accent || '').trim() || '#2dd4bf'
    };
    user.subjects.push(subject);
    user.subjectById.set(id, subject);
  });

  (Array.isArray(topicRows) ? topicRows : []).forEach(row => {
    const uidValue = getContentExchangeRowOwnerId(row);
    const user = ensureUser(uidValue);
    if (!user) return;
    const id = String(row?.record_key || '').trim();
    if (!id || user.topicById.has(id)) return;
    const topic = {
      id,
      subjectId: String(row?.subjectId || '').trim(),
      name: String(row?.name || '').trim() || 'Untitled topic'
    };
    user.topics.push(topic);
    user.topicById.set(id, topic);
    if (!user.topicsBySubjectId.has(topic.subjectId)) user.topicsBySubjectId.set(topic.subjectId, []);
    user.topicsBySubjectId.get(topic.subjectId).push(topic);
  });

  (Array.isArray(cardRows) ? cardRows : []).forEach(row => {
    const uidValue = getContentExchangeRowOwnerId(row);
    const user = ensureUser(uidValue);
    if (!user) return;
    const id = String(row?.record_key || '').trim();
    if (!id || user.cardById.has(id)) return;
    const topicId = String(row?.topicId || '').trim();
    const options = normalizeContentExchangeCardOptions(row?.options);
    const normalizedMeta = (row?.meta && typeof row.meta === 'object') ? row.meta : {};
    const prompt = String(row?.prompt || row?.question || '').trim();
    const card = {
      id,
      topicId,
      type: String(row?.type || '').trim() || 'qa',
      prompt,
      question: String(row?.question || '').trim(),
      answer: String(row?.answer || '').trim(),
      options,
      textAlign: String(row?.textAlign || '').trim() || 'center',
      questionTextAlign: String(row?.questionTextAlign || row?.textAlign || '').trim() || 'center',
      answerTextAlign: String(row?.answerTextAlign || row?.textAlign || '').trim() || 'center',
      optionsTextAlign: String(row?.optionsTextAlign || row?.answerTextAlign || row?.textAlign || '').trim() || 'center',
      imagesQ: normalizeImageList(row?.imagesQ, row?.imageDataQ || row?.imageData || ''),
      imagesA: normalizeImageList(row?.imagesA, row?.imageDataA || ''),
      imageDataQ: String(row?.imageDataQ || row?.imageData || '').trim(),
      imageDataA: String(row?.imageDataA || '').trim(),
      imageData: String(row?.imageData || '').trim(),
      createdAt: row?.createdAt || normalizedMeta?.createdAt || '',
      meta: normalizedMeta
    };
    card.preview = buildContentExchangeCardPreview(card);
    user.cards.push(card);
    user.cardById.set(id, card);
    if (!user.cardsByTopicId.has(topicId)) user.cardsByTopicId.set(topicId, []);
    user.cardsByTopicId.get(topicId).push(card);
  });

  usersById.forEach(user => {
    user.subjects.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    user.topics.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    user.cards.sort((a, b) => {
      const timeDiff = getContentExchangeCardCreatedAt(b) - getContentExchangeCardCreatedAt(a);
      if (timeDiff !== 0) return timeDiff;
      return String(a.preview || '').localeCompare(String(b.preview || ''));
    });
    user.topicsBySubjectId.forEach(topicList => {
      topicList.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    });
    user.cardsByTopicId.forEach(cardList => {
      cardList.sort((a, b) => {
        const timeDiff = getContentExchangeCardCreatedAt(b) - getContentExchangeCardCreatedAt(a);
        if (timeDiff !== 0) return timeDiff;
        return String(a.preview || '').localeCompare(String(b.preview || ''));
      });
    });
    if (!user.displayName) user.displayName = 'Unnamed user';
  });

  const users = Array.from(usersById.values()).sort((a, b) => {
    if (a.isCurrentUser && !b.isCurrentUser) return -1;
    if (!a.isCurrentUser && b.isCurrentUser) return 1;
    const nameCmp = String(a.displayName || '').localeCompare(String(b.displayName || ''));
    if (nameCmp !== 0) return nameCmp;
    return String(a.uid || '').localeCompare(String(b.uid || ''));
  });

  return {
    ownerId: safeOwnerId,
    users,
    usersById,
    totals: {
      subjects: users.reduce((sum, user) => sum + user.subjects.length, 0),
      topics: users.reduce((sum, user) => sum + user.topics.length, 0),
      cards: users.reduce((sum, user) => sum + user.cards.length, 0)
    }
  };
}

/**
 * @function renderContentExchangeTree
 * @description Renders the cross-user subject/topic/card hierarchy.
 */

function renderContentExchangeTree() {
  const wrap = el('contentExchangeTree');
  if (!wrap) return;
  const snapshot = contentExchangeSnapshot;
  if (!snapshot || !Array.isArray(snapshot.users) || !snapshot.users.length) {
    wrap.innerHTML = '<div class="tiny">No user data available.</div>';
    return;
  }

  const sourceUsers = snapshot.users.filter(user => !user.isCurrentUser);
  if (!sourceUsers.length) {
    wrap.innerHTML = '<div class="tiny">No other user content available.</div>';
    return;
  }

  const html = sourceUsers.map(user => {
    const subjectHtml = user.subjects.length
      ? user.subjects.map(subject => {
        const topics = user.topicsBySubjectId.get(subject.id) || [];
        const subjectCardCount = topics.reduce((sum, topic) => {
          const cards = user.cardsByTopicId.get(topic.id) || [];
          return sum + cards.length;
        }, 0);
        const accent = normalizeHexColor(subject?.accent || '#2dd4bf');
        const subjectStyle = [
          `--subject-accent:${accent}`,
          `--subject-accent-bg:${hexToRgba(accent, 0.18)}`,
          `--subject-accent-glow:${hexToRgba(accent, 0.34)}`
        ].join(';');

        const topicHtml = topics.length
          ? topics.map(topic => {
            const cards = user.cardsByTopicId.get(topic.id) || [];
            const topicId = String(topic?.id || '').trim();
            const ownerId = String(user.uid || '').trim();
            const cardIds = cards
              .map(card => String(card?.id || '').trim())
              .filter(Boolean);
            const selectedSet = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
            const selectedCount = cardIds.reduce((sum, id) => sum + (selectedSet.has(id) ? 1 : 0), 0);
            const ownerEsc = escapeHTML(ownerId);
            const topicEsc = escapeHTML(topicId);

            const cardHtml = cards.length
              ? `<div class="content-exchange-card-list card-grid"
                  data-owner-id="${ownerEsc}"
                  data-topic-id="${topicEsc}"></div>`
              : '<div class="tiny content-exchange-card-list-empty">No cards in this topic.</div>';

            return `
              <details class="content-exchange-topic">
                <summary>
                  <div class="content-exchange-summary-main">
                    <div class="content-exchange-summary-title">${escapeHTML(topic.name || 'Untitled topic')}</div>
                    <div class="tiny">${cards.length} ${cards.length === 1 ? 'card' : 'cards'}</div>
                  </div>
                  <button class="btn btn-small exchange-import-btn"
                    data-level="topic"
                    data-owner-id="${ownerEsc}"
                    data-id="${topicEsc}"
                    type="button">Import Topic</button>
                </summary>
                <div class="content-exchange-topic-toolbar">
                  <div class="tiny content-exchange-topic-selection-meta"
                    data-owner-id="${ownerEsc}"
                    data-topic-id="${topicEsc}">${selectedCount} / ${cards.length} selected</div>
                  <div class="content-exchange-topic-selection-actions">
                    <button class="btn btn-small exchange-select-all-btn"
                      data-owner-id="${ownerEsc}"
                      data-topic-id="${topicEsc}"
                      type="button">Select all</button>
                    <button class="btn btn-small exchange-clear-selection-btn"
                      data-owner-id="${ownerEsc}"
                      data-topic-id="${topicEsc}"
                      type="button">Clear</button>
                    <button class="btn btn-small exchange-import-selected-btn"
                      data-owner-id="${ownerEsc}"
                      data-topic-id="${topicEsc}"
                      type="button">Import selected</button>
                  </div>
                </div>
                ${cardHtml}
              </details>
            `;
          }).join('')
          : '<div class="tiny">No topics in this subject.</div>';

        return `
          <details class="content-exchange-subject" style="${subjectStyle}">
            <summary>
              <div class="content-exchange-summary-main">
                <div class="content-exchange-summary-title">${escapeHTML(subject.name || 'Untitled subject')}</div>
                <div class="tiny">${topics.length} ${topics.length === 1 ? 'topic' : 'topics'} • ${subjectCardCount} ${subjectCardCount === 1 ? 'card' : 'cards'}</div>
              </div>
              <button class="btn btn-small exchange-import-btn"
                data-level="subject"
                data-owner-id="${escapeHTML(user.uid)}"
                data-id="${escapeHTML(subject.id)}"
                type="button">Import Subject</button>
            </summary>
            <div class="content-exchange-topic-list">${topicHtml}</div>
          </details>
        `;
      }).join('')
      : '<div class="tiny">This user has no subjects.</div>';

    return `
      <div class="content-exchange-user">
        <div class="content-exchange-user-header">
          <div>
            <div class="content-exchange-user-name">${escapeHTML(user.displayName || 'Unnamed user')}</div>
            <div class="tiny">${user.subjects.length} ${user.subjects.length === 1 ? 'subject' : 'subjects'} • ${user.topics.length} ${user.topics.length === 1 ? 'topic' : 'topics'} • ${user.cards.length} ${user.cards.length === 1 ? 'card' : 'cards'}</div>
          </div>
        </div>
        ${subjectHtml}
      </div>
    `;
  }).join('');

  wrap.innerHTML = html;
  hydrateContentExchangeCardTiles(wrap);
  refreshAllContentExchangeTopicSelectionUi();
}

/**
 * @function reloadContentExchangeTree
 * @description Loads global user structures and re-renders the exchange tree.
 */

async function reloadContentExchangeTree(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const preserveLog = !!opts.preserveLog;
  const loadToken = ++contentExchangeLastLoadToken;
  contentExchangeLoading = true;
  setContentExchangeBusyState();
  setContentExchangeStatusText('Loading user structures...');
  setContentExchangePolicyHint('');
  if (!preserveLog) clearContentExchangeLogOutput();
  appendContentExchangeLogLine('Loading content-exchange dataset...');
  const startedAt = performance.now();

  try {
    await initSupabaseBackend();
    await resolveSupabaseTenantColumn();
    const ownerId = await getSupabaseOwnerId();
    appendContentExchangeLogLine(`Authenticated as uid=${ownerId.slice(0, 8)}...`);

    const [subjectRows, topicRows, cardRows, profileRows] = await Promise.all([
      fetchContentExchangeRows('subjects', 'name:payload->>name,accent:payload->>accent'),
      fetchContentExchangeRows('topics', 'name:payload->>name,subjectId:payload->>subjectId'),
      fetchContentExchangeRows(
        'cards',
        'topicId:payload->>topicId,prompt:payload->>prompt,question:payload->>question,answer:payload->>answer,type:payload->>type,options:payload->options,textAlign:payload->>textAlign,questionTextAlign:payload->>questionTextAlign,answerTextAlign:payload->>answerTextAlign,optionsTextAlign:payload->>optionsTextAlign,imagesQ:payload->imagesQ,imagesA:payload->imagesA,imageDataQ:payload->>imageDataQ,imageDataA:payload->>imageDataA,imageData:payload->>imageData,createdAt:payload->>createdAt,meta:payload->meta'
      ),
      fetchContentExchangeProfileRows()
    ]);

    if (loadToken !== contentExchangeLastLoadToken) return;

    contentExchangeSnapshot = buildContentExchangeSnapshot(
      ownerId,
      subjectRows,
      topicRows,
      cardRows,
      profileRows
    );
    pruneContentExchangeSelectionState();
    renderContentExchangeTree();

    const snapshot = contentExchangeSnapshot;
    const otherUsersList = (snapshot?.users || []).filter(user => !user.isCurrentUser);
    const userCount = otherUsersList.length;
    const totals = {
      subjects: otherUsersList.reduce((sum, user) => sum + user.subjects.length, 0),
      topics: otherUsersList.reduce((sum, user) => sum + user.topics.length, 0),
      cards: otherUsersList.reduce((sum, user) => sum + user.cards.length, 0)
    };
    setContentExchangeStatusText(
      `Loaded ${userCount} external user(s): ${totals.subjects} subjects, ${totals.topics} topics, ${totals.cards} cards.`
    );
    if (userCount === 0) {
      setContentExchangePolicyHint(
        'No external content is visible. Either no other user has data yet, or cross-user SELECT is still blocked (scripts/supabase_content_exchange_select_all.sql).'
      );
    } else {
      setContentExchangePolicyHint(
        'Import works by copying selected rows into your account (same ids, your uid).'
      );
    }
    appendContentExchangeLogLine(
      `Dataset ready in ${formatImageMigrationDurationMs(performance.now() - startedAt)}. External users: ${userCount}.`
    );
  } catch (err) {
    const message = String(err?.message || 'Unknown error');
    setContentExchangeStatusText('Failed to load content exchange data.');
    setContentExchangePolicyHint(
      'If your RLS still enforces uid=auth.uid() for SELECT, cross-user listing is blocked (see scripts/supabase_content_exchange_select_all.sql).'
    );
    appendContentExchangeLogLine(`Load failed: ${message}`);
    console.error('Content exchange load failed:', err);
  } finally {
    if (loadToken === contentExchangeLastLoadToken) {
      contentExchangeLoading = false;
      setContentExchangeBusyState();
    }
  }
}

/**
 * @function stampImportedRecordMeta
 * @description Stamps imported records with updated metadata while preserving original createdAt values.
 */

function stampImportedRecordMeta(record = null, sourceUid = '', nowIso = new Date().toISOString()) {
  const safe = (record && typeof record === 'object') ? record : {};
  const createdAt = safe?.meta?.createdAt || safe?.createdAt || nowIso;
  return {
    ...safe,
    createdAt,
    updatedAt: nowIso,
    meta: {
      ...(safe.meta || {}),
      createdAt,
      updatedAt: nowIso,
      importedFromUid: String(sourceUid || '').trim(),
      importedAt: nowIso
    }
  };
}

/**
 * @function buildContentExchangeImportSelection
 * @description Expands one import action (card/topic/subject) into dependent record ids.
 */

function buildContentExchangeImportSelection(sourceUser, level = '', entityId = '', options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const safeLevel = String(level || '').trim().toLowerCase();
  const safeEntityId = String(entityId || '').trim();
  const subjectIds = new Set();
  const topicIds = new Set();
  const cardIds = new Set();
  if (!sourceUser || !safeEntityId) {
    return { subjectIds: [], topicIds: [], cardIds: [] };
  }

  if (safeLevel === 'subject') {
    subjectIds.add(safeEntityId);
    sourceUser.topics.forEach(topic => {
      if (String(topic?.subjectId || '').trim() !== safeEntityId) return;
      topicIds.add(String(topic?.id || '').trim());
    });
    sourceUser.cards.forEach(card => {
      if (!topicIds.has(String(card?.topicId || '').trim())) return;
      cardIds.add(String(card?.id || '').trim());
    });
  } else if (safeLevel === 'topic') {
    const topic = sourceUser.topicById.get(safeEntityId);
    if (!topic) return { subjectIds: [], topicIds: [], cardIds: [] };
    topicIds.add(safeEntityId);
    if (topic.subjectId) subjectIds.add(String(topic.subjectId || '').trim());
    const selectedCardIds = Array.isArray(opts.selectedCardIds)
      ? opts.selectedCardIds.map(value => String(value || '').trim()).filter(Boolean)
      : [];
    const selectedCardSet = new Set(selectedCardIds);
    sourceUser.cards.forEach(card => {
      const cardTopicId = String(card?.topicId || '').trim();
      if (cardTopicId !== safeEntityId) return;
      const cardId = String(card?.id || '').trim();
      if (!cardId) return;
      if (selectedCardSet.size > 0 && !selectedCardSet.has(cardId)) return;
      cardIds.add(cardId);
    });
  } else if (safeLevel === 'card') {
    const card = sourceUser.cardById.get(safeEntityId);
    if (!card) return { subjectIds: [], topicIds: [], cardIds: [] };
    cardIds.add(safeEntityId);
    const topicId = String(card.topicId || '').trim();
    if (topicId) {
      topicIds.add(topicId);
      const topic = sourceUser.topicById.get(topicId);
      if (topic?.subjectId) subjectIds.add(String(topic.subjectId || '').trim());
    }
  }

  return {
    subjectIds: Array.from(subjectIds).filter(Boolean),
    topicIds: Array.from(topicIds).filter(Boolean),
    cardIds: Array.from(cardIds).filter(Boolean)
  };
}

/**
 * @function fetchContentExchangePayloadRowsByKey
 * @description Loads full payload rows for one store and source uid in batches.
 */

async function fetchContentExchangePayloadRowsByKey(store = '', sourceUid = '', keys = [], options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const log = typeof opts.log === 'function' ? opts.log : null;
  const safeStore = String(store || '').trim();
  const safeSourceUid = String(sourceUid || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !safeSourceUid || !keyField) return [];
  const uniqueKeys = Array.from(new Set((Array.isArray(keys) ? keys : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)));
  if (!uniqueKeys.length) return [];

  const tenantColumn = String(supabaseTenantColumn || 'uid').trim() || 'uid';
  const chunks = chunkImageMigrationList(uniqueKeys, CONTENT_EXCHANGE_FETCH_BATCH_SIZE);
  const byKey = new Map();

  for (let idx = 0; idx < chunks.length; idx += 1) {
    const chunk = chunks[idx];
    if (!chunk.length) continue;
    if (log) {
      log(`Loading ${safeStore} payload batch ${idx + 1}/${chunks.length} (${chunk.length} row(s))...`);
    }
    let query = supabaseClient
      .from(SUPABASE_TABLE)
      .select('record_key,payload')
      .eq('store', safeStore)
      .eq(tenantColumn, safeSourceUid);
    if (chunk.length === 1) query = query.eq('record_key', chunk[0]);
    else query = query.in('record_key', chunk);
    const { data, error } = await query;
    assertSupabaseSuccess(error, `Failed to load ${safeStore} payload rows.`);
    const rows = Array.isArray(data) ? data : [];
    rows.forEach(row => {
      const payload = normalizeStorePayloadRow(row, keyField);
      const recordKey = String(payload?.[keyField] || '').trim();
      if (!recordKey) return;
      byKey.set(recordKey, payload);
    });
  }

  return uniqueKeys
    .map(recordKey => byKey.get(recordKey))
    .filter(Boolean);
}

/**
 * @function countExternalStorageRefsForImportedCard
 * @description Counts storage refs that still point to a foreign user folder after import.
 */

function countExternalStorageRefsForImportedCard(card = null, sourceUid = '') {
  const safeSourceUid = String(sourceUid || '').trim();
  if (!safeSourceUid) return 0;
  const refs = [
    ...getCardImageList(card, 'Q'),
    ...getCardImageList(card, 'A')
  ];
  let count = 0;
  refs.forEach(src => {
    const parsed = parseSupabaseStorageRef(src);
    if (!parsed?.path) return;
    const ownerSegment = String(parsed.path.split('/')[0] || '').trim();
    if (ownerSegment === safeSourceUid) count += 1;
  });
  return count;
}

/**
 * @function importContentExchangeSelection
 * @description Imports a selected card/topic/subject from another user into the current account.
 */

async function importContentExchangeSelection(level = '', sourceUid = '', entityId = '', options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const safeLevel = String(level || '').trim().toLowerCase();
  const safeSourceUid = String(sourceUid || '').trim();
  const safeEntityId = String(entityId || '').trim();
  if (!safeLevel || !safeSourceUid || !safeEntityId) return;
  if (contentExchangeLoading || contentExchangeImporting) return;
  const snapshot = contentExchangeSnapshot;
  if (!snapshot?.usersById) return;

  const sourceUser = snapshot.usersById.get(safeSourceUid);
  if (!sourceUser) {
    appendContentExchangeLogLine(`Import aborted: source user ${safeSourceUid} not found in snapshot.`);
    return;
  }
  if (sourceUser.isCurrentUser) {
    alert('This entry already belongs to your account.');
    return;
  }

  const selection = buildContentExchangeImportSelection(sourceUser, safeLevel, safeEntityId, opts);
  if (!selection.subjectIds.length && !selection.topicIds.length && !selection.cardIds.length) {
    appendContentExchangeLogLine(`Import aborted: no records resolved for ${safeLevel} "${safeEntityId}".`);
    return;
  }

  contentExchangeImporting = true;
  setContentExchangeBusyState();
  setContentExchangeStatusText(`Importing ${safeLevel}...`);
  const startedAt = performance.now();
  appendContentExchangeLogLine(
    `Import started (${safeLevel}): subjects=${selection.subjectIds.length}, topics=${selection.topicIds.length}, cards=${selection.cardIds.length}.`
  );

  try {
    await initSupabaseBackend();
    await resolveSupabaseTenantColumn();
    const ownerId = await getSupabaseOwnerId();
    appendContentExchangeLogLine(`Import target uid=${ownerId.slice(0, 8)}...`);

    const [subjectRows, topicRows, cardRows] = await Promise.all([
      fetchContentExchangePayloadRowsByKey('subjects', safeSourceUid, selection.subjectIds, { log: appendContentExchangeLogLine }),
      fetchContentExchangePayloadRowsByKey('topics', safeSourceUid, selection.topicIds, { log: appendContentExchangeLogLine }),
      fetchContentExchangePayloadRowsByKey('cards', safeSourceUid, selection.cardIds, { log: appendContentExchangeLogLine })
    ]);
    appendContentExchangeLogLine(
      `Loaded payloads: subjects=${subjectRows.length}, topics=${topicRows.length}, cards=${cardRows.length}.`
    );

    const nowIso = new Date().toISOString();
    for (let idx = 0; idx < subjectRows.length; idx += 1) {
      const row = subjectRows[idx];
      const id = String(row?.id || '').trim();
      if (!id) continue;
      appendContentExchangeLogLine(`[subject ${idx + 1}/${subjectRows.length}] upsert ${id}`);
      await put('subjects', stampImportedRecordMeta(row, safeSourceUid, nowIso), {
        uiBlocking: false,
        loadingLabel: ''
      });
    }

    for (let idx = 0; idx < topicRows.length; idx += 1) {
      const row = topicRows[idx];
      const id = String(row?.id || '').trim();
      if (!id) continue;
      appendContentExchangeLogLine(`[topic ${idx + 1}/${topicRows.length}] upsert ${id}`);
      await put('topics', stampImportedRecordMeta(row, safeSourceUid, nowIso), {
        uiBlocking: false,
        loadingLabel: ''
      });
    }

    let externalRefCount = 0;
    for (let idx = 0; idx < cardRows.length; idx += 1) {
      const row = cardRows[idx];
      const rawId = String(row?.id || '').trim();
      const cardId = rawId || uid();
      appendContentExchangeLogLine(`[card ${idx + 1}/${cardRows.length}] upsert ${cardId}`);
      const stamped = stampImportedRecordMeta({ ...row, id: cardId }, safeSourceUid, nowIso);
      const imagePayload = await buildCardImagePayloadForSave(
        cardId,
        getCardImageList(stamped, 'Q'),
        getCardImageList(stamped, 'A'),
        {
          log: message => appendContentExchangeLogLine(`[card ${idx + 1}/${cardRows.length}] ${message}`)
        }
      );
      const nextCard = {
        ...stamped,
        ...imagePayload
      };
      externalRefCount += countExternalStorageRefsForImportedCard(nextCard, safeSourceUid);
      await put('cards', nextCard, {
        uiBlocking: false,
        loadingLabel: ''
      });
      await putCardBank(nextCard, {
        uiBlocking: false,
        loadingLabel: ''
      });
    }

    appendContentExchangeLogLine(
      `Import done in ${formatImageMigrationDurationMs(performance.now() - startedAt)}. Subjects=${subjectRows.length}, topics=${topicRows.length}, cards=${cardRows.length}.`
    );
    if (externalRefCount > 0) {
      appendContentExchangeLogLine(
        `Warning: ${externalRefCount} image ref(s) still point to source storage paths (${safeSourceUid}/...).`
      );
    }
    setContentExchangeStatusText('Import finished. Refreshing app view...');
    invalidateApiStoreCache();
    await refreshSidebar({ uiBlocking: false });
    if (selectedSubject) await loadTopics();
    if (selectedTopic) await loadDeck();
    await reloadContentExchangeTree({ preserveLog: true });
  } catch (err) {
    const message = String(err?.message || 'Unknown error');
    appendContentExchangeLogLine(`Import failed: ${message}`);
    setContentExchangeStatusText('Import failed. See log output.');
    console.error('Content exchange import failed:', err);
  } finally {
    contentExchangeImporting = false;
    setContentExchangeBusyState();
  }
}

/**
 * @function handleContentExchangeTreeClick
 * @description Handles import button clicks inside the rendered tree.
 */

function handleContentExchangeTreeClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const selectAllBtn = target.closest('.exchange-select-all-btn');
  if (selectAllBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (contentExchangeLoading || contentExchangeImporting) return;
    const ownerId = String(selectAllBtn.dataset.ownerId || '').trim();
    const topicId = String(selectAllBtn.dataset.topicId || '').trim();
    const cardIds = getContentExchangeTopicCardIds(ownerId, topicId);
    const selected = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
    selected.clear();
    cardIds.forEach(id => selected.add(id));
    refreshContentExchangeTopicSelectionUi(ownerId, topicId);
    return;
  }

  const clearBtn = target.closest('.exchange-clear-selection-btn');
  if (clearBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (contentExchangeLoading || contentExchangeImporting) return;
    const ownerId = String(clearBtn.dataset.ownerId || '').trim();
    const topicId = String(clearBtn.dataset.topicId || '').trim();
    const cardIds = getContentExchangeTopicCardIds(ownerId, topicId);
    const selected = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
    selected.clear();
    refreshContentExchangeTopicSelectionUi(ownerId, topicId);
    return;
  }

  const importSelectedBtn = target.closest('.exchange-import-selected-btn');
  if (importSelectedBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (contentExchangeLoading || contentExchangeImporting) return;
    const ownerId = String(importSelectedBtn.dataset.ownerId || '').trim();
    const topicId = String(importSelectedBtn.dataset.topicId || '').trim();
    const cardIds = getContentExchangeTopicCardIds(ownerId, topicId);
    const selected = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
    const selectedIds = cardIds.filter(id => selected.has(id));
    if (!selectedIds.length) {
      alert('Please select at least one card.');
      return;
    }
    const label = `${selectedIds.length} selected ${selectedIds.length === 1 ? 'card' : 'cards'} (plus parent topic + subject)`;
    const proceed = confirm(`Import ${label} into your account?`);
    if (!proceed) return;
    void importContentExchangeSelection('topic', ownerId, topicId, { selectedCardIds: selectedIds });
    return;
  }

  const btn = target.closest('.exchange-import-btn');
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  if (contentExchangeLoading || contentExchangeImporting) return;
  const level = String(btn.dataset.level || '').trim().toLowerCase();
  const ownerId = String(btn.dataset.ownerId || '').trim();
  const id = String(btn.dataset.id || '').trim();
  if (!level || !ownerId || !id) return;

  let label = 'selection';
  if (level === 'topic') label = 'this topic (all cards + parent subject)';
  else if (level === 'subject') label = 'this subject (all nested topics + cards)';
  const proceed = confirm(`Import ${label} into your account?`);
  if (!proceed) return;
  void importContentExchangeSelection(level, ownerId, id);
}

/**
 * @function handleContentExchangeTreeChange
 * @description Handles single-card checkbox selection changes in the exchange topic list.
 */

function handleContentExchangeTreeChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const checkbox = target.closest('.content-exchange-card-check');
  if (!checkbox) return;
  if (contentExchangeLoading || contentExchangeImporting) return;
  const ownerId = String(checkbox.dataset.ownerId || '').trim();
  const topicId = String(checkbox.dataset.topicId || '').trim();
  const cardId = String(checkbox.dataset.cardId || '').trim();
  if (!ownerId || !topicId || !cardId) return;
  const cardIds = getContentExchangeTopicCardIds(ownerId, topicId);
  const selected = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
  if (checkbox.checked) selected.add(cardId);
  else selected.delete(cardId);
  refreshContentExchangeTopicSelectionUi(ownerId, topicId);
}

/**
 * @function wireContentExchangeDialog
 * @description Wires content-exchange dialog controls once.
 */

function wireContentExchangeDialog() {
  const dialog = el('contentExchangeDialog');
  if (!dialog || dialog.dataset.wired === '1') return;
  dialog.dataset.wired = '1';
  const closeBtn = el('closeContentExchangeBtn');
  const reloadBtn = el('reloadContentExchangeBtn');
  const tree = el('contentExchangeTree');

  if (closeBtn) closeBtn.onclick = closeContentExchangeDialog;
  if (reloadBtn) reloadBtn.onclick = () => { void reloadContentExchangeTree(); };
  if (tree) tree.addEventListener('click', handleContentExchangeTreeClick);
  if (tree) tree.addEventListener('change', handleContentExchangeTreeChange);

  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    closeContentExchangeDialog();
  });
  dialog.addEventListener('cancel', event => {
    if (dialog.dataset.busy !== '1') return;
    event.preventDefault();
  });
}

/**
 * @function openContentExchangeDialog
 * @description Opens content-exchange dialog and loads latest cross-user tree snapshot.
 */

async function openContentExchangeDialog() {
  wireContentExchangeDialog();
  const dialog = el('contentExchangeDialog');
  const settingsDialog = el('settingsDialog');
  if (settingsDialog?.open) closeDialog(settingsDialog);
  if (dialog) showDialog(dialog);
  await reloadContentExchangeTree({ preserveLog: false });
}

// ============================================================================
