import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fullbody3d from "../../examples/fullbody-3d.json";
import {
  getExerciseInstructions,
  useExerciseInstructions,
} from "./exercise-instructions";

describe("getExerciseInstructions", () => {
  it("resolves every dataset id used by the sample routine to Spanish steps", async () => {
    const datasetIds = Object.values(fullbody3d.exercises)
      .map((entry) => ("datasetId" in entry ? entry.datasetId : undefined))
      .filter((datasetId): datasetId is string => datasetId !== undefined);

    expect(datasetIds.length).toBeGreaterThan(0);
    for (const datasetId of datasetIds) {
      const instructions = await getExerciseInstructions(datasetId);

      expect(instructions, datasetId).toBeDefined();
      expect(instructions?.length, datasetId).toBeGreaterThan(0);
      for (const step of instructions ?? []) {
        expect(typeof step, datasetId).toBe("string");
        expect(step.length, datasetId).toBeGreaterThan(0);
      }
    }
  });

  it("resolves undefined for an unknown dataset id", async () => {
    await expect(getExerciseInstructions("9999999")).resolves.toBeUndefined();
  });
});

describe("useExerciseInstructions", () => {
  it("returns undefined while loading, then the instructions", async () => {
    const { result } = renderHook(() => useExerciseInstructions("0025"));

    expect(result.current).toBeUndefined();

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });
    expect(result.current?.length).toBeGreaterThan(0);
  });

  it("stays undefined when datasetId is undefined", async () => {
    const { result } = renderHook(() => useExerciseInstructions(undefined));

    expect(result.current).toBeUndefined();

    // Give any stray async work a chance to settle before asserting.
    await Promise.resolve();
    expect(result.current).toBeUndefined();
  });

  it("loads new instructions when datasetId changes", async () => {
    const { result, rerender } = renderHook(
      ({ datasetId }: { datasetId: string }) =>
        useExerciseInstructions(datasetId),
      { initialProps: { datasetId: "0025" } },
    );

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });
    const firstInstructions = result.current;

    rerender({ datasetId: "0043" });

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });
    expect(result.current).not.toEqual(firstInstructions);
  });
});

describe("chunk load failure", () => {
  it("does not cache the failure: the hook stays undefined and the next call retries", async () => {
    // A fresh module instance with the JSON chunk import failing, so the
    // module-level cache of the already-loaded instance stays untouched.
    vi.resetModules();
    vi.doMock("./exercise-instructions-map.json", () => {
      throw new Error("chunk load failed");
    });
    const freshModule = await import("./exercise-instructions");

    // Vitest wraps factory errors in its own message: only the rejection
    // itself matters here.
    await expect(freshModule.getExerciseInstructions("0025")).rejects.toThrow();

    // The hook swallows the rejection: instructions stay undefined.
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result } = renderHook(() =>
      freshModule.useExerciseInstructions("0025"),
    );
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to load the exercise instructions",
        expect.any(Error),
      );
    });
    expect(result.current).toBeUndefined();
    consoleErrorSpy.mockRestore();

    // The failed promise was dropped from the cache: once the import works
    // again, the same module instance retries and resolves.
    vi.doUnmock("./exercise-instructions-map.json");
    await expect(
      freshModule.getExerciseInstructions("0025"),
    ).resolves.toBeDefined();
  });
});
