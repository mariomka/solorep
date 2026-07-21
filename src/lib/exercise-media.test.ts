import { describe, expect, it } from "vitest";
import fullbody3d from "../../examples/fullbody-3d.json";
import { getExerciseGifUrl } from "./exercise-media";

describe("getExerciseGifUrl", () => {
  it("builds a pinned jsDelivr URL for a known media id", () => {
    const url = getExerciseGifUrl("0025");

    expect(url).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/gh\/hasaneyldrm\/exercises-dataset@[0-9a-f]{40}\/videos\/0025-\w+\.gif$/,
    );
  });

  it("returns undefined for an unknown dataset id", () => {
    expect(getExerciseGifUrl("9999999")).toBeUndefined();
  });

  it("resolves every dataset id used by the sample routine", () => {
    const datasetIds = Object.values(fullbody3d.exercises)
      .map((entry) => ("datasetId" in entry ? entry.datasetId : undefined))
      .filter((datasetId): datasetId is string => datasetId !== undefined);

    expect(datasetIds.length).toBeGreaterThan(0);
    for (const datasetId of datasetIds) {
      expect(getExerciseGifUrl(datasetId), datasetId).toBeDefined();
    }
  });
});
