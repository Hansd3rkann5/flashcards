import type Database from 'better-sqlite3';
import type { StoreName } from '../types/stores.js';

type JsonObject = Record<string, unknown>;

function asObjectRecord(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function parsePayload(payload: string): JsonObject | null {
  try {
    return asObjectRecord(JSON.parse(payload));
  } catch {
    return null;
  }
}

function nowEpochMillis(): number {
  return Date.now();
}

export class RecordsRepository {
  constructor(private readonly db: Database.Database) {}

  listRecords(store: StoreName): JsonObject[] {
    const stmt = this.db.prepare(
      'SELECT payload FROM records WHERE store = ? ORDER BY updated_at ASC'
    );
    const rows = stmt.all(store) as Array<{ payload: string }>;
    const records: JsonObject[] = [];
    rows.forEach(row => {
      const parsed = parsePayload(String(row.payload || ''));
      if (parsed) records.push(parsed);
    });
    return records;
  }

  getRecord(store: StoreName, key: string): JsonObject | null {
    const stmt = this.db.prepare(
      'SELECT payload FROM records WHERE store = ? AND record_key = ? LIMIT 1'
    );
    const row = stmt.get(store, key) as { payload: string } | undefined;
    if (!row) return null;
    return parsePayload(String(row.payload || ''));
  }

  listRecordsByJsonField(store: StoreName, field: string, values: string[]): JsonObject[] {
    const cleaned = Array.from(new Set(
      values
        .map(value => String(value || '').trim())
        .filter(Boolean)
    ));
    if (!cleaned.length) return [];
    const placeholders = cleaned.map(() => '?').join(',');
    const query = `
      SELECT payload
      FROM records
      WHERE store = ?
        AND json_extract(payload, '$.${field}') IN (${placeholders})
      ORDER BY updated_at ASC
    `;
    try {
      const rows = this.db.prepare(query).all(store, ...cleaned) as Array<{ payload: string }>;
      const records: JsonObject[] = [];
      rows.forEach(row => {
        const parsed = parsePayload(String(row.payload || ''));
        if (parsed) records.push(parsed);
      });
      return records;
    } catch {
      const set = new Set(cleaned);
      return this.listRecords(store).filter(row => set.has(String(row[field] ?? '').trim()));
    }
  }

  countRecordsByStore(stores: StoreName[]): Record<StoreName, number> {
    const uniqueStores = Array.from(new Set(stores));
    const counts = Object.fromEntries(uniqueStores.map(store => [store, 0])) as Record<StoreName, number>;
    if (!uniqueStores.length) return counts;
    const placeholders = uniqueStores.map(() => '?').join(',');
    const query = `
      SELECT store, COUNT(*) AS count
      FROM records
      WHERE store IN (${placeholders})
      GROUP BY store
    `;
    const rows = this.db.prepare(query).all(...uniqueStores) as Array<{ store: StoreName; count: number }>;
    rows.forEach(row => {
      counts[row.store] = Number(row.count || 0);
    });
    return counts;
  }

  countCardsByTopicIds(topicIds: string[]): Record<string, number> {
    const cleaned = Array.from(new Set(topicIds.map(value => String(value || '').trim()).filter(Boolean)));
    if (!cleaned.length) return {};
    const placeholders = cleaned.map(() => '?').join(',');
    const query = `
      SELECT json_extract(payload, '$.topicId') AS topic_id, COUNT(*) AS count
      FROM records
      WHERE store = 'cards'
        AND json_extract(payload, '$.topicId') IN (${placeholders})
      GROUP BY topic_id
    `;
    try {
      const rows = this.db.prepare(query).all(...cleaned) as Array<{ topic_id: string; count: number }>;
      const counts: Record<string, number> = {};
      cleaned.forEach(topicId => {
        counts[topicId] = 0;
      });
      rows.forEach(row => {
        const topicId = String(row.topic_id || '').trim();
        if (!topicId) return;
        counts[topicId] = Number(row.count || 0);
      });
      return counts;
    } catch {
      const counts: Record<string, number> = {};
      cleaned.forEach(topicId => {
        counts[topicId] = 0;
      });
      const set = new Set(cleaned);
      this.listRecords('cards').forEach(card => {
        const topicId = String(card.topicId ?? '').trim();
        if (set.has(topicId)) counts[topicId] += 1;
      });
      return counts;
    }
  }

  upsertRecord(store: StoreName, key: string, payload: JsonObject): JsonObject {
    const serializedPayload = JSON.stringify(payload);
    const updatedAt = nowEpochMillis();
    this.db.prepare(`
      INSERT INTO records (store, record_key, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(store, record_key)
      DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).run(store, key, serializedPayload, updatedAt);
    return payload;
  }

  deleteRecord(store: StoreName, key: string): void {
    this.db
      .prepare('DELETE FROM records WHERE store = ? AND record_key = ?')
      .run(store, key);
  }
}
