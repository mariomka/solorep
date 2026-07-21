import { describe, expect, it } from "vitest";
import { formatCountdown } from "./format-countdown";

describe("formatCountdown", () => {
  it.each([
    [0, "00:00"],
    [5, "00:05"],
    [59, "00:59"],
    [60, "01:00"],
    [125, "02:05"],
    [3600, "60:00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatCountdown(seconds)).toBe(expected);
  });

  it("normalizes fractional and negative input", () => {
    expect(formatCountdown(65.9)).toBe("01:05");
    expect(formatCountdown(-1)).toBe("00:00");
  });
});
