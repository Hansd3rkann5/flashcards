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
  const examDateInput = el('subjectExamDateInput');
  if (examDateInput) examDateInput.value = '';
  const excludeInput = el('subjectExcludeFromReviewInput');
  if (excludeInput) excludeInput.checked = false;
  showDialog(el('subjectDialog'));
}

/**
 * @function normalizeSubjectExamDate
 * @description Normalizes a subject exam-date value to YYYY-MM-DD or empty string.
 */

function normalizeSubjectExamDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!ddmmyyyy) return '';
  const day = Number(ddmmyyyy[1]);
  const month = Number(ddmmyyyy[2]);
  const year = Number(ddmmyyyy[3]);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (
    test.getUTCFullYear() !== year
    || (test.getUTCMonth() + 1) !== month
    || test.getUTCDate() !== day
  ) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @function formatSubjectExamDateForInput
 * @description Formats stored exam date values as DD/MM/YYYY for subject dialog inputs.
 */

function formatSubjectExamDateForInput(value = '') {
  const normalized = normalizeSubjectExamDate(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * @function addSubjectFromDialog
 * @description Reads subject form values, creates the subject, and refreshes the sidebar.
 */

async function addSubjectFromDialog() {
  const name = el('subjectNameInput').value.trim();
  if (!name) return;
  const accent = el('subjectAccentText').value.trim() || '#2dd4bf';
  const examDateRaw = String(el('subjectExamDateInput')?.value || '').trim();
  const examDate = normalizeSubjectExamDate(examDateRaw);
  if (examDateRaw && !examDate) {
    alert('Please use exam date format DD/MM/YYYY.');
    return;
  }
  const excludeFromReview = !!el('subjectExcludeFromReviewInput')?.checked;
  const subject = buildSubjectRecord({
    id: uid(),
    name,
    accent,
    examDate,
    excludeFromReview
  });
  await put('subjects', subject);
  closeDialog(el('subjectDialog'));
  refreshSidebar();
}

const CONTENT_EXCHANGE_PROFILE_SETTINGS_ID = 'profile';
const CONTENT_EXCHANGE_FETCH_BATCH_SIZE = 20;
const CONTENT_EXCHANGE_CARD_PREVIEW_MAX_LEN = 120;
const CONTENT_EXCHANGE_ADMIN_EMAILS = new Set(['simon-bader@gmx.net']);
let contentExchangeSnapshot = null;
let contentExchangeLoading = false;
let contentExchangeImporting = false;
let contentExchangeDeleting = false;
let contentExchangeIsAdmin = false;
let contentExchangeAdminEditOwnerIds = new Set();
let contentExchangeLastLoadToken = 0;
let contentExchangeSelectedCardIdsByTopicKey = new Map();
let contentExchangeReturnView = 0;

/**
 * @function normalizeContentExchangeEmail
 * @description Normalizes emails for admin-role checks.
 */

function normalizeContentExchangeEmail(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * @function isContentExchangeAdminEmail
 * @description Returns true when an email is included in the local exchange-admin allow-list.
 */

function isContentExchangeAdminEmail(email = '') {
  const safeEmail = normalizeContentExchangeEmail(email);
  if (!safeEmail) return false;
  return CONTENT_EXCHANGE_ADMIN_EMAILS.has(safeEmail);
}

/**
 * @function resolveContentExchangeAdminState
 * @description Resolves whether the currently authenticated user should see admin controls in exchange view.
 */

async function resolveContentExchangeAdminState() {
  let email = '';
  if (typeof authenticatedSupabaseUser !== 'undefined' && authenticatedSupabaseUser) {
    email = normalizeContentExchangeEmail(authenticatedSupabaseUser.email || '');
  }
  if (!email) {
    const { data, error } = await supabaseClient.auth.getUser();
    assertSupabaseSuccess(error, 'Failed to resolve admin role for content exchange.');
    email = normalizeContentExchangeEmail(data?.user?.email || '');
  }
  contentExchangeIsAdmin = isContentExchangeAdminEmail(email);
  if (!contentExchangeIsAdmin) {
    contentExchangeAdminEditOwnerIds = new Set();
  }
  return contentExchangeIsAdmin;
}

/**
 * @function pruneContentExchangeAdminEditOwners
 * @description Removes stale owner ids from admin-edit mode after each snapshot reload.
 */

function pruneContentExchangeAdminEditOwners() {
  if (!contentExchangeIsAdmin || !contentExchangeSnapshot?.users) {
    contentExchangeAdminEditOwnerIds = new Set();
    return;
  }
  const validOwnerIds = new Set(
    contentExchangeSnapshot.users
      .filter(user => !user?.isCurrentUser)
      .map(user => String(user?.uid || '').trim())
      .filter(Boolean)
  );
  Array.from(contentExchangeAdminEditOwnerIds).forEach(ownerId => {
    if (!validOwnerIds.has(ownerId)) contentExchangeAdminEditOwnerIds.delete(ownerId);
  });
}

/**
 * @function setContentExchangeModalOpenState
 * @description Locks/unlocks background panel scrolling while the exchange dialog is open.
 */

function setContentExchangeModalOpenState(open = false) {
  document.body.classList.toggle('content-exchange-open', !!open);
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
 * @function confirmImportFormatRequirements
 * @description Shows a short format hint before opening the file picker.
 */

function confirmImportFormatRequirements(format = 'json') {
  const safeFormat = String(format || '').trim().toLowerCase() === 'csv' ? 'csv' : 'json';
  const title = safeFormat === 'csv'
    ? 'CSV import format requirements:'
    : 'JSON import format requirements:';
  const body = safeFormat === 'csv'
    ? [
      '- Header row required.',
      '- Minimum required columns: subject, topic, question, answer.',
      '- IDs are optional (card id/topicId can be empty).',
      '- Supported columns: id, topicId, topic, topicName, subject, subjectName, type, prompt/question, answer, options, imagesQ, imagesA.',
      '- Best compatibility: use files exported via "Export CSV".'
    ].join('\n')
    : [
      '- JSON array of cards OR object with cards/subjects/topics/progress arrays.',
      '- Minimum required per card: subject, topic, question, answer.',
      '- IDs are optional (card id/topicId can be empty).',
      '- Best compatibility: use files exported via "Export JSON".'
    ].join('\n');
  return confirm(`${title}\n\n${body}\n\nContinue and choose a file?`);
}

/**
 * @function normalizeImportCsvHeaderKey
 * @description Maps raw CSV header names to canonical field keys.
 */

function normalizeImportCsvHeaderKey(raw = '') {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!normalized) return '';
  if (normalized === 'id' || normalized === 'cardid') return 'id';
  if (normalized === 'topicid') return 'topicId';
  if (normalized === 'topic') return 'topicName';
  if (normalized === 'topicname') return 'topicName';
  if (normalized === 'subject') return 'subjectName';
  if (normalized === 'subjectname') return 'subjectName';
  if (normalized === 'type') return 'type';
  if (normalized === 'prompt' || normalized === 'question' || normalized === 'q') return 'prompt';
  if (normalized === 'answer' || normalized === 'a') return 'answer';
  if (normalized === 'options' || normalized === 'choices') return 'options';
  if (normalized === 'imagesq' || normalized === 'questionimages') return 'imagesQ';
  if (normalized === 'imagesa' || normalized === 'answerimages') return 'imagesA';
  if (normalized === 'imagedataq') return 'imageDataQ';
  if (normalized === 'imagedataa') return 'imageDataA';
  if (normalized === 'textalign') return 'textAlign';
  if (normalized === 'questiontextalign') return 'questionTextAlign';
  if (normalized === 'answertextalign') return 'answerTextAlign';
  if (normalized === 'optionstextalign') return 'optionsTextAlign';
  return '';
}

/**
 * @function parseCsvTextToRows
 * @description Parses CSV text (including quoted multiline values) into row arrays.
 */

function parseCsvTextToRows(csvText = '') {
  const text = String(csvText || '');
  const rows = [];
  let row = [];
  let cell = '';
  let idx = 0;
  let inQuotes = false;

  while (idx < text.length) {
    const char = text[idx];
    if (inQuotes) {
      if (char === '"') {
        if (text[idx + 1] === '"') {
          cell += '"';
          idx += 2;
          continue;
        }
        inQuotes = false;
        idx += 1;
        continue;
      }
      cell += char;
      idx += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      idx += 1;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      idx += 1;
      continue;
    }
    if (char === '\n' || char === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (char === '\r' && text[idx + 1] === '\n') idx += 1;
      idx += 1;
      continue;
    }

    cell += char;
    idx += 1;
  }

  row.push(cell);
  rows.push(row);
  return rows
    .map(cols => cols.map(value => String(value || '')))
    .filter((cols, rowIndex) => {
      if (!Array.isArray(cols)) return false;
      if (rowIndex === 0) return true;
      return cols.some(value => String(value || '').trim() !== '');
    });
}

/**
 * @function parseCsvObjectRows
 * @description Parses CSV text and returns canonical header keys plus object rows.
 */

function parseCsvObjectRows(csvText = '') {
  const matrix = parseCsvTextToRows(csvText);
  if (!matrix.length) {
    throw new Error('CSV file is empty.');
  }
  const header = matrix[0] || [];
  const keys = header.map(normalizeImportCsvHeaderKey);
  const knownHeaderCount = keys.filter(Boolean).length;
  if (!knownHeaderCount) {
    throw new Error('CSV header row is missing or unsupported.');
  }
  if (!keys.includes('subjectName')) {
    throw new Error('CSV must include a subject column (subject/subjectName).');
  }
  if (!keys.includes('topicName')) {
    throw new Error('CSV must include a topic column (topic/topicName).');
  }
  if (!keys.includes('prompt') || !keys.includes('answer')) {
    throw new Error('CSV must include question/prompt and answer columns.');
  }

  const rows = matrix.slice(1).map(cols => {
    const row = {};
    keys.forEach((key, idx) => {
      if (!key) return;
      row[key] = String(cols[idx] || '').trim();
    });
    return row;
  }).filter(row => Object.values(row).some(value => String(value || '').trim() !== ''));

  return { headerKeys: keys, rows };
}

/**
 * @function normalizeImportLookupName
 * @description Normalizes names for case-insensitive import matching.
 */

function normalizeImportLookupName(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * @function getImportSubjectName
 * @description Resolves a subject name from flexible import row keys.
 */

function getImportSubjectName(row = null) {
  if (!row || typeof row !== 'object') return '';
  return String(
    row.subjectName
    ?? row.subject
    ?? row.subject_title
    ?? ''
  ).trim();
}

/**
 * @function getImportTopicName
 * @description Resolves a topic name from flexible import row keys.
 */

function getImportTopicName(row = null) {
  if (!row || typeof row !== 'object') return '';
  return String(
    row.topicName
    ?? row.topic
    ?? row.topic_title
    ?? ''
  ).trim();
}

/**
 * @function getImportPromptText
 * @description Resolves a card question text from flexible import row keys.
 */

function getImportPromptText(row = null) {
  if (!row || typeof row !== 'object') return '';
  return String(
    row.prompt
    ?? row.question
    ?? row.q
    ?? ''
  ).trim();
}

/**
 * @function getImportAnswerText
 * @description Resolves a card answer text from flexible import row keys.
 */

function getImportAnswerText(row = null) {
  if (!row || typeof row !== 'object') return '';
  return String(
    row.answer
    ?? row.a
    ?? ''
  ).trim();
}

/**
 * @function parseCsvStringList
 * @description Parses a CSV cell into a string list (JSON array, "|" list, or single string).
 */

function parseCsvStringList(raw = '') {
  const safe = String(raw || '').trim();
  if (!safe) return [];

  if ((safe.startsWith('[') && safe.endsWith(']')) || (safe.startsWith('{') && safe.endsWith('}'))) {
    try {
      const parsed = JSON.parse(safe);
      if (Array.isArray(parsed)) {
        return normalizeImageList(parsed.map(value => String(value || '').trim()));
      }
      if (parsed && typeof parsed === 'object') {
        return normalizeImageList(Object.values(parsed).map(value => String(value || '').trim()));
      }
    } catch (_) {
      // Fall back to plain token parsing below.
    }
  }

  if (safe.includes('|')) {
    return normalizeImageList(safe.split('|').map(value => String(value || '').trim()));
  }
  return normalizeImageList([safe]);
}

/**
 * @function normalizeCsvOptionObject
 * @description Normalizes one option value to { text, correct }.
 */

function normalizeCsvOptionObject(raw = null) {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    return { text, correct: false };
  }
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text ?? '').trim();
  if (!text) return null;
  const correctRaw = raw.correct;
  const correct = correctRaw === true || String(correctRaw || '').trim().toLowerCase() === 'true';
  return { text, correct };
}

/**
 * @function parseCsvOptions
 * @description Parses options from CSV cell content.
 */

function parseCsvOptions(raw = '') {
  const safe = String(raw || '').trim();
  if (!safe) return [];

  let parsed = null;
  if ((safe.startsWith('[') && safe.endsWith(']')) || (safe.startsWith('{') && safe.endsWith('}'))) {
    try {
      parsed = JSON.parse(safe);
    } catch (_) {
      parsed = null;
    }
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : safe.split('|').map(token => {
      const value = String(token || '').trim();
      if (!value) return null;
      const prefixedCorrect = value.startsWith('*') || value.startsWith('+');
      const text = prefixedCorrect ? value.slice(1).trim() : value;
      return { text, correct: prefixedCorrect };
    });

  const seen = new Set();
  const options = [];
  candidates.forEach(entry => {
    const normalized = normalizeCsvOptionObject(entry);
    if (!normalized) return;
    const dedupeKey = `${normalized.text.toLowerCase()}::${normalized.correct ? '1' : '0'}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    options.push(normalized);
  });
  return options;
}

/**
 * @function ensureCsvImportSubject
 * @description Ensures a subject exists for CSV import and returns it.
 */

async function ensureCsvImportSubject(subjectName = '', cache = null) {
  const safeName = String(subjectName || '').trim() || 'Imported';
  const key = normalizeImportLookupName(safeName);
  const subjectByName = cache?.subjectByName;
  const subjectById = cache?.subjectById;
  if (subjectByName instanceof Map && subjectByName.has(key)) {
    return { subject: subjectByName.get(key), created: false };
  }

  const subject = buildSubjectRecord({
    id: uid(),
    name: safeName,
    accent: '#2dd4bf'
  });
  await put('subjects', subject);
  if (subjectByName instanceof Map) subjectByName.set(key, subject);
  if (subjectById instanceof Map) subjectById.set(String(subject.id || '').trim(), subject);
  return { subject, created: true };
}

/**
 * @function ensureCsvImportTopic
 * @description Ensures a topic exists for CSV import and returns it.
 */

async function ensureCsvImportTopic(topicName = '', subjectId = '', topicIdHint = '', cache = null) {
  const safeSubjectId = String(subjectId || '').trim();
  const safeTopicName = String(topicName || '').trim() || 'Imported Topic';
  const safeTopicIdHint = String(topicIdHint || '').trim();
  const topicById = cache?.topicById;
  const topicByLookup = cache?.topicByLookup;

  if (safeTopicIdHint && topicById instanceof Map && topicById.has(safeTopicIdHint)) {
    return { topic: topicById.get(safeTopicIdHint), created: false };
  }

  const lookupKey = `${safeSubjectId}::${normalizeImportLookupName(safeTopicName)}`;
  if (topicByLookup instanceof Map && topicByLookup.has(lookupKey)) {
    return { topic: topicByLookup.get(lookupKey), created: false };
  }

  const nextTopicId = (safeTopicIdHint && !(topicById instanceof Map && topicById.has(safeTopicIdHint)))
    ? safeTopicIdHint
    : uid();
  const topic = {
    id: nextTopicId,
    subjectId: safeSubjectId,
    name: safeTopicName
  };
  await put('topics', topic);
  if (topicById instanceof Map) topicById.set(nextTopicId, topic);
  if (topicByLookup instanceof Map) topicByLookup.set(lookupKey, topic);
  return { topic, created: true };
}

/**
 * @function importCSV
 * @description Imports flashcards from CSV rows.
 */

async function importCSV(file) {
  const text = await file.text();
  const parsed = parseCsvObjectRows(text);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  if (!rows.length) {
    alert('No CSV rows to import.');
    return;
  }

  const [subjects, topics, cards] = await Promise.all([
    getAll('subjects'),
    getAll('topics'),
    getAll('cards')
  ]);

  const subjectById = new Map();
  const subjectByName = new Map();
  (Array.isArray(subjects) ? subjects : []).forEach(subject => {
    const id = String(subject?.id || '').trim();
    if (!id) return;
    subjectById.set(id, subject);
    subjectByName.set(normalizeImportLookupName(subject?.name || ''), subject);
  });

  const topicById = new Map();
  const topicByLookup = new Map();
  (Array.isArray(topics) ? topics : []).forEach(topic => {
    const id = String(topic?.id || '').trim();
    const subjectId = String(topic?.subjectId || '').trim();
    if (!id || !subjectId) return;
    topicById.set(id, topic);
    topicByLookup.set(`${subjectId}::${normalizeImportLookupName(topic?.name || '')}`, topic);
  });

  const cardById = new Map();
  (Array.isArray(cards) ? cards : []).forEach(card => {
    const id = String(card?.id || '').trim();
    if (!id) return;
    cardById.set(id, card);
  });

  const cache = { subjectById, subjectByName, topicById, topicByLookup, cardById };
  const nowIso = new Date().toISOString();
  let createdSubjects = 0;
  let createdTopics = 0;
  let importedCards = 0;
  let skippedRows = 0;

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx] || {};
    const rowLabel = `Row ${idx + 2}`; // +2 because CSV row 1 is header.
    const rawSubjectName = getImportSubjectName(row);
    const rawTopicName = getImportTopicName(row);
    const prompt = getImportPromptText(row);
    const answer = getImportAnswerText(row);
    const rawTopicId = String(row.topicId || '').trim();

    if (!rawSubjectName || !rawTopicName || !prompt || !answer) {
      console.warn(`${rowLabel}: skipped because subject/topic/question/answer are required.`);
      skippedRows += 1;
      continue;
    }

    const ensureSubject = await ensureCsvImportSubject(rawSubjectName, cache);
    const subject = ensureSubject.subject;
    if (ensureSubject.created) createdSubjects += 1;

    let topic = rawTopicId ? topicById.get(rawTopicId) : null;
    const safeSubjectId = String(subject?.id || '').trim();
    if (topic && String(topic.subjectId || '').trim() !== safeSubjectId) {
      topic = null;
    }

    if (!topic) {
      const ensureTopic = await ensureCsvImportTopic(rawTopicName, subject.id, rawTopicId, cache);
      topic = ensureTopic.topic;
      if (ensureTopic.created) createdTopics += 1;
    }

    if (!topic?.id) {
      console.warn(`${rowLabel}: skipped because topic resolution failed.`);
      skippedRows += 1;
      continue;
    }

    const rawCardId = String(row.id || '').trim();
    const cardId = rawCardId || uid();
    const existing = cardById.get(cardId) || null;
    const imageDataQ = parseCsvStringList(row.imagesQ || row.imageDataQ || '');
    const imageDataA = parseCsvStringList(row.imagesA || row.imageDataA || '');

    const type = String(row.type || existing?.type || '').trim().toLowerCase() === 'mcq' ? 'mcq' : 'qa';
    let options = parseCsvOptions(row.options || '');
    if (type === 'mcq' && !options.length && answer) {
      options = [{ text: answer, correct: true }];
    }
    if (type !== 'mcq') {
      options = [];
    }

    const migratedImagePayload = await buildCardImagePayloadForSave(cardId, imageDataQ, imageDataA);
    const questionTextAlign = normalizeTextAlign(
      row.questionTextAlign
      || row.textAlign
      || existing?.questionTextAlign
      || existing?.textAlign
      || 'center'
    );
    const answerTextAlign = normalizeTextAlign(
      row.answerTextAlign
      || row.textAlign
      || existing?.answerTextAlign
      || existing?.textAlign
      || 'center'
    );
    const optionsTextAlign = normalizeTextAlign(
      row.optionsTextAlign
      || existing?.optionsTextAlign
      || 'center'
    );
    const createdAt = existing?.meta?.createdAt || existing?.createdAt || nowIso;
    const nextCard = {
      ...(existing || {}),
      id: cardId,
      topicId: String(topic.id || '').trim(),
      type,
      prompt,
      answer,
      options,
      textAlign: questionTextAlign,
      questionTextAlign,
      answerTextAlign,
      optionsTextAlign,
      ...migratedImagePayload,
      createdAt,
      meta: {
        ...(existing?.meta || {}),
        createdAt,
        updatedAt: nowIso
      }
    };

    await put('cards', nextCard);
    await putCardBank(nextCard);
    cardById.set(cardId, nextCard);
    importedCards += 1;
  }

  progressByCardId = new Map();
  const skipNote = skippedRows > 0 ? ` Skipped rows: ${skippedRows}.` : '';
  alert(
    `CSV import complete.\nImported cards: ${importedCards}\nCreated subjects: ${createdSubjects}\nCreated topics: ${createdTopics}.${skipNote}`
  );
  refreshSidebar();
  if (selectedSubject) loadTopics();
  if (selectedTopic) loadDeck();
}

/**
 * @function normalizeJsonImportPayload
 * @description Normalizes flexible JSON import structures into store arrays.
 */

function normalizeJsonImportPayload(raw = null) {
  const root = Array.isArray(raw)
    ? { cards: raw }
    : (raw && typeof raw === 'object')
      ? raw
      : {};
  const toRows = value => (Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : []);
  const cardsFromRoot = toRows(root.cards);
  const fallbackCards = cardsFromRoot.length
    ? cardsFromRoot
    : toRows(root.flashcards).length
      ? toRows(root.flashcards)
      : toRows(root.items);
  const singleCard = (!fallbackCards.length && root && typeof root === 'object'
    && (root.prompt || root.question || root.answer))
    ? [{ ...root }]
    : [];
  return {
    subjects: toRows(root.subjects),
    topics: toRows(root.topics),
    cards: fallbackCards.length ? fallbackCards : singleCard,
    progress: toRows(root.progress)
  };
}

/**
 * @function importJSON
 * @description Imports JSON.
 */

async function importJSON(file) {
  const text = await file.text();
  const parsed = normalizeJsonImportPayload(JSON.parse(text));
  if (!parsed.subjects.length && !parsed.topics.length && !parsed.cards.length && !parsed.progress.length) {
    throw new Error('JSON contains no importable rows.');
  }

  const [subjects, topics, cards] = await Promise.all([
    getAll('subjects'),
    getAll('topics'),
    getAll('cards')
  ]);

  const subjectById = new Map();
  const subjectByName = new Map();
  (Array.isArray(subjects) ? subjects : []).forEach(subject => {
    const id = String(subject?.id || '').trim();
    if (!id) return;
    subjectById.set(id, subject);
    subjectByName.set(normalizeImportLookupName(subject?.name || ''), subject);
  });

  const topicById = new Map();
  const topicByLookup = new Map();
  (Array.isArray(topics) ? topics : []).forEach(topic => {
    const id = String(topic?.id || '').trim();
    const subjectId = String(topic?.subjectId || '').trim();
    if (!id || !subjectId) return;
    topicById.set(id, topic);
    topicByLookup.set(`${subjectId}::${normalizeImportLookupName(topic?.name || '')}`, topic);
  });

  const cardById = new Map();
  (Array.isArray(cards) ? cards : []).forEach(card => {
    const id = String(card?.id || '').trim();
    if (!id) return;
    cardById.set(id, card);
  });

  const cache = { subjectById, subjectByName, topicById, topicByLookup, cardById };
  const nowIso = new Date().toISOString();
  let createdSubjects = 0;
  let createdTopics = 0;
  let importedCards = 0;
  let importedProgress = 0;
  let skippedCards = 0;

  for (const row of parsed.subjects) {
    const safeRow = (row && typeof row === 'object') ? row : {};
    const rowName = String(safeRow.name || safeRow.subjectName || safeRow.subject || '').trim();
    const rowId = String(safeRow.id || '').trim();
    const nameKey = normalizeImportLookupName(rowName);
    const existing = (rowId && subjectById.get(rowId))
      || (nameKey ? subjectByName.get(nameKey) : null)
      || null;
    const nextName = rowName || String(existing?.name || '').trim();
    if (!nextName) continue;
    const nextId = rowId || String(existing?.id || '').trim() || uid();
    const nextSubject = buildSubjectRecord({
      ...(existing || {}),
      ...safeRow,
      id: nextId,
      name: nextName,
      accent: normalizeHexColor(safeRow.accent || existing?.accent || '#2dd4bf')
    });
    await put('subjects', nextSubject);
    if (!existing) createdSubjects += 1;
    subjectById.set(nextId, nextSubject);
    subjectByName.set(normalizeImportLookupName(nextName), nextSubject);
  }

  for (const row of parsed.topics) {
    const safeRow = (row && typeof row === 'object') ? row : {};
    const rowTopicName = getImportTopicName(safeRow) || String(safeRow.name || '').trim();
    const rowTopicId = String(safeRow.id || '').trim();
    const rowSubjectId = String(safeRow.subjectId || '').trim();
    const rowSubjectName = getImportSubjectName(safeRow);
    let subject = rowSubjectId ? subjectById.get(rowSubjectId) : null;
    if (!subject && rowSubjectName) {
      const ensured = await ensureCsvImportSubject(rowSubjectName, cache);
      subject = ensured.subject;
      if (ensured.created) createdSubjects += 1;
    }
    if (!subject || !rowTopicName) continue;
    const lookupKey = `${String(subject.id || '').trim()}::${normalizeImportLookupName(rowTopicName)}`;
    const existing = (rowTopicId && topicById.get(rowTopicId))
      || topicByLookup.get(lookupKey)
      || null;
    const nextTopicId = rowTopicId || String(existing?.id || '').trim() || uid();
    const nextTopic = {
      ...(existing || {}),
      ...safeRow,
      id: nextTopicId,
      subjectId: String(subject.id || '').trim(),
      name: rowTopicName
    };
    await put('topics', nextTopic);
    if (!existing) createdTopics += 1;
    topicById.set(nextTopicId, nextTopic);
    topicByLookup.set(lookupKey, nextTopic);
  }

  for (let idx = 0; idx < parsed.cards.length; idx += 1) {
    const row = parsed.cards[idx] || {};
    const rowLabel = `Card row ${idx + 1}`;
    const rawSubjectName = getImportSubjectName(row);
    const rawTopicName = getImportTopicName(row);
    const prompt = getImportPromptText(row);
    const answer = getImportAnswerText(row);
    if (!rawSubjectName || !rawTopicName || !prompt || !answer) {
      console.warn(`${rowLabel}: skipped because subject/topic/question/answer are required.`);
      skippedCards += 1;
      continue;
    }

    const ensureSubject = await ensureCsvImportSubject(rawSubjectName, cache);
    const subject = ensureSubject.subject;
    if (ensureSubject.created) createdSubjects += 1;

    const rawTopicId = String(row.topicId || '').trim();
    let topic = rawTopicId ? topicById.get(rawTopicId) : null;
    const safeSubjectId = String(subject?.id || '').trim();
    if (topic && String(topic.subjectId || '').trim() !== safeSubjectId) {
      topic = null;
    }
    if (!topic) {
      const ensureTopic = await ensureCsvImportTopic(rawTopicName, safeSubjectId, rawTopicId, cache);
      topic = ensureTopic.topic;
      if (ensureTopic.created) createdTopics += 1;
    }
    if (!topic?.id) {
      skippedCards += 1;
      continue;
    }

    const cardId = String(row.id || '').trim() || uid();
    const existing = cardById.get(cardId) || null;
    const typeRaw = String(row.type || existing?.type || '').trim().toLowerCase();
    let options = [];
    if (Array.isArray(row.options)) {
      options = row.options
        .map(normalizeCsvOptionObject)
        .filter(Boolean);
    } else if (typeof row.options === 'string') {
      options = parseCsvOptions(row.options);
    }
    const type = typeRaw === 'mcq' || options.length > 1 ? 'mcq' : 'qa';
    if (type !== 'mcq') options = [];
    if (type === 'mcq' && !options.length) {
      options = [{ text: answer, correct: true }];
    }

    const migratedImagePayload = await buildCardImagePayloadForSave(
      cardId,
      getCardImageList(row, 'Q'),
      getCardImageList(row, 'A')
    );
    const questionTextAlign = normalizeTextAlign(
      row.questionTextAlign
      || row.textAlign
      || existing?.questionTextAlign
      || existing?.textAlign
      || 'center'
    );
    const answerTextAlign = normalizeTextAlign(
      row.answerTextAlign
      || row.textAlign
      || existing?.answerTextAlign
      || existing?.textAlign
      || 'center'
    );
    const optionsTextAlign = normalizeTextAlign(
      row.optionsTextAlign
      || existing?.optionsTextAlign
      || 'center'
    );
    const createdAt = existing?.meta?.createdAt || existing?.createdAt || nowIso;
    const nextCard = {
      ...(existing || {}),
      ...row,
      id: cardId,
      topicId: String(topic.id || '').trim(),
      type,
      prompt,
      answer,
      options,
      textAlign: questionTextAlign,
      questionTextAlign,
      answerTextAlign,
      optionsTextAlign,
      ...migratedImagePayload,
      createdAt,
      meta: {
        ...(existing?.meta || {}),
        createdAt,
        updatedAt: nowIso
      }
    };
    await put('cards', nextCard);
    await putCardBank(nextCard);
    cardById.set(cardId, nextCard);
    importedCards += 1;
  }

  for (const row of parsed.progress) {
    const safeRow = (row && typeof row === 'object') ? row : {};
    const cardId = String(safeRow.cardId || '').trim();
    if (!cardId) continue;
    await put('progress', { ...safeRow, cardId });
    importedProgress += 1;
  }

  progressByCardId = new Map();
  const skippedNote = skippedCards > 0 ? `\nSkipped cards: ${skippedCards}` : '';
  alert(
    `JSON import complete.\nImported cards: ${importedCards}\nImported progress: ${importedProgress}\nCreated subjects: ${createdSubjects}\nCreated topics: ${createdTopics}${skippedNote}`
  );
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
 * @function isContentExchangeBusy
 * @description Returns true while loading/importing/deleting operations are active.
 */

function isContentExchangeBusy() {
  return contentExchangeLoading || contentExchangeImporting || contentExchangeDeleting;
}

/**
 * @function setContentExchangeBusyState
 * @description Locks/unlocks content-exchange controls while loading/importing.
 */

function setContentExchangeBusyState() {
  const busy = isContentExchangeBusy();
  const panel = el('contentExchangePanel');
  const closeBtn = el('closeContentExchangeBtn');
  const reloadBtn = el('reloadContentExchangeBtn');
  if (panel) panel.dataset.busy = busy ? '1' : '0';
  if (closeBtn) closeBtn.disabled = busy;
  if (reloadBtn) reloadBtn.disabled = busy;
  if (panel) {
    panel.querySelectorAll('.exchange-import-btn').forEach(btn => { btn.disabled = busy; });
    panel.querySelectorAll('.exchange-select-all-btn, .exchange-clear-selection-btn, .exchange-import-selected-btn, .content-exchange-card-check, .exchange-admin-edit-btn, .exchange-admin-delete-btn, .exchange-admin-delete-selected-btn')
      .forEach(node => { node.disabled = busy; });
  }
  if (!busy) refreshAllContentExchangeTopicSelectionUi();
}

/**
 * @function closeContentExchangeDialog
 * @description Closes the content-exchange dialog when no task is running.
 */

function closeContentExchangeDialog() {
  const panel = el('contentExchangePanel');
  if (!panel) return;
  if (panel.dataset.busy === '1') return;
  setContentExchangeModalOpenState(false);
  const fallbackView = currentView === 4 ? 0 : currentView;
  const returnView = Number.isFinite(Number(contentExchangeReturnView))
    ? Math.trunc(Number(contentExchangeReturnView))
    : fallbackView;
  setView(returnView === 4 ? 0 : returnView);
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

  const previewBtn = document.createElement('button');
  previewBtn.className = 'btn card-preview-btn content-exchange-card-preview-btn';
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview';
  previewBtn.setAttribute('aria-label', 'Open card preview');
  previewBtn.addEventListener('click', event => {
    event.stopPropagation();
    if (typeof openCardPreviewDialog === 'function') openCardPreviewDialog(safeCard);
  });
  tile.appendChild(previewBtn);

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
  const busy = isContentExchangeBusy();

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
    const ownerId = String(user?.uid || '').trim();
    const ownerEsc = escapeHTML(ownerId);
    const isAdminEditing = contentExchangeIsAdmin && contentExchangeAdminEditOwnerIds.has(ownerId);
    const adminUserActions = contentExchangeIsAdmin
      ? `<div class="content-exchange-user-actions">
          <button class="btn btn-small exchange-admin-edit-btn"
            data-owner-id="${ownerEsc}"
            type="button">${isAdminEditing ? 'Done' : 'Edit'}</button>
        </div>`
      : '';

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
          `--subject-accent-glow:${hexToRgba(accent, 0.34)}`,
          `--daily-review-subject-accent:${accent}`,
          `--daily-review-subject-accent-bg:${hexToRgba(accent, 0.14)}`,
          `--daily-review-subject-accent-glow:${hexToRgba(accent, 0.36)}`,
          `--daily-review-subject-accent-glow-soft:${hexToRgba(accent, 0.2)}`
        ].join(';');

        const topicHtml = topics.length
          ? topics.map(topic => {
            const cards = user.cardsByTopicId.get(topic.id) || [];
            const topicId = String(topic?.id || '').trim();
            const cardIds = cards
              .map(card => String(card?.id || '').trim())
              .filter(Boolean);
            const selectedSet = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
            const selectedCount = cardIds.reduce((sum, id) => sum + (selectedSet.has(id) ? 1 : 0), 0);
            const topicEsc = escapeHTML(topicId);

            const cardHtml = cards.length
              ? `<div class="content-exchange-card-list card-grid"
                  data-owner-id="${ownerEsc}"
                  data-topic-id="${topicEsc}"></div>`
              : '<div class="tiny content-exchange-card-list-empty">No cards in this topic.</div>';

            return `
              <details class="content-exchange-topic daily-review-subject-group">
                <summary class="daily-review-subject-toggle">
                  <div class="daily-review-subject-title-wrap">
                    <div class="daily-review-subject-title">${escapeHTML(topic.name || 'Untitled topic')}</div>
                    <div class="tiny">${cards.length} ${cards.length === 1 ? 'card' : 'cards'}</div>
                  </div>
                  <div class="content-exchange-summary-actions">
                    <button class="btn btn-small exchange-import-btn"
                      data-level="topic"
                      data-owner-id="${ownerEsc}"
                      data-id="${topicEsc}"
                      type="button">Import Topic</button>
                    <button class="btn btn-small delete exchange-admin-delete-btn"
                      data-level="topic"
                      data-owner-id="${ownerEsc}"
                      data-id="${topicEsc}"
                      type="button">Delete Topic</button>
                    <span class="daily-review-subject-chevron" aria-hidden="true">▾</span>
                  </div>
                </summary>
                <div class="content-exchange-topic-body daily-review-subject-topics">
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
                      <button class="btn btn-small delete exchange-admin-delete-selected-btn"
                        data-owner-id="${ownerEsc}"
                        data-topic-id="${topicEsc}"
                        type="button">Delete selected</button>
                    </div>
                  </div>
                  ${cardHtml}
                </div>
              </details>
            `;
          }).join('')
          : '<div class="tiny">No topics in this subject.</div>';

        return `
          <details class="content-exchange-subject daily-review-subject-group" style="${subjectStyle}">
            <summary class="daily-review-subject-toggle">
              <div class="daily-review-subject-title-wrap">
                <div class="daily-review-subject-title">${escapeHTML(subject.name || 'Untitled subject')}</div>
                <div class="tiny">${topics.length} ${topics.length === 1 ? 'topic' : 'topics'} • ${subjectCardCount} ${subjectCardCount === 1 ? 'card' : 'cards'}</div>
              </div>
              <div class="content-exchange-summary-actions">
                <button class="btn btn-small exchange-import-btn"
                  data-level="subject"
                  data-owner-id="${ownerEsc}"
                  data-id="${escapeHTML(subject.id)}"
                  type="button">Import Subject</button>
                <button class="btn btn-small delete exchange-admin-delete-btn"
                  data-level="subject"
                  data-owner-id="${ownerEsc}"
                  data-id="${escapeHTML(subject.id)}"
                  type="button">Delete Subject</button>
                <span class="daily-review-subject-chevron" aria-hidden="true">▾</span>
              </div>
            </summary>
            <div class="content-exchange-topic-list daily-review-subject-topics">${topicHtml}</div>
          </details>
        `;
      }).join('')
      : '<div class="tiny">This user has no subjects.</div>';

    return `
      <div class="content-exchange-user${isAdminEditing ? ' is-admin-editing' : ''}" data-owner-id="${ownerEsc}">
        <div class="content-exchange-user-header">
          <div>
            <div class="content-exchange-user-name">${escapeHTML(user.displayName || 'Unnamed user')}</div>
            <div class="tiny">${user.subjects.length} ${user.subjects.length === 1 ? 'subject' : 'subjects'} • ${user.topics.length} ${user.topics.length === 1 ? 'topic' : 'topics'} • ${user.cards.length} ${user.cards.length === 1 ? 'card' : 'cards'}</div>
          </div>
          ${adminUserActions}
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
    await resolveContentExchangeAdminState();
    appendContentExchangeLogLine(`Authenticated as uid=${ownerId.slice(0, 8)}...`);
    appendContentExchangeLogLine(`Admin mode: ${contentExchangeIsAdmin ? 'enabled' : 'disabled'}.`);

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
    pruneContentExchangeAdminEditOwners();
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
      if (contentExchangeIsAdmin) {
        setContentExchangePolicyHint(
          'Admin mode enabled. Use Edit on each user block to reveal delete controls (requires matching DELETE RLS policy).'
        );
      } else {
        setContentExchangePolicyHint(
          'Import works by copying selected rows into your account (same ids, your uid).'
        );
      }
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
 * @function buildContentExchangeDeleteSelection
 * @description Expands one delete action (subject/topic/cards) into concrete record ids to remove.
 */

function buildContentExchangeDeleteSelection(sourceUser, level = '', entityId = '', options = {}) {
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
    sourceUser.cards.forEach(card => {
      if (String(card?.topicId || '').trim() !== safeEntityId) return;
      const cardId = String(card?.id || '').trim();
      if (cardId) cardIds.add(cardId);
    });
  } else if (safeLevel === 'cards') {
    const selectedCardIds = Array.isArray(opts.selectedCardIds)
      ? opts.selectedCardIds.map(value => String(value || '').trim()).filter(Boolean)
      : [];
    const selectedCardSet = new Set(selectedCardIds);
    if (!selectedCardSet.size) return { subjectIds: [], topicIds: [], cardIds: [] };
    sourceUser.cards.forEach(card => {
      if (String(card?.topicId || '').trim() !== safeEntityId) return;
      const cardId = String(card?.id || '').trim();
      if (!cardId || !selectedCardSet.has(cardId)) return;
      cardIds.add(cardId);
    });
  }

  return {
    subjectIds: Array.from(subjectIds).filter(Boolean),
    topicIds: Array.from(topicIds).filter(Boolean),
    cardIds: Array.from(cardIds).filter(Boolean)
  };
}

/**
 * @function deleteContentExchangeRowsByKey
 * @description Deletes rows for one store/source uid/key-list in batches and returns deleted row count.
 */

async function deleteContentExchangeRowsByKey(store = '', sourceUid = '', keys = [], options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const log = typeof opts.log === 'function' ? opts.log : null;
  const safeStore = String(store || '').trim();
  const safeSourceUid = String(sourceUid || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !safeSourceUid || !keyField) return 0;

  const uniqueKeys = Array.from(new Set((Array.isArray(keys) ? keys : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)));
  if (!uniqueKeys.length) return 0;

  const tenantColumn = String(supabaseTenantColumn || 'uid').trim() || 'uid';
  const chunks = chunkImageMigrationList(uniqueKeys, CONTENT_EXCHANGE_FETCH_BATCH_SIZE);
  let deleted = 0;

  for (let idx = 0; idx < chunks.length; idx += 1) {
    const chunk = chunks[idx];
    if (!chunk.length) continue;
    if (log) {
      log(`Deleting ${safeStore} batch ${idx + 1}/${chunks.length} (${chunk.length} row(s))...`);
    }
    let query = supabaseClient
      .from(SUPABASE_TABLE)
      .delete()
      .eq('store', safeStore)
      .eq(tenantColumn, safeSourceUid);
    if (chunk.length === 1) query = query.eq('record_key', chunk[0]);
    else query = query.in('record_key', chunk);
    const { data, error } = await query.select('record_key');
    assertSupabaseSuccess(error, `Failed to delete ${safeStore} rows.`);
    deleted += Array.isArray(data) ? data.length : 0;
  }
  return deleted;
}

/**
 * @function deleteContentExchangeSelection
 * @description Deletes selected external records (admin-only).
 */

async function deleteContentExchangeSelection(level = '', sourceUid = '', entityId = '', options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const safeLevel = String(level || '').trim().toLowerCase();
  const safeSourceUid = String(sourceUid || '').trim();
  const safeEntityId = String(entityId || '').trim();
  if (!safeLevel || !safeSourceUid || !safeEntityId) return;
  if (isContentExchangeBusy()) return;
  if (!contentExchangeIsAdmin) {
    alert('Admin rights required.');
    return;
  }

  const snapshot = contentExchangeSnapshot;
  if (!snapshot?.usersById) return;
  const sourceUser = snapshot.usersById.get(safeSourceUid);
  if (!sourceUser) {
    appendContentExchangeLogLine(`Delete aborted: source user ${safeSourceUid} not found in snapshot.`);
    return;
  }
  if (sourceUser.isCurrentUser) {
    alert('Admin delete is only available for other users.');
    return;
  }

  const selection = buildContentExchangeDeleteSelection(sourceUser, safeLevel, safeEntityId, opts);
  if (!selection.subjectIds.length && !selection.topicIds.length && !selection.cardIds.length) {
    appendContentExchangeLogLine(`Delete aborted: no records resolved for ${safeLevel} "${safeEntityId}".`);
    return;
  }

  const expectedCards = selection.cardIds.length;
  const expectedTopics = selection.topicIds.length;
  const expectedSubjects = selection.subjectIds.length;

  contentExchangeDeleting = true;
  setContentExchangeBusyState();
  setContentExchangeStatusText(`Deleting ${safeLevel}...`);
  const startedAt = performance.now();
  appendContentExchangeLogLine(
    `Delete started (${safeLevel}): subjects=${expectedSubjects}, topics=${expectedTopics}, cards=${expectedCards}.`
  );

  try {
    await initSupabaseBackend();
    await resolveSupabaseTenantColumn();
    const ownerId = await getSupabaseOwnerId();
    if (ownerId === safeSourceUid) {
      throw new Error('Refusing to delete your own rows via admin exchange action.');
    }

    const adminStillValid = await resolveContentExchangeAdminState();
    if (!adminStillValid) {
      throw new Error('Admin role check failed. Please sign in with an admin account.');
    }

    const deletedProgress = await deleteContentExchangeRowsByKey('progress', safeSourceUid, selection.cardIds, { log: appendContentExchangeLogLine });
    const deletedCardBank = await deleteContentExchangeRowsByKey('cardbank', safeSourceUid, selection.cardIds, { log: appendContentExchangeLogLine });
    const deletedCards = await deleteContentExchangeRowsByKey('cards', safeSourceUid, selection.cardIds, { log: appendContentExchangeLogLine });
    const deletedTopics = await deleteContentExchangeRowsByKey('topics', safeSourceUid, selection.topicIds, { log: appendContentExchangeLogLine });
    const deletedSubjects = await deleteContentExchangeRowsByKey('subjects', safeSourceUid, selection.subjectIds, { log: appendContentExchangeLogLine });

    if (expectedCards > 0 && deletedCards <= 0) {
      throw new Error('No cards were deleted. Supabase DELETE policy may still block cross-user deletes.');
    }
    if (safeLevel === 'topic' && expectedTopics > 0 && deletedTopics <= 0) {
      throw new Error('No topic row was deleted. Supabase DELETE policy may still block cross-user deletes.');
    }
    if (safeLevel === 'subject' && expectedSubjects > 0 && deletedSubjects <= 0) {
      throw new Error('No subject row was deleted. Supabase DELETE policy may still block cross-user deletes.');
    }

    appendContentExchangeLogLine(
      `Delete done in ${formatImageMigrationDurationMs(performance.now() - startedAt)}. Deleted subjects=${deletedSubjects}, topics=${deletedTopics}, cards=${deletedCards}, cardbank=${deletedCardBank}, progress=${deletedProgress}.`
    );
    setContentExchangeStatusText('Delete finished. Refreshing exchange tree...');
    await reloadContentExchangeTree({ preserveLog: true });
  } catch (err) {
    const message = String(err?.message || 'Unknown error');
    appendContentExchangeLogLine(`Delete failed: ${message}`);
    setContentExchangeStatusText('Delete failed. See log output.');
    console.error('Content exchange delete failed:', err);
  } finally {
    contentExchangeDeleting = false;
    setContentExchangeBusyState();
  }
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
  if (isContentExchangeBusy()) return;
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
  const importOverlayBase = safeLevel === 'subject'
    ? 'Importing subject'
    : 'Importing content';
  let importOverlayOpened = false;
  const setImportOverlayLabel = (text = '') => {
    const labelEl = el('appLoadingLabel');
    const safeText = String(text || '').trim();
    if (labelEl && safeText) {
      labelEl.textContent = safeText;
      return;
    }
    if (!importOverlayOpened && safeText) {
      setAppLoadingState(true, safeText);
      importOverlayOpened = true;
    }
  };
  const updateImportOverlayProgress = (done = 0, total = 1, phase = '') => {
    const safeTotal = Math.max(1, Math.trunc(Number(total) || 1));
    const safeDone = Math.max(0, Math.min(safeTotal, Math.trunc(Number(done) || 0)));
    const percent = Math.round((safeDone / safeTotal) * 100);
    const phaseText = String(phase || '').trim();
    const suffix = phaseText ? ` • ${phaseText}` : '';
    const label = `${importOverlayBase}... ${percent}%${suffix}`;
    if (!importOverlayOpened) {
      setAppLoadingState(true, label);
      importOverlayOpened = true;
      return;
    }
    setImportOverlayLabel(label);
  };
  updateImportOverlayProgress(0, 1, 'starting');
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

    const refreshUnits = 3; // refresh sidebar x2 + reload exchange tree
    const totalWorkUnits = Math.max(1, 1 + subjectRows.length + topicRows.length + cardRows.length + refreshUnits);
    let completedWorkUnits = 1; // payload fetch completed
    updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'writing subjects');

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
      completedWorkUnits += 1;
      updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'writing subjects');
    }

    updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'writing topics');
    for (let idx = 0; idx < topicRows.length; idx += 1) {
      const row = topicRows[idx];
      const id = String(row?.id || '').trim();
      if (!id) continue;
      appendContentExchangeLogLine(`[topic ${idx + 1}/${topicRows.length}] upsert ${id}`);
      await put('topics', stampImportedRecordMeta(row, safeSourceUid, nowIso), {
        uiBlocking: false,
        loadingLabel: ''
      });
      completedWorkUnits += 1;
      updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'writing topics');
    }

    let externalRefCount = 0;
    updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'writing cards');
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
      completedWorkUnits += 1;
      updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'writing cards');
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
    completedWorkUnits += 1;
    updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'refreshing sidebar');
    await refreshSidebar({ uiBlocking: false, force: true });
    // One extra pass avoids stale in-flight cache wins after heavy import runs.
    completedWorkUnits += 1;
    updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'refreshing sidebar');
    await refreshSidebar({ uiBlocking: false, force: true });
    if (selectedSubject) await loadTopics();
    if (selectedTopic) await loadDeck();
    completedWorkUnits += 1;
    updateImportOverlayProgress(completedWorkUnits, totalWorkUnits, 'finalizing');
    await reloadContentExchangeTree({ preserveLog: true });
    updateImportOverlayProgress(totalWorkUnits, totalWorkUnits, 'done');
  } catch (err) {
    const message = String(err?.message || 'Unknown error');
    appendContentExchangeLogLine(`Import failed: ${message}`);
    setContentExchangeStatusText('Import failed. See log output.');
    console.error('Content exchange import failed:', err);
  } finally {
    contentExchangeImporting = false;
    setContentExchangeBusyState();
    if (importOverlayOpened) setAppLoadingState(false);
  }
}

/**
 * @function handleContentExchangeTreeClick
 * @description Handles import button clicks inside the rendered tree.
 */

function handleContentExchangeTreeClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const adminEditBtn = target.closest('.exchange-admin-edit-btn');
  if (adminEditBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (isContentExchangeBusy()) return;
    if (!contentExchangeIsAdmin) return;
    const ownerId = String(adminEditBtn.dataset.ownerId || '').trim();
    if (!ownerId) return;
    const isEditing = contentExchangeAdminEditOwnerIds.has(ownerId)
      ? (contentExchangeAdminEditOwnerIds.delete(ownerId), false)
      : (contentExchangeAdminEditOwnerIds.add(ownerId), true);
    const userWrap = adminEditBtn.closest('.content-exchange-user');
    if (userWrap) userWrap.classList.toggle('is-admin-editing', isEditing);
    adminEditBtn.textContent = isEditing ? 'Done' : 'Edit';
    return;
  }

  const adminDeleteSelectedBtn = target.closest('.exchange-admin-delete-selected-btn');
  if (adminDeleteSelectedBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (isContentExchangeBusy()) return;
    if (!contentExchangeIsAdmin) return;
    const ownerId = String(adminDeleteSelectedBtn.dataset.ownerId || '').trim();
    const topicId = String(adminDeleteSelectedBtn.dataset.topicId || '').trim();
    const cardIds = getContentExchangeTopicCardIds(ownerId, topicId);
    const selected = getContentExchangeTopicSelectionSet(ownerId, topicId, cardIds);
    const selectedIds = cardIds.filter(id => selected.has(id));
    if (!selectedIds.length) {
      alert('Please select at least one card.');
      return;
    }
    const proceed = confirm(`Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? 'card' : 'cards'} from this source user?`);
    if (!proceed) return;
    void deleteContentExchangeSelection('cards', ownerId, topicId, { selectedCardIds: selectedIds });
    return;
  }

  const adminDeleteBtn = target.closest('.exchange-admin-delete-btn');
  if (adminDeleteBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (isContentExchangeBusy()) return;
    if (!contentExchangeIsAdmin) return;
    const level = String(adminDeleteBtn.dataset.level || '').trim().toLowerCase();
    const ownerId = String(adminDeleteBtn.dataset.ownerId || '').trim();
    const id = String(adminDeleteBtn.dataset.id || '').trim();
    if (!level || !ownerId || !id) return;
    const label = level === 'subject'
      ? 'this subject including all nested topics and cards'
      : 'this topic including all cards';
    const proceed = confirm(`Delete ${label} from the source user account?`);
    if (!proceed) return;
    void deleteContentExchangeSelection(level, ownerId, id);
    return;
  }

  const selectAllBtn = target.closest('.exchange-select-all-btn');
  if (selectAllBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (isContentExchangeBusy()) return;
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
    if (isContentExchangeBusy()) return;
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
    if (isContentExchangeBusy()) return;
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
  if (isContentExchangeBusy()) return;
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
  if (isContentExchangeBusy()) return;
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
  const panel = el('contentExchangePanel');
  if (!panel || panel.dataset.wired === '1') return;
  panel.dataset.wired = '1';
  const closeBtn = el('closeContentExchangeBtn');
  const reloadBtn = el('reloadContentExchangeBtn');
  const tree = el('contentExchangeTree');

  if (closeBtn) closeBtn.onclick = closeContentExchangeDialog;
  if (reloadBtn) reloadBtn.onclick = () => { void reloadContentExchangeTree(); };
  if (tree) tree.addEventListener('click', handleContentExchangeTreeClick);
  if (tree) tree.addEventListener('change', handleContentExchangeTreeChange);
}

/**
 * @function openContentExchangeDialog
 * @description Opens content-exchange dialog and loads latest cross-user tree snapshot.
 */

async function openContentExchangeDialog() {
  wireContentExchangeDialog();
  const panel = el('contentExchangePanel');
  const settingsDialog = el('settingsDialog');
  if (settingsDialog?.open) closeDialog(settingsDialog);
  if (panel) {
    if (currentView !== 4) {
      contentExchangeReturnView = currentView;
    }
    setView(4);
    setContentExchangeModalOpenState(true);
  }
  await reloadContentExchangeTree({ preserveLog: false });
}

// ============================================================================
