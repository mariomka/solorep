import { useEffect, useState } from "react";

// The instructions map is ~1MB of JSON: the dynamic import keeps it out of
// the main bundle as a separate lazy chunk, loaded once and cached.
let instructionsMapPromise: Promise<Record<string, string[]>> | undefined;

function loadInstructionsMap(): Promise<Record<string, string[]>> {
  if (instructionsMapPromise === undefined) {
    const loadPromise = import("./exercise-instructions-map.json").then(
      (module) => module.default.instructions,
    );
    // A failed chunk load (offline, deploy race) must not be cached forever:
    // drop the promise so the next call retries the import.
    loadPromise.catch(() => {
      const isStillCurrent = instructionsMapPromise === loadPromise;
      if (isStillCurrent) {
        instructionsMapPromise = undefined;
      }
    });
    instructionsMapPromise = loadPromise;
  }
  return instructionsMapPromise;
}

export async function getExerciseInstructions(
  datasetId: string,
): Promise<string[] | undefined> {
  const instructionsMap = await loadInstructionsMap();
  return instructionsMap[datasetId];
}

export function useExerciseInstructions(
  datasetId: string | undefined,
): string[] | undefined {
  const [instructions, setInstructions] = useState<string[] | undefined>(
    undefined,
  );

  useEffect(() => {
    setInstructions(undefined);

    const hasDatasetId = datasetId !== undefined;
    if (!hasDatasetId) {
      return;
    }

    let isActive = true;
    getExerciseInstructions(datasetId)
      .then((loadedInstructions) => {
        if (isActive) {
          setInstructions(loadedInstructions);
        }
      })
      .catch((error: unknown) => {
        // Instructions are optional UI sugar: on failure they stay undefined.
        console.error("Failed to load the exercise instructions", error);
      });

    return () => {
      isActive = false;
    };
  }, [datasetId]);

  return instructions;
}
