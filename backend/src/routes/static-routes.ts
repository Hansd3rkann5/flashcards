import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const STATIC_EXTENSIONS = [
  '.html',
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.ico',
  '.webp',
  '.json',
  '.txt',
  '.map',
  '.woff',
  '.woff2',
  '.ttf'
];

function shouldFallbackToIndex(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false;
  if (pathname === '/api') return false;
  const hasExtension = STATIC_EXTENSIONS.some(ext => pathname.toLowerCase().endsWith(ext));
  return !hasExtension;
}

export function mountStaticRoutes(app: express.Express, webRoot: string): void {
  app.use(express.static(webRoot, {
    index: false,
    fallthrough: true
  }));

  app.get('*', (req, res, next) => {
    if (!shouldFallbackToIndex(req.path)) return next();
    const indexPath = resolve(webRoot, 'index.html');
    if (!existsSync(indexPath)) {
      res.status(500).json({ error: `Missing index.html under web root: ${webRoot}` });
      return;
    }
    res.sendFile(indexPath);
  });
}
