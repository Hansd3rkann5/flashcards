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

// ============================================================================
