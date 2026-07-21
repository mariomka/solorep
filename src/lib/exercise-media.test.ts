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

  it("returns undefined for an unknown media id", () => {
    expect(getExerciseGifUrl("9999999")).toBeUndefined();
  });

  it("resolves every media id used by the sample routine", () => {
    const mediaIds = Object.values(fullbody3d.exercises)
      .map((entry) => ("media" in entry ? entry.media : undefined))
      .filter((mediaId): mediaId is string => mediaId !== undefined);

    expect(mediaIds.length).toBeGreaterThan(0);
    for (const mediaId of mediaIds) {
      expect(getExerciseGifUrl(mediaId), mediaId).toBeDefined();
    }
  });
});
