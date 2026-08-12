import {
  db,
  type LastUsedRecord,
  type ProgressRecord,
  type RoutineRecord,
  type SessionRecord,
} from "@/lib/db";

export interface ExportEnvelope {
  version: number;
  exportedAt: string;
  data: {
    routines: RoutineRecord[];
    progress: ProgressRecord[];
    sessions: SessionRecord[];
    lastUsed: LastUsedRecord[];
  };
}

/**
 * Read-only snapshot of every durable table. `activeSession` is execution-only
 * state and deliberately excluded: an in-flight workout is not data worth
 * carrying to another device.
 */
export async function buildExportEnvelope(): Promise<ExportEnvelope> {
  const [routines, progress, sessions, lastUsed] = await db.transaction(
    "r",
    [db.routines, db.progress, db.sessions, db.lastUsed],
    () =>
      Promise.all([
        db.routines.toArray(),
        db.progress.toArray(),
        db.sessions.toArray(),
        db.lastUsed.toArray(),
      ]),
  );

  return {
    version: db.verno,
    exportedAt: new Date().toISOString(),
    data: { routines, progress, sessions, lastUsed },
  };
}
