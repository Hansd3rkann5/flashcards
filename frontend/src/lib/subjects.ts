import type { SubjectRecord } from './api';

export function normalizeHexColor(accent = '#2dd4bf'): string {
  const raw = String(accent || '#2dd4bf').replace('#', '').trim();
  if (!raw) return '#2dd4bf';
  const normalized = raw.length === 3
    ? raw.split('').map(char => char + char).join('')
    : raw.padEnd(6, '0').slice(0, 6);
  return `#${normalized}`;
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getSubjectLastEditedAt(subject: SubjectRecord): number {
  return toTimestamp(
    subject?.meta?.updatedAt
    ?? subject?.updatedAt
    ?? subject?.meta?.createdAt
    ?? subject?.createdAt
    ?? 0
  );
}

export function sortSubjectsByLastEdited(subjects: SubjectRecord[]): SubjectRecord[] {
  return [...subjects].sort((a, b) => {
    const tsDiff = getSubjectLastEditedAt(b) - getSubjectLastEditedAt(a);
    if (tsDiff !== 0) return tsDiff;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}
