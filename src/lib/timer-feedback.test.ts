import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeAudioParam {
  readonly setValueAtTime = vi.fn();
  readonly exponentialRampToValueAtTime = vi.fn();
}

class FakeOscillator {
  type: OscillatorType = "sine";
  readonly frequency = new FakeAudioParam();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly addEventListener = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeGain {
  readonly gain = new FakeAudioParam();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

const audioContexts: FakeAudioContext[] = [];

class FakeAudioContext {
  state: AudioContextState = "suspended";
  readonly currentTime = 10;
  readonly destination = {};
  readonly options: AudioContextOptions | undefined;
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly resume = vi.fn(async () => {
    this.state = "running";
  });

  constructor(options?: AudioContextOptions) {
    this.options = options;
    audioContexts.push(this);
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

const vibrate = vi.fn();
const audioSession = { type: "auto" };

beforeEach(() => {
  vi.resetModules();
  audioContexts.length = 0;
  vibrate.mockReset();
  audioSession.type = "auto";
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  Object.defineProperty(navigator, "audioSession", {
    configurable: true,
    value: audioSession,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "vibrate");
  Reflect.deleteProperty(navigator, "audioSession");
});

describe("timer feedback", () => {
  it("prepares one interactive audio context from a user gesture", async () => {
    const { prepareTimerAudio } = await import("./timer-feedback");

    await expect(prepareTimerAudio()).resolves.toBe(true);
    await expect(prepareTimerAudio()).resolves.toBe(true);

    expect(audioContexts).toHaveLength(1);
    expect(audioContexts[0].options).toEqual({ latencyHint: "interactive" });
    expect(audioContexts[0].resume).toHaveBeenCalledOnce();
    expect(audioSession.type).toBe("transient");
  });

  it("plays a short triangular countdown cue with a light vibration", async () => {
    const { playTimerFeedback } = await import("./timer-feedback");

    await playTimerFeedback("countdown");

    const [oscillator] = audioContexts[0].oscillators;
    const [gain] = audioContexts[0].gains;
    expect(oscillator.type).toBe("triangle");
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 10);
    expect(oscillator.start).toHaveBeenCalledWith(10);
    expect(oscillator.stop).toHaveBeenCalledWith(10.075);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 10);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.45,
      10.005,
    );
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(35);
  });

  it("plays a single high start cue, longer than a countdown tick", async () => {
    const { playTimerFeedback } = await import("./timer-feedback");

    await playTimerFeedback("start");

    const { gains, oscillators } = audioContexts[0];
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      1320,
      10,
    );
    expect(oscillators[0].start).toHaveBeenCalledWith(10);
    expect(oscillators[0].stop).toHaveBeenCalledWith(10.18);
    expect(gains[0].gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.55,
      10.005,
    );
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(60);
  });

  it("plays a rising two-tone completion cue and distinct vibration", async () => {
    const { playTimerFeedback } = await import("./timer-feedback");

    await playTimerFeedback("complete");

    const { gains, oscillators } = audioContexts[0];
    expect(oscillators).toHaveLength(2);
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      880,
      10,
    );
    expect(oscillators[0].stop).toHaveBeenCalledWith(10.1);
    expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(
      1320,
      10.14,
    );
    expect(oscillators[1].stop).toHaveBeenCalledWith(10.3);
    expect(gains[0].gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.55,
      10.005,
    );
    const [secondTonePeakGain, secondToneAttackTime] =
      gains[1].gain.exponentialRampToValueAtTime.mock.calls[0];
    expect(secondTonePeakGain).toBe(0.55);
    expect(secondToneAttackTime).toBeCloseTo(10.145);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith([80, 50, 140]);
  });

  it("honors independent sound and vibration preferences", async () => {
    const { playTimerFeedback } = await import("./timer-feedback");

    await playTimerFeedback("countdown", {
      soundEnabled: false,
      vibrationEnabled: true,
    });

    expect(audioContexts).toHaveLength(0);
    expect(vibrate).toHaveBeenCalledWith(35);

    await playTimerFeedback("countdown", {
      soundEnabled: true,
      vibrationEnabled: false,
    });

    expect(audioContexts).toHaveLength(1);
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it("cancels active tones and vibration", async () => {
    const { playTimerFeedback, stopTimerFeedback } = await import(
      "./timer-feedback"
    );
    await playTimerFeedback("complete");

    stopTimerFeedback();

    for (const oscillator of audioContexts[0].oscillators) {
      expect(oscillator.stop).toHaveBeenLastCalledWith();
    }
    expect(vibrate).toHaveBeenLastCalledWith(0);
  });

  it("degrades silently when platform audio is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { playTimerFeedback, prepareTimerAudio } = await import(
      "./timer-feedback"
    );

    await expect(prepareTimerAudio()).resolves.toBe(false);
    await expect(
      playTimerFeedback("countdown", {
        soundEnabled: true,
        vibrationEnabled: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("degrades silently when vibration is rejected by the platform", async () => {
    vibrate.mockImplementation(() => {
      throw new Error("Vibration denied");
    });
    const { playTimerFeedback, stopTimerFeedback } = await import(
      "./timer-feedback"
    );

    await expect(
      playTimerFeedback("countdown", {
        soundEnabled: false,
        vibrationEnabled: true,
      }),
    ).resolves.toBeUndefined();
    expect(() => stopTimerFeedback()).not.toThrow();
  });
});
