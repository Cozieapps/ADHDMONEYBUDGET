import { db } from '../data/db';

// Where the Sori Worker lives. Set at build time (VITE_API_URL) or in Settings → Sync.

const KEY = 'sori.bloom.apiUrl';

export function apiUrl(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // Storage unavailable; fall back to the build-time value.
  }
  return (stored || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
}

export function setApiUrl(url: string): void {
  if (db.name === 'sori-bloom-preview') throw new Error('Sample previews cannot change your personal server connection.');
  try {
    if (url.trim()) localStorage.setItem(KEY, url.trim().replace(/\/+$/, ''));
    else localStorage.removeItem(KEY);
  } catch {
    // Ignore: the value just won't persist.
  }
}

export function connectorUrl(): string | undefined {
  const base = apiUrl();
  return base ? `${base}/mcp` : undefined;
}
