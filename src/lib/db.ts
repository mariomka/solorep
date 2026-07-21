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

export interface ActiveSessionRecord {
  id: string; // always "current" -- singleton, one active session app-wide
  routineId: string;
  dayId: string;
  dayIndex: number;
  startedAt: number;
  currentStepIndex: number;
  swaps: Record<string, string>; // "itemIndex:memberIndex" -> alternative exercise key
  completed: Array<{
    stepIndex: number;
    slotKey: string; // stable planned occurrence: "itemIndex:memberIndex"
    primaryExerciseKey: string;
    exerciseKey: string; // effective key when the set was completed
    setIndex: number;
    reps?: number;
    duration?: number;
    weight?: number;
    completedAt: number;
  }>;
  updatedAt: number;
}

export const db = new Dexie("solorep") as Dexie & {
  routines: EntityTable<RoutineRecord, "id">;
  progress: EntityTable<ProgressRecord, "routineId">;
  lastUsed: EntityTable<LastUsedRecord, "exerciseKey">;
  sessions: EntityTable<SessionRecord, "id">;
  activeSession: EntityTable<ActiveSessionRecord, "id">;
};

db.version(1).stores({
  routines: "id, importedAt",
  progress: "routineId",
  lastUsed: "exerciseKey",
  sessions: "++id, routineId, finishedAt",
  activeSession: "id",
});
