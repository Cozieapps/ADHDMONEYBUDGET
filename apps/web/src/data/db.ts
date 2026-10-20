import Dexie, { type Table } from 'dexie';
import type { RecordKind, Source } from '@sori/core';

export interface StoredRecord {
  /** `${kind}:${id}` */
  key: string;
  kind: RecordKind;
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  source: Source;
  data: unknown;
  /** 1 while the change hasn't been pushed to the sync server yet. */
  dirty: 0 | 1;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

class SoriDatabase extends Dexie {
  records!: Table<StoredRecord, string>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super(new URLSearchParams(location.search).get('preview') === '1' ? 'sori-bloom-preview' : 'sori-bloom');
    this.version(1).stores({
      records: 'key, kind, dirty, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new SoriDatabase();
