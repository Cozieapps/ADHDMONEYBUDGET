import { type Snapshot, today as todayOf } from '@sori/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { db } from './db';
import { buildSnapshot, ensureSeeded } from './repo';

interface DataState {
  snapshot: Snapshot;
  today: string;
  ready: boolean;
}

const DataContext = createContext<DataState | null>(null);

/** Today's date, refreshed when the app comes back to the foreground or crosses midnight. */
function useToday(): string {
  const [today, setToday] = useState(() => todayOf());
  useEffect(() => {
    const refresh = () => setToday(todayOf());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const records = useLiveQuery(() => db.records.toArray(), []);
  const today = useToday();
  useEffect(() => {
    void ensureSeeded();
  }, []);
  const value = useMemo<DataState>(
    () => ({ snapshot: buildSnapshot(records ?? []), today, ready: records !== undefined }),
    [records, today],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside <DataProvider>');
  return value;
}
