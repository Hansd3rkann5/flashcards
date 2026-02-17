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

// ============================================================================
