import express from 'express';
import { getStoreKeyField, isStoreName } from '../types/stores.js';
function parseRepeatedQueryValues(value) {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)));
    }
    const single = String(value || '').trim();
    return single ? [single] : [];
}
function parseFieldsQuery(value) {
    const raw = Array.isArray(value)
        ? value.map(item => String(item || '')).join(',')
        : String(value || '');
    const fields = raw.split(',').map(field => field.trim()).filter(Boolean);
    const unique = [];
    fields.forEach(field => {
        if (!/^[A-Za-z0-9_]+$/.test(field))
            return;
        if (!unique.includes(field))
            unique.push(field);
    });
    return unique;
}
function parseRequestBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        const error = new Error('JSON body must be an object.');
        error.status = 400;
        throw error;
    }
    return body;
}
function sendNotFound(res, message = 'Not found') {
    res.status(404).json({ error: message });
}
function withApiErrorHandling(handler) {
    return (req, res) => {
        try {
            handler(req, res);
        }
        catch (error) {
            const status = Number(error?.status || 500);
            const message = error?.message || 'Internal server error.';
            res.status(status).json({ error: message });
        }
    };
}
function projectCardFields(rows, fields) {
    if (!fields.length)
        return rows;
    return rows.map(row => {
        const projected = {};
        fields.forEach(field => {
            if (Object.hasOwn(row, field))
                projected[field] = row[field];
        });
        return projected;
    });
}
function listStoreRows(repo, store, req) {
    if (store === 'topics') {
        const subjectIds = parseRepeatedQueryValues(req.query.subjectId);
        const includeCounts = ['1', 'true', 'yes', 'on'].includes(String(req.query.includeCounts || '').toLowerCase());
        let rows = subjectIds.length
            ? repo.listRecordsByJsonField('topics', 'subjectId', subjectIds)
            : repo.listRecords('topics');
        if (!includeCounts)
            return rows;
        const topicIds = rows.map(topic => String(topic.id || '').trim()).filter(Boolean);
        const countsByTopicId = repo.countCardsByTopicIds(topicIds);
        rows = rows.map(topic => {
            const topicId = String(topic.id || '').trim();
            return {
                ...topic,
                cardCount: Number(countsByTopicId[topicId] || 0)
            };
        });
        return rows;
    }
    if (store === 'cards') {
        const cardIds = parseRepeatedQueryValues(req.query.cardId);
        const topicIds = parseRepeatedQueryValues(req.query.topicId);
        const fields = parseFieldsQuery(req.query.fields);
        let rows;
        if (cardIds.length)
            rows = repo.listRecordsByJsonField('cards', 'id', cardIds);
        else if (topicIds.length)
            rows = repo.listRecordsByJsonField('cards', 'topicId', topicIds);
        else
            rows = repo.listRecords('cards');
        return projectCardFields(rows, fields);
    }
    if (store === 'progress') {
        const cardIds = parseRepeatedQueryValues(req.query.cardId);
        if (cardIds.length)
            return repo.listRecordsByJsonField('progress', 'cardId', cardIds);
        return repo.listRecords('progress');
    }
    return repo.listRecords(store);
}
export function createApiRouter(repo) {
    const router = express.Router();
    router.use(express.json({ limit: '30mb' }));
    router.options('*', (_req, res) => {
        res.status(204).end();
    });
    router.get('/health', (_req, res) => {
        res.json({ ok: true });
    });
    router.get('/stats', withApiErrorHandling((_req, res) => {
        const counts = repo.countRecordsByStore(['subjects', 'topics', 'cards']);
        res.json({
            subjects: Number(counts.subjects || 0),
            topics: Number(counts.topics || 0),
            cards: Number(counts.cards || 0)
        });
    }));
    router.get('/:store/:key', withApiErrorHandling((req, res) => {
        const storeRaw = String(req.params.store || '').trim();
        if (!isStoreName(storeRaw))
            return sendNotFound(res, `Unknown store: ${storeRaw}`);
        const key = decodeURIComponent(String(req.params.key || '').trim());
        if (!key)
            return sendNotFound(res);
        const row = repo.getRecord(storeRaw, key);
        if (!row)
            return sendNotFound(res);
        res.json(row);
    }));
    router.get('/:store', withApiErrorHandling((req, res) => {
        const storeRaw = String(req.params.store || '').trim();
        if (!isStoreName(storeRaw))
            return sendNotFound(res, `Unknown store: ${storeRaw}`);
        const rows = listStoreRows(repo, storeRaw, req);
        res.json(rows);
    }));
    router.put('/:store', withApiErrorHandling((req, res) => {
        const storeRaw = String(req.params.store || '').trim();
        if (!isStoreName(storeRaw))
            return sendNotFound(res, `Unknown store: ${storeRaw}`);
        const payload = parseRequestBody(req.body);
        const keyField = getStoreKeyField(storeRaw);
        const key = String(payload[keyField] ?? '').trim();
        if (!key) {
            res.status(400).json({ error: `Missing key field "${keyField}" for store "${storeRaw}".` });
            return;
        }
        const updated = repo.upsertRecord(storeRaw, key, payload);
        res.json(updated);
    }));
    router.delete('/:store/:key', withApiErrorHandling((req, res) => {
        const storeRaw = String(req.params.store || '').trim();
        if (!isStoreName(storeRaw))
            return sendNotFound(res, `Unknown store: ${storeRaw}`);
        const key = decodeURIComponent(String(req.params.key || '').trim());
        if (!key) {
            res.status(204).end();
            return;
        }
        repo.deleteRecord(storeRaw, key);
        res.status(204).end();
    }));
    return router;
}
