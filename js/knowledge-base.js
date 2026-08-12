// AI Assistant — Knowledge Base (Phase 1)
// ============================================================================
// Per-subject lecture materials / transcripts that will later ground the AI
// assistant's answers. Files + extracted plain-text live in the Supabase
// `knowledge` Storage bucket; lightweight metadata lives in the generic
// `records` store (store = 'knowledge'), so it works on both the Supabase and
// local backends via the existing data-access layer (put/getAll/del).
//
// Record shape (store 'knowledge', key 'id'):
//   { id, subjectId, filename, ext, mime, sizeBytes, charCount, tokenEstimate,
//     originalRef, textRef, text?, createdAt, updatedAt }
// `text` is only inlined on the local backend (no Storage); on Supabase the
// text lives in Storage (textRef) to keep list reads light.

const KNOWLEDGE_STORE = 'knowledge';
const KNOWLEDGE_BUCKET = 'knowledge';
const KNOWLEDGE_ACCEPT = '.pdf,.txt,.md,.markdown,text/plain,application/pdf';
const PDFJS_VERSION = '4.0.379';

let pdfjsLibPromise = null;

/**
 * @function ensurePdfJs
 * @description Lazily loads pdf.js (ESM) from CDN the first time a PDF is parsed.
 */
async function ensurePdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const base = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;
      const lib = await import(/* webpackIgnore: true */ `${base}/pdf.min.mjs`);
      lib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
      return lib;
    })().catch(err => {
      pdfjsLibPromise = null;
      throw err;
    });
  }
  return pdfjsLibPromise;
}

/**
 * @function extractPdfText
 * @description Extracts plain text from a PDF ArrayBuffer, page by page.
 */
async function extractPdfText(arrayBuffer) {
  const pdfjs = await ensurePdfJs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map(item => (item && item.str) || '').join(' ');
    pages.push(text.replace(/\s+\n/g, '\n').trim());
  }
  return pages.join('\n\n').trim();
}

/**
 * @function extractTextFromFile
 * @description Returns extracted plain text for a supported knowledge file.
 */
async function extractTextFromFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdfText(await file.arrayBuffer());
  }
  // txt / md / markdown / any text-like file
  return String(await file.text()).trim();
}

/**
 * @function getKnowledgeFileExt
 * @description Resolves a lowercase file extension for a knowledge file.
 */
function getKnowledgeFileExt(file) {
  const name = String(file?.name || '').trim();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return ext.replace(/[^a-z0-9]/g, '') || 'txt';
}

/**
 * @function estimateKnowledgeTokens
 * @description Rough token estimate (~4 chars/token) for budgeting/UX; exact
 * counts come later from the Edge Function via count_tokens.
 */
function estimateKnowledgeTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

/**
 * @function uploadKnowledgeObject
 * @description Uploads one object to the private `knowledge` bucket and returns
 * a stable sb:// reference.
 */
async function uploadKnowledgeObject(path, data, contentType) {
  const { error } = await supabaseClient.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(path, data, { contentType, upsert: true });
  assertSupabaseSuccess(error, `Failed to upload knowledge object: ${path}`);
  return buildSupabaseStorageRef(KNOWLEDGE_BUCKET, path);
}

/**
 * @function addKnowledgeFileForSubject
 * @description Extracts text, stores the file + text, and saves a metadata record.
 */
async function addKnowledgeFileForSubject(subjectId, file, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : () => {};
  const safeSubjectId = String(subjectId || '').trim();
  if (!safeSubjectId) throw new Error('Missing subject id for knowledge upload.');
  if (!file) throw new Error('No file provided.');

  onStatus(`Extracting text from “${file.name}”…`);
  const text = await extractTextFromFile(file);
  if (!text) throw new Error('No text could be extracted from the file (possibly a scanned PDF without a text layer).');

  const id = uid();
  const ext = getKnowledgeFileExt(file);
  const nowIso = new Date().toISOString();
  const supabase = isSupabaseBackendEnabled();

  const record = {
    id,
    subjectId: safeSubjectId,
    filename: String(file.name || 'material').trim(),
    ext,
    mime: String(file.type || '').trim(),
    sizeBytes: Number(file.size || 0) || 0,
    charCount: text.length,
    tokenEstimate: estimateKnowledgeTokens(text),
    originalRef: '',
    textRef: '',
    priority: 2,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  if (supabase) {
    await initSupabaseBackend();
    const ownerId = await getSupabaseOwnerId();
    const owner = sanitizeStoragePathSegment(ownerId, 'owner');
    const subjectSeg = sanitizeStoragePathSegment(safeSubjectId, 'subject');
    const folder = `${owner}/${subjectSeg}/${id}`;
    onStatus('Uploading original file to storage…');
    record.originalRef = await uploadKnowledgeObject(
      `${folder}/original.${ext}`,
      file,
      record.mime || 'application/octet-stream'
    );
    onStatus('Uploading extracted text to storage…');
    record.textRef = await uploadKnowledgeObject(
      `${folder}/text.txt`,
      new Blob([text], { type: 'text/plain; charset=utf-8' }),
      'text/plain; charset=utf-8'
    );
  } else {
    // Local backend has no object storage — keep the text in the record.
    record.text = text;
  }

  onStatus('Saving metadata…');
  await put(KNOWLEDGE_STORE, record, { uiBlocking: false, loadingLabel: 'Saving material…' });
  return record;
}

/**
 * @function listKnowledgeForSubject
 * @description Returns knowledge records for one subject, newest first.
 */
async function listKnowledgeForSubject(subjectId, options = {}) {
  const safeSubjectId = String(subjectId || '').trim();
  if (!safeSubjectId) return [];
  const all = await getAll(KNOWLEDGE_STORE, { ...options });
  return (Array.isArray(all) ? all : [])
    .filter(rec => String(rec?.subjectId || '').trim() === safeSubjectId)
    .sort((a, b) => {
      const pa = Number(a?.priority ?? 2);
      const pb = Number(b?.priority ?? 2);
      if (pa !== pb) return pa - pb;
      return String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''));
    });
}

/**
 * @function deleteKnowledgeRecord
 * @description Removes stored objects (best effort) and the metadata record.
 */
async function deleteKnowledgeRecord(record) {
  const rec = record && typeof record === 'object' ? record : {};
  const id = String(rec.id || '').trim();
  if (!id) return;
  if (isSupabaseBackendEnabled()) {
    const paths = [rec.originalRef, rec.textRef]
      .map(ref => parseSupabaseStorageRef(ref))
      .filter(parsed => parsed && parsed.bucket === KNOWLEDGE_BUCKET)
      .map(parsed => parsed.path);
    if (paths.length) {
      try {
        await initSupabaseBackend();
        await supabaseClient.storage.from(KNOWLEDGE_BUCKET).remove(paths);
      } catch (err) {
        console.warn('Knowledge storage cleanup failed (record still removed):', err);
      }
    }
  }
  await del(KNOWLEDGE_STORE, id, { uiBlocking: false, loadingLabel: 'Removing material…' });
}

/**
 * @function formatKnowledgeMeta
 * @description Human-readable size/token summary for a knowledge record.
 */
function formatKnowledgeMeta(record) {
  const chars = Number(record?.charCount || 0);
  const tokens = Number(record?.tokenEstimate || 0);
  const kb = chars >= 1000 ? `${Math.round(chars / 1000)}k chars` : `${chars} chars`;
  return `${kb} · ~${tokens.toLocaleString('en-US')} tokens`;
}

/**
 * @function ensureKnowledgeDialog
 * @description Creates (once) and returns the knowledge base dialog element.
 */
function ensureKnowledgeDialog() {
  let dialog = el('knowledgeBaseDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'knowledgeBaseDialog';
  dialog.className = 'knowledge-dialog';
  dialog.innerHTML = `
    <div class="knowledge-dialog-inner">
      <div class="knowledge-dialog-head">
        <h2 class="knowledge-dialog-title">Knowledge</h2>
        <button class="btn knowledge-close" type="button" data-action="close" aria-label="Close">✕</button>
      </div>
      <p class="knowledge-dialog-sub tiny">
        Upload lecture materials &amp; transcripts (PDF, TXT, MD). Claude answers
        questions primarily based on this content.
      </p>
      <div class="knowledge-upload-row">
        <input id="knowledgeFileInput" type="file" accept="${KNOWLEDGE_ACCEPT}" multiple />
        <button class="btn knowledge-upload-btn" type="button" data-action="upload">Upload</button>
      </div>
      <div class="knowledge-status tiny" data-role="status"></div>
      <div class="knowledge-list" data-role="list"></div>
    </div>
  `;
  document.body.appendChild(dialog);

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());
  return dialog;
}

/**
 * @function setKnowledgeStatus
 * @description Writes a status/error line inside the dialog.
 */
function setKnowledgeStatus(dialog, message, isError = false) {
  const status = dialog.querySelector('[data-role="status"]');
  if (!status) return;
  status.textContent = String(message || '');
  status.classList.toggle('is-error', !!isError);
}

/**
 * @function renderKnowledgeList
 * @description Renders the current subject's materials into the dialog.
 */
async function renderKnowledgeList(dialog, subjectId) {
  const list = dialog.querySelector('[data-role="list"]');
  if (!list) return;
  list.innerHTML = '<div class="tiny knowledge-empty">Loading…</div>';
  let records = [];
  try {
    records = await listKnowledgeForSubject(subjectId, { force: true });
  } catch (err) {
    list.innerHTML = '';
    setKnowledgeStatus(dialog, `Could not load materials: ${err?.message || err}`, true);
    return;
  }
  if (!records.length) {
    list.innerHTML = '<div class="tiny knowledge-empty">No materials for this subject yet.</div>';
    return;
  }
  list.innerHTML = '';
  records.forEach(rec => {
    const priority = Number(rec.priority ?? 2);
    const row = document.createElement('div');
    row.className = 'knowledge-item';

    const main = document.createElement('div');
    main.className = 'knowledge-item-main';
    const nameEl = document.createElement('div');
    nameEl.className = 'knowledge-item-name';
    nameEl.textContent = rec.filename || 'Material';
    const metaEl = document.createElement('div');
    metaEl.className = 'knowledge-item-meta tiny';
    metaEl.textContent = formatKnowledgeMeta(rec);
    main.appendChild(nameEl);
    main.appendChild(metaEl);

    const actions = document.createElement('div');
    actions.className = 'knowledge-item-actions';

    const select = document.createElement('select');
    select.className = 'knowledge-priority-select';
    select.setAttribute('aria-label', 'Priority');
    select.title = 'Context priority';
    [['1', '⬆ High'], ['2', '▶ Medium'], ['3', '⬇ Low']].forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (Number(val) === priority) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', async (e) => {
      const newPriority = Number(e.target.value);
      rec.priority = newPriority;
      rec.updatedAt = new Date().toISOString();
      try {
        await put(KNOWLEDGE_STORE, rec, { uiBlocking: false });
        await renderKnowledgeList(dialog, subjectId);
      } catch (err) {
        setKnowledgeStatus(dialog, `Priority update failed: ${err?.message || err}`, true);
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn delete knowledge-item-delete';
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('aria-label', 'Remove');
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Remove “${rec.filename}” from the knowledge base?`)) return;
      setKnowledgeStatus(dialog, 'Removing…');
      try {
        await deleteKnowledgeRecord(rec);
        setKnowledgeStatus(dialog, '');
        await renderKnowledgeList(dialog, subjectId);
      } catch (err) {
        setKnowledgeStatus(dialog, `Removal failed: ${err?.message || err}`, true);
      }
    });

    actions.appendChild(select);
    actions.appendChild(deleteBtn);
    row.appendChild(main);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

/**
 * @function escapeHtml
 * @description Minimal HTML escaping for user-provided filenames.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @function openKnowledgeBaseDialog
 * @description Opens the per-subject knowledge base manager.
 */
async function openKnowledgeBaseDialog(subjectId, subjectName = '') {
  const safeSubjectId = String(subjectId || '').trim();
  if (!safeSubjectId) return;
  const dialog = ensureKnowledgeDialog();
  const title = dialog.querySelector('.knowledge-dialog-title');
  if (title) title.textContent = `Knowledge${subjectName ? ` – ${subjectName}` : ''}`;
  setKnowledgeStatus(dialog, '');

  const fileInput = dialog.querySelector('#knowledgeFileInput');
  const uploadBtn = dialog.querySelector('[data-action="upload"]');
  if (fileInput) fileInput.value = '';

  uploadBtn.onclick = async () => {
    const files = Array.from(fileInput?.files || []);
    if (!files.length) {
      setKnowledgeStatus(dialog, 'Please select a file first.', true);
      return;
    }
    uploadBtn.disabled = true;
    let ok = 0;
    for (const file of files) {
      try {
        await addKnowledgeFileForSubject(safeSubjectId, file, {
          onStatus: msg => setKnowledgeStatus(dialog, msg)
        });
        ok += 1;
      } catch (err) {
        setKnowledgeStatus(dialog, `„${file.name}": ${err?.message || err}`, true);
      }
    }
    uploadBtn.disabled = false;
    if (fileInput) fileInput.value = '';
    if (ok) setKnowledgeStatus(dialog, `${ok} file(s) added.`);
    await renderKnowledgeList(dialog, safeSubjectId);
  };

  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  await renderKnowledgeList(dialog, safeSubjectId);
}
