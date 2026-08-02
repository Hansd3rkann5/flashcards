import cors from 'cors';
import express from 'express';
import { readConfig } from './config/env.js';
import { createDatabase } from './db/sqlite.js';
import { RecordsRepository } from './repositories/records-repository.js';
import { createApiRouter } from './routes/api-routes.js';
import { mountStaticRoutes } from './routes/static-routes.js';
function main() {
    const config = readConfig();
    const db = createDatabase(config.dbPath);
    const repo = new RecordsRepository(db);
    const app = express();
    app.use(cors({
        origin: '*',
        methods: ['GET', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type']
    }));
    app.use('/api', createApiRouter(repo));
    mountStaticRoutes(app, config.webRoot);
    app.listen(config.port, config.host, () => {
        const urlHost = config.host === '0.0.0.0' ? '127.0.0.1' : config.host;
        // eslint-disable-next-line no-console
        console.log(`[flashcards-backend] running on http://${urlHost}:${config.port}`);
        // eslint-disable-next-line no-console
        console.log(`[flashcards-backend] app root: ${config.appRoot}`);
        // eslint-disable-next-line no-console
        console.log(`[flashcards-backend] web root: ${config.webRoot}`);
        // eslint-disable-next-line no-console
        console.log(`[flashcards-backend] db path: ${config.dbPath}`);
    });
}
main();
