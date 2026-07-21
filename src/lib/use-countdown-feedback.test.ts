import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountdownFeedbackController } from "./countdown-feedback";
import { useCountdownFeedback } from "./use-countdown-feedback";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCountdownFeedback", () => {
  it("forwards active seconds and completion without cancelling the final cue", () => {
    const update = vi
      .spyOn(CountdownFeedbackController.prototype, "update")
      .mockResolvedValue(undefined);
    const reset = vi
      .spyOn(CountdownFeedbackController.prototype, "reset")
      .mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useCountdownFeedback());

    act(() => {
      result.current.notifySecond(6);
      result.current.notifySecond(5);
      result.current.notifySecond(0);
      result.current.notifyComplete();
    });
    unmount();

    expect(
      update.mock.calls.map(([remainingSeconds]) => remainingSeconds),
    ).toEqual([6, 5, 0]);
    expect(reset).not.toHaveBeenCalled();
  });

  it("cancels feedback when the countdown is abandoned", () => {
    vi.spyOn(CountdownFeedbackController.prototype, "update").mockResolvedValue(
      undefined,
    );
    const reset = vi
      .spyOn(CountdownFeedbackController.prototype, "reset")
      .mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useCountdownFeedback());

    act(() => {
      result.current.cancel();
    });
    unmount();

    expect(reset).toHaveBeenCalledTimes(2);
  });
});
