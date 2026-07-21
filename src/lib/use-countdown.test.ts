import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "./use-countdown";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCountdown", () => {
  it("counts down to zero and fires onComplete exactly once", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useCountdown(3, onComplete));

    expect(result.current).toBe(3);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(2);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("stops ticking after unmount without firing onComplete", () => {
    const onComplete = vi.fn();
    const { result, unmount } = renderHook(() => useCountdown(2, onComplete));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);

    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("preserves the exact remaining time while paused", () => {
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ isPaused }) => useCountdown(3, onComplete, isPaused),
      { initialProps: { isPaused: false } },
    );

    act(() => {
      vi.advanceTimersByTime(1_250);
    });
    expect(result.current).toBe(2);

    rerender({ isPaused: true });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(2);
    expect(onComplete).not.toHaveBeenCalled();

    rerender({ isPaused: false });
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(result.current).toBe(1);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
