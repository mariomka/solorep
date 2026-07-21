// Regenerates src/lib/exercise-media-map.json from the exercises-dataset repo,
// pinned to a specific commit so a force-push upstream cannot break GIF URLs.
// Run with: bun scripts/generate-media-map.ts [commit-sha]

import { writeFileSync } from "node:fs";

const DEFAULT_COMMIT = "7455efae41b330c265e7cd4b78dfa848e7ce5ebd";

interface DatasetExercise {
  id: string;
  gif_url: string;
}

const commit = process.argv[2] ?? DEFAULT_COMMIT;
const datasetUrl = `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/${commit}/data/exercises.json`;

const response = await fetch(datasetUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch dataset: ${response.status} ${datasetUrl}`);
}

const exercises = (await response.json()) as DatasetExercise[];

const files: Record<string, string> = {};
for (const exercise of exercises) {
  const gifFileName = exercise.gif_url.replace(/^videos\//, "");
  files[exercise.id] = gifFileName;
}

const map = { commit, files };
const outputPath = new URL(
  "../src/lib/exercise-media-map.json",
  import.meta.url,
).pathname;
writeFileSync(outputPath, `${JSON.stringify(map, null, 2)}\n`);

console.log(`Wrote ${Object.keys(files).length} entries to ${outputPath}`);
