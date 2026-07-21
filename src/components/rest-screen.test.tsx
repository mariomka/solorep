import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playTimerFeedback, stopTimerFeedback } from "@/lib/timer-feedback";
import { RestScreen } from "./rest-screen";

vi.mock("@/lib/timer-feedback", { spy: true });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RestScreen", () => {
  it("shows the final five seconds as single digits and emits countdown feedback", async () => {
    const onFinished = vi.fn();
    render(<RestScreen seconds={6} onFinished={onFinished} onExit={vi.fn()} />);

    expect(screen.getByTestId("rest-timer")).toHaveTextContent("00:06");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByTestId("rest-timer")).toHaveTextContent("5");
    expect(playTimerFeedback).toHaveBeenLastCalledWith("countdown", {
      soundEnabled: true,
      vibrationEnabled: true,
    });

    for (let remainingSeconds = 4; remainingSeconds >= 1; remainingSeconds--) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.getByTestId("rest-timer")).toHaveTextContent(
        String(remainingSeconds),
      );
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(playTimerFeedback).toHaveBeenCalledTimes(6);
    expect(playTimerFeedback).toHaveBeenLastCalledWith("complete", {
      soundEnabled: true,
      vibrationEnabled: true,
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("cancels feedback without a completion cue when skipped", () => {
    const onFinished = vi.fn();
    render(
      <RestScreen seconds={30} onFinished={onFinished} onExit={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId("rest-skip"));

    expect(stopTimerFeedback).toHaveBeenCalledTimes(1);
    expect(playTimerFeedback).not.toHaveBeenCalled();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
