import { describe, expect, it, vi } from "vitest";
import {
  CountdownFeedbackController,
  resolveTimerFeedbackCue,
  type TimerFeedbackPlayer,
} from "./countdown-feedback";

describe("resolveTimerFeedbackCue", () => {
  it("maps only the final five seconds and completion", () => {
    expect(resolveTimerFeedbackCue(90)).toBeUndefined();
    expect(resolveTimerFeedbackCue(6)).toBeUndefined();
    expect(resolveTimerFeedbackCue(5)).toBe("countdown");
    expect(resolveTimerFeedbackCue(1)).toBe("countdown");
    expect(resolveTimerFeedbackCue(0)).toBe("complete");
    expect(resolveTimerFeedbackCue(-1)).toBeUndefined();
  });
});

describe("CountdownFeedbackController", () => {
  it("plays each displayed cue once without replaying unchanged seconds", async () => {
    const playFeedback = vi.fn<TimerFeedbackPlayer>(async () => {});
    const controller = new CountdownFeedbackController(
      { soundEnabled: true, vibrationEnabled: false },
      playFeedback,
    );

    await controller.update(6);
    await controller.update(5);
    await controller.update(5);
    await controller.update(4);
    await controller.update(0);
    await controller.update(0);

    expect(playFeedback).toHaveBeenCalledTimes(3);
    expect(playFeedback).toHaveBeenNthCalledWith(1, "countdown", {
      soundEnabled: true,
      vibrationEnabled: false,
    });
    expect(playFeedback).toHaveBeenNthCalledWith(2, "countdown", {
      soundEnabled: true,
      vibrationEnabled: false,
    });
    expect(playFeedback).toHaveBeenNthCalledWith(3, "complete", {
      soundEnabled: true,
      vibrationEnabled: false,
    });
  });

  it("plays only the current cue when the countdown jumps forward", async () => {
    const playFeedback = vi.fn<TimerFeedbackPlayer>(async () => {});
    const controller = new CountdownFeedbackController(undefined, playFeedback);

    await controller.update(5);
    await controller.update(2);
    await controller.update(0);

    expect(playFeedback.mock.calls.map(([cue]) => cue)).toEqual([
      "countdown",
      "countdown",
      "complete",
    ]);
  });

  it("can reset for a new countdown", async () => {
    const playFeedback = vi.fn<TimerFeedbackPlayer>(async () => {});
    const controller = new CountdownFeedbackController(undefined, playFeedback);

    await controller.update(5);
    controller.reset();
    await controller.update(5);

    expect(playFeedback).toHaveBeenCalledTimes(2);
  });
});
