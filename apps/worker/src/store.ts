import { isValidRecord, RECORD_KINDS, type RecordKind, type RecordMeta, type RecordOf, type Snapshot, snapshotFromRecords } from '@sori/core';

export type Put = { [K in RecordKind]: { kind: K; record: RecordOf<K> } }[RecordKind];

export interface WireRecord {
  kind: RecordKind;
  id: string;
  data: RecordMeta;
  updatedAt: number;
  deletedAt: number | null;
  source: 'app' | 'claude';
}

interface Row {
  kind: string;
  id: string;
  data: string;
  updated_at: number;
  deleted_at: number | null;
  source: 'app' | 'claude';
  server_seq: number;
}

const UPSERT = `INSERT INTO records (kind, id, data, updated_at, deleted_at, source, server_seq)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(server_seq), 0) + 1 FROM records))
ON CONFLICT (kind, id) DO UPDATE SET
  data = excluded.data,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at,
  source = excluded.source,
  server_seq = excluded.server_seq
WHERE excluded.updated_at > records.updated_at`;

/** Writes records; for each one the newest `updatedAt` wins. Runs as one transaction. */
export async function putRecords(db: D1Database, records: WireRecord[]): Promise<void> {
  const valid = records.filter((r) => RECORD_KINDS.includes(r.kind) && typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 100);
  if (!valid.length) return;
  if (valid.some((r) => !isValidRecord(r.kind, { ...r.data, id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt, source: r.source }))) throw new Error('Invalid financial record. Check the amount and date.');
  for (let i = 0; i < valid.length; i += 100) {
    await db.batch(
      valid.slice(i, i + 100).map((r) =>
        db.prepare(UPSERT).bind(r.kind, r.id, JSON.stringify({ ...r.data, id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt, source: r.source }), r.updatedAt, r.deletedAt, r.source),
      ),
    );
  }
}

export async function changesSince(db: D1Database, cursor: number, limit = 500): Promise<{ changes: WireRecord[]; cursor: number; more: boolean }> {
  const { results } = await db.prepare('SELECT * FROM records WHERE server_seq > ?1 ORDER BY server_seq LIMIT ?2').bind(cursor, limit + 1).all<Row>();
  const more = results.length > limit;
  const page = results.slice(0, limit);
  return {
    changes: page.map(toWire),
    cursor: page.length ? page[page.length - 1]!.server_seq : cursor,
    more,
  };
}

function toWire(row: Row): WireRecord {
  return { kind: row.kind as RecordKind, id: row.id, data: JSON.parse(row.data) as RecordMeta, updatedAt: row.updated_at, deletedAt: row.deleted_at, source: row.source };
}

/** Everything that isn't deleted, as the engine's Snapshot. */
export async function loadSnapshot(db: D1Database): Promise<Snapshot> {
  const { results } = await db.prepare('SELECT kind, data FROM records WHERE deleted_at IS NULL').all<{ kind: RecordKind; data: string }>();
  return snapshotFromRecords(results.map((r) => ({ kind: r.kind, data: JSON.parse(r.data) as RecordMeta })));
}

/** Saves records made by Claude (source 'claude'), stamped now. */
export async function saveFromClaude(db: D1Database, items: Put[]): Promise<void> {
  const now = Date.now();
  await putRecords(
    db,
    items.map(({ kind, record }) => ({
      kind,
      id: record.id,
      data: { ...record, source: 'claude', updatedAt: Math.max(now, record.updatedAt + 1) },
      updatedAt: Math.max(now, record.updatedAt + 1),
      deletedAt: record.deletedAt ?? null,
      source: 'claude',
    })),
  );
}
