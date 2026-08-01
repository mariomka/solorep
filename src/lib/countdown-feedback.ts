import {
  DEFAULT_TIMER_FEEDBACK_PREFERENCES,
  playTimerFeedback,
  stopTimerFeedback,
  type TimerFeedbackCue,
  type TimerFeedbackPreferences,
} from "./timer-feedback";

export type TimerFeedbackPlayer = (
  cue: TimerFeedbackCue,
  preferences: TimerFeedbackPreferences,
) => Promise<void>;

export function resolveTimerFeedbackCue(
  remainingSeconds: number,
): TimerFeedbackCue | undefined {
  const isComplete = remainingSeconds === 0;
  if (isComplete) {
    return "complete";
  }

  const isFinalCountdownSecond = remainingSeconds >= 1 && remainingSeconds <= 5;
  return isFinalCountdownSecond ? "countdown" : undefined;
}

export class CountdownFeedbackController {
  private readonly preferences: TimerFeedbackPreferences;
  private readonly playFeedback: TimerFeedbackPlayer;
  private lastRemainingSeconds: number | undefined;

  constructor(
    preferences: TimerFeedbackPreferences = DEFAULT_TIMER_FEEDBACK_PREFERENCES,
    playFeedback: TimerFeedbackPlayer = playTimerFeedback,
  ) {
    this.preferences = preferences;
    this.playFeedback = playFeedback;
  }

  /**
   * Plays the one-shot cue that marks the beginning of a countdown. It is not
   * derived from a displayed second, so it never participates in the
   * duplicate-second guard.
   */
  async playStart(): Promise<void> {
    await this.playFeedback("start", this.preferences);
  }

  async update(remainingSeconds: number): Promise<void> {
    const hasAlreadyHandledSecond =
      remainingSeconds === this.lastRemainingSeconds;
    if (hasAlreadyHandledSecond) {
      return;
    }

    this.lastRemainingSeconds = remainingSeconds;
    const cue = resolveTimerFeedbackCue(remainingSeconds);
    if (cue === undefined) {
      return;
    }

    await this.playFeedback(cue, this.preferences);
  }

  reset(): void {
    this.lastRemainingSeconds = undefined;
    stopTimerFeedback();
  }
}
