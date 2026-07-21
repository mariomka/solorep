import { z } from "zod";
import { db } from "@/lib/db";
import { type Routine, routineSchema } from "@/lib/routine-schema";

export type ImportRoutineResult =
  | { ok: true; routine: Routine }
  | { ok: false; error: string };

export async function importRoutineFromFile(
  file: File,
): Promise<ImportRoutineResult> {
  const text = await file.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo no es JSON válido." };
  }

  const result = routineSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error) };
  }

  const routine = result.data;

  await db.transaction("rw", db.routines, db.progress, async () => {
    await db.routines.put({
      id: routine.id,
      routine,
      importedAt: Date.now(),
    });

    const existingProgress = await db.progress.get(routine.id);
    const hasProgress = existingProgress !== undefined;
    const isPointerOutOfRange =
      hasProgress && existingProgress.currentDayIndex >= routine.days.length;

    if (!hasProgress || isPointerOutOfRange) {
      await db.progress.put({ routineId: routine.id, currentDayIndex: 0 });
    }
  });

  return { ok: true, routine };
}

export async function deleteRoutine(routineId: string): Promise<void> {
  await db.transaction("rw", db.routines, db.progress, async () => {
    await db.routines.delete(routineId);
    await db.progress.delete(routineId);
  });
}
