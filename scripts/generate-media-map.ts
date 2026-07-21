// Regenerates src/lib/exercise-media-map.json and
// src/lib/exercise-instructions-map.json from the exercises-dataset repo,
// pinned to a specific commit so a force-push upstream cannot break GIF URLs.
// Run with: bun scripts/generate-media-map.ts [commit-sha]

import { writeFileSync } from "node:fs";

const DEFAULT_COMMIT = "7455efae41b330c265e7cd4b78dfa848e7ce5ebd";

interface DatasetExercise {
  id: string;
  gif_url: string;
  instruction_steps?: {
    es?: string[];
  };
}

const commit = process.argv[2] ?? DEFAULT_COMMIT;
const datasetUrl = `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/${commit}/data/exercises.json`;

const response = await fetch(datasetUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch dataset: ${response.status} ${datasetUrl}`);
}

const exercises = (await response.json()) as DatasetExercise[];

const files: Record<string, string> = {};
const instructions: Record<string, string[]> = {};
for (const exercise of exercises) {
  const gifFileName = exercise.gif_url.replace(/^videos\//, "");
  files[exercise.id] = gifFileName;

  const spanishSteps = exercise.instruction_steps?.es;
  const hasSpanishSteps =
    Array.isArray(spanishSteps) && spanishSteps.length > 0;
  if (hasSpanishSteps) {
    instructions[exercise.id] = spanishSteps;
  }
}

const mediaMap = { commit, files };
const mediaMapPath = new URL(
  "../src/lib/exercise-media-map.json",
  import.meta.url,
).pathname;
writeFileSync(mediaMapPath, `${JSON.stringify(mediaMap, null, 2)}\n`);
console.log(`Wrote ${Object.keys(files).length} entries to ${mediaMapPath}`);

const instructionsMap = { commit, instructions };
const instructionsMapPath = new URL(
  "../src/lib/exercise-instructions-map.json",
  import.meta.url,
).pathname;
writeFileSync(
  instructionsMapPath,
  `${JSON.stringify(instructionsMap, null, 2)}\n`,
);
console.log(
  `Wrote ${Object.keys(instructions).length} entries to ${instructionsMapPath}`,
);
