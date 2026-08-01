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

/**
 * What an exercise is currently working at. Only the weight persists between
 * sessions: reps and duration are the routine's prescription, and the per-set
 * record of what was actually done lives in `sessions`.
 */
export interface LastUsedRecord {
  exerciseKey: string;
  weight?: number; // absent for bodyweight and duration-only work
  updatedAt: number;
}

/** `lastUsed` as stored by schema v1, read only by the v2 upgrade. */
interface LegacyLastUsedRecord {
  exerciseKey: string;
  sets?: Array<{ reps?: number; duration?: number; weight?: number }>;
  weight?: number;
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
  restEndsAt?: number; // epoch ms deadline of the running rest; absent outside rest
  swaps: Record<string, string>; // "itemIndex:memberIndex" -> alternative exercise key
  // Item indexes moved behind the rest of the work, in postponement order. The
  // effective item order is derived: pending items in natural order, with these
  // spliced in right before the day's first `cooldown` item (at the end of the
  // day when it has none). Absent on in-flight sessions = natural order.
  postponed?: number[];
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

// v2 collapses `lastUsed.sets` into a single weight per exercise. The rule the
// app had already converged on -- the last weight logged is what every set
// starts at -- becomes the shape. Deliberately self-contained: a migration is
// a snapshot of the past, so it must not follow the app's rules as they move.
db.version(2)
  .stores({ lastUsed: "exerciseKey" })
  .upgrade((transaction) =>
    transaction
      .table<LegacyLastUsedRecord>("lastUsed")
      .toCollection()
      .modify((record) => {
        const lastWeight = (record.sets ?? []).reduce<number | undefined>(
          (weight, set) => set.weight ?? weight,
          undefined,
        );
        const hasWeight = lastWeight !== undefined;
        if (hasWeight) {
          record.weight = lastWeight;
        }
        delete record.sets;
      }),
  );
