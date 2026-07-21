import { db } from "@/lib/db";

export async function clearDatabase(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()));
}

export function makeRoutineFile(data: unknown): File {
  return new File([JSON.stringify(data)], "routine.json", {
    type: "application/json",
  });
}

export function makeMalformedRoutineFile(): File {
  return new File(["{ not json"], "routine.json", {
    type: "application/json",
  });
}
