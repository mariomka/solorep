import Dexie, { type EntityTable } from "dexie";
import type { Routine } from "@/lib/routine-schema";

export interface RoutineRecord {
  id: string;
  routine: Routine;
  importedAt: number;
}

export interface ProgressRecord {
  routineId: string;
  currentDayIndex: number;
}

export interface LastUsedRecord {
  exerciseKey: string;
  sets: Array<{ reps?: number; duration?: number; weight?: number }>;
  updatedAt: number;
}

export interface SessionRecord {
  id?: number;
  routineId: string;
  dayId: string;
  startedAt: number;
  finishedAt: number;
  entries: Array<{
    exerciseKey: string;
    setIndex: number;
    reps?: number;
    duration?: number;
    weight?: number;
    completedAt: number;
  }>;
}

export const db = new Dexie("solorep") as Dexie & {
  routines: EntityTable<RoutineRecord, "id">;
  progress: EntityTable<ProgressRecord, "routineId">;
  lastUsed: EntityTable<LastUsedRecord, "exerciseKey">;
  sessions: EntityTable<SessionRecord, "id">;
};

db.version(1).stores({
  routines: "id, importedAt",
  progress: "routineId",
  lastUsed: "exerciseKey",
  sessions: "++id, routineId, finishedAt",
});
