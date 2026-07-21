import { z } from "zod";

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const exerciseKeySchema = z
  .string()
  .regex(KEBAB_CASE, "exercise keys must be kebab-case");

const repsSetSchema = z.strictObject({
  reps: z.number().int().positive(),
  weight: z.number().positive().optional(),
});

const durationSetSchema = z.strictObject({
  duration: z.number().int().positive(),
  weight: z.number().positive().optional(),
});

export const setSchema = z.union([repsSetSchema, durationSetSchema]);

const restSchema = z.number().int().nonnegative();

const exerciseFields = {
  exercise: exerciseKeySchema,
  alternatives: z.array(exerciseKeySchema).optional(),
  sets: z.array(setSchema).min(1),
};

export const exerciseEntrySchema = z.strictObject({
  ...exerciseFields,
  rest: restSchema,
});

export const supersetMemberSchema = z.strictObject(exerciseFields);

export const supersetEntrySchema = z
  .strictObject({
    superset: z.array(supersetMemberSchema).min(2),
    rest: restSchema,
  })
  .refine(
    (entry) => {
      const rounds = entry.superset[0].sets.length;
      const allMembersMatchRounds = entry.superset.every(
        (member) => member.sets.length === rounds,
      );
      return allMembersMatchRounds;
    },
    { message: "all superset members must have the same number of sets" },
  );

export const dayItemSchema = z.union([
  exerciseEntrySchema,
  supersetEntrySchema,
]);

export const daySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  exercises: z.array(dayItemSchema).min(1),
});

export const catalogEntrySchema = z.strictObject({
  name: z.string().min(1),
  datasetId: z.string().optional(),
});

export const routineSchema = z
  .strictObject({
    id: z.string().regex(KEBAB_CASE, "routine id must be kebab-case"),
    name: z.string().min(1),
    description: z.string().optional(),
    exercises: z.record(exerciseKeySchema, catalogEntrySchema),
    days: z.array(daySchema).min(1),
  })
  .superRefine((routine, ctx) => {
    const knownKeys = new Set(Object.keys(routine.exercises));

    const reportUnknownKey = (key: string, path: (string | number)[]) => {
      const isKnown = knownKeys.has(key);
      if (!isKnown) {
        ctx.addIssue({
          code: "custom",
          message: `exercise key "${key}" is not defined in the exercises catalog`,
          path,
        });
      }
    };

    routine.days.forEach((day, dayIndex) => {
      day.exercises.forEach((item, itemIndex) => {
        const basePath = ["days", dayIndex, "exercises", itemIndex];
        const members = "superset" in item ? item.superset : [item];

        members.forEach((member) => {
          reportUnknownKey(member.exercise, basePath);
          member.alternatives?.forEach((alternative) => {
            reportUnknownKey(alternative, basePath);
          });
        });
      });
    });
  });

export type ExerciseSet = z.infer<typeof setSchema>;
export type ExerciseEntry = z.infer<typeof exerciseEntrySchema>;
export type SupersetMember = z.infer<typeof supersetMemberSchema>;
export type SupersetEntry = z.infer<typeof supersetEntrySchema>;
export type DayItem = z.infer<typeof dayItemSchema>;
export type RoutineDay = z.infer<typeof daySchema>;
export type Routine = z.infer<typeof routineSchema>;

export function parseRoutine(data: unknown): Routine {
  return routineSchema.parse(data);
}
