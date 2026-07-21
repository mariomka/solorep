export type TimerFeedbackCue = "countdown" | "complete";

export interface TimerFeedbackPreferences {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const DEFAULT_TIMER_FEEDBACK_PREFERENCES: TimerFeedbackPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
};

interface ToneDefinition {
  frequencyHz: number;
  delaySeconds: number;
  durationSeconds: number;
  peakGain: number;
}

interface AudioSessionNavigator extends Navigator {
  audioSession?: {
    type: string;
  };
}

const MINIMUM_GAIN = 0.0001;
const ATTACK_SECONDS = 0.005;

const TONES: Record<TimerFeedbackCue, ToneDefinition[]> = {
  countdown: [
    {
      frequencyHz: 880,
      delaySeconds: 0,
      durationSeconds: 0.075,
      peakGain: 0.1,
    },
  ],
  complete: [
    {
      frequencyHz: 880,
      delaySeconds: 0,
      durationSeconds: 0.1,
      peakGain: 0.1,
    },
    {
      frequencyHz: 1320,
      delaySeconds: 0.14,
      durationSeconds: 0.16,
      peakGain: 0.1,
    },
  ],
};

const VIBRATION_PATTERNS: Record<TimerFeedbackCue, number | number[]> = {
  countdown: 35,
  complete: [80, 50, 140],
};

let audioContext: AudioContext | undefined;
const activeOscillators = new Set<OscillatorNode>();

function configureTransientAudioSession(): void {
  const isNavigatorAvailable = typeof navigator !== "undefined";
  if (!isNavigatorAvailable) {
    return;
  }

  const audioSessionNavigator = navigator as AudioSessionNavigator;
  const audioSession = audioSessionNavigator.audioSession;
  const hasAudioSession = audioSession !== undefined;
  if (!hasAudioSession) {
    return;
  }

  try {
    audioSession.type = "transient";
  } catch {
    // Audio Session is progressive enhancement; Web Audio still works without it.
  }
}

function getAudioContext(): AudioContext | undefined {
  const hasAudioContext = typeof AudioContext !== "undefined";
  if (!hasAudioContext) {
    return undefined;
  }

  const shouldCreateContext =
    audioContext === undefined || audioContext.state === "closed";
  if (shouldCreateContext) {
    audioContext = new AudioContext({ latencyHint: "interactive" });
  }

  return audioContext;
}

async function getRunningAudioContext(): Promise<AudioContext | undefined> {
  configureTransientAudioSession();

  const context = getAudioContext();
  if (context === undefined) {
    return undefined;
  }

  const isSuspended = context.state === "suspended";
  if (isSuspended) {
    await context.resume();
  }

  const isRunning = context.state === "running";
  return isRunning ? context : undefined;
}

function scheduleTone(context: AudioContext, definition: ToneDefinition): void {
  const startsAt = context.currentTime + definition.delaySeconds;
  const attackEndsAt = startsAt + ATTACK_SECONDS;
  const endsAt = startsAt + definition.durationSeconds;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(definition.frequencyHz, startsAt);
  gain.gain.setValueAtTime(MINIMUM_GAIN, startsAt);
  gain.gain.exponentialRampToValueAtTime(definition.peakGain, attackEndsAt);
  gain.gain.exponentialRampToValueAtTime(MINIMUM_GAIN, endsAt);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.addEventListener(
    "ended",
    () => {
      activeOscillators.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    },
    { once: true },
  );

  activeOscillators.add(oscillator);
  oscillator.start(startsAt);
  oscillator.stop(endsAt);
}

function vibrate(cue: TimerFeedbackCue): void {
  const isVibrationAvailable =
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  if (!isVibrationAvailable) {
    return;
  }

  try {
    navigator.vibrate(VIBRATION_PATTERNS[cue]);
  } catch {
    // Vibration support and platform policy vary; audio remains independent.
  }
}

export async function prepareTimerAudio(): Promise<boolean> {
  try {
    const context = await getRunningAudioContext();
    return context !== undefined;
  } catch {
    return false;
  }
}

export async function playTimerFeedback(
  cue: TimerFeedbackCue,
  preferences: TimerFeedbackPreferences = DEFAULT_TIMER_FEEDBACK_PREFERENCES,
): Promise<void> {
  if (preferences.vibrationEnabled) {
    vibrate(cue);
  }

  if (!preferences.soundEnabled) {
    return;
  }

  try {
    const context = await getRunningAudioContext();
    if (context === undefined) {
      return;
    }

    for (const tone of TONES[cue]) {
      scheduleTone(context, tone);
    }
  } catch {
    // Timer completion must never depend on optional feedback succeeding.
  }
}

export function stopTimerFeedback(): void {
  for (const oscillator of activeOscillators) {
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have ended between iteration and stop().
    }
  }
  activeOscillators.clear();

  const canCancelVibration =
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  if (canCancelVibration) {
    try {
      navigator.vibrate(0);
    } catch {
      // Cancellation is best-effort for the same reason as vibration itself.
    }
  }
}
