# Timers and Workout Feedback

## How It Works

- `src/lib/use-countdown.ts` owns timekeeping. It derives remaining time from a fixed wall-clock deadline, so delayed intervals do not introduce drift, and preserves the exact remaining milliseconds across pause/resume.
- `src/lib/timer-feedback.ts` owns synthesized Web Audio cues, vibration, audio-session progressive enhancement, and cancellation.
- `src/lib/countdown-feedback.ts` maps displayed seconds to cues and prevents duplicate playback. A jump after suspension plays only the current cue, never every missed second. The start cue is one-shot and sits outside that guard.
- `src/components/set-screen.tsx` owns the duration-set lead-in: two sibling countdown components, never one phase-switched timer, so each phase gets its own `useCountdown` instance. Sharing one instance would let a duration equal to the lead-in length read as an unchanged `seconds` prop and skip its restart.
- `src/lib/screen-wake-lock.ts` owns the Screen Wake Lock lifecycle independently from countdown and audio logic.

Timer completion must never depend on audio, vibration, or Wake Lock succeeding. All three capabilities degrade silently.

## Sound Contract

| Event | Audio | Vibration |
| --- | --- | --- |
| Duration-set lead-in (5 seconds) | silent | none |
| Duration-set start | 1320 Hz triangle wave, 180 ms | 60 ms |
| Seconds 5 through 1 | 880 Hz triangle wave, 75 ms | 35 ms |
| Completion | 880 Hz for 100 ms, then 1320 Hz for 160 ms | 80 ms, 50 ms pause, 140 ms |

The lead-in is silent by contract: a cue there would compete with the start cue, which is the only marker of the instant the effort begins. The start cue is a single high note, deliberately longer than a countdown tick so it cannot be mistaken for one.

Countdown tones use a 0.45 peak gain; the start and completion cues use 0.55. Both use a 5 ms attack and exponential decay to stay audible without speaker clicks. They are synthesized at runtime: no audio asset, fetch, decode, or offline cache is required.

The default preference enables both sound and vibration, but consumers receive independent `soundEnabled` and `vibrationEnabled` flags. Do not collapse them into one setting.

## Integration Contract

The UI integration is intentionally thin:

1. Duration sets run a silent five-second lead-in as soon as their persisted or planned duration is loaded, then the countdown starts automatically. `Empezar ya` cuts the lead-in short. Pausing freezes the exact remaining time; resuming continues from that instant rather than restarting the displayed second.
2. Call `notifyStart()` once when the real countdown begins -- from the countdown component's mount, so the natural end of the lead-in and `Empezar ya` share one path. Retrying a stranded set re-arms the lead-in.
3. Call `prepareTimerAudio()` from trusted gestures that can lead to an automatic countdown: selecting a day, resuming a session, and `Continuar`. Call it again from `Reanudar` after a pause. Browsers may keep a new `AudioContext` suspended without prior interaction. Auto-resume on launch has no gesture, so its countdown may stay silent until the first touch — accepted degradation, never block timing on it.
4. Use one `useCountdownFeedback()` instance per visible countdown. It owns a `CountdownFeedbackController` and its cleanup.
5. Pass each changed positive `remainingSeconds` value to `notifySecond()` and call `notifyComplete()` at `0` before navigating away. Repeated values are ignored.
6. Call `cancel()` when the user pauses, skips, or exits. Natural completion deliberately leaves its short final cue alive across navigation.
7. Call `workoutScreenWakeLock.acquire()` while the workout execution route is active. Call `release()` before summary, exit, or discard.

Keep `useCountdown` free of sound and platform APIs. Timing is required behavior; feedback is optional behavior.

## Platform Constraints

- Web Audio must be created or resumed after user activation. The module keeps one lazy `AudioContext` per page and requests interactive latency.
- When available, the experimental Audio Session API is set to `transient` for short notification-like cues. Mixing or ducking music remains browser and operating-system behavior, not an app guarantee.
- Vibration requires prior user activation and is not supported by every browser.
- Screen Wake Lock requires a visible secure document. The platform may release it when the page is hidden or the device is under power pressure; the manager reacquires it on a later visible state.
- If execution is suspended despite Wake Lock, the wall-clock countdown catches up on return. Missed 5–1 cues are not replayed.
- If the OS kills the PWA outright, rest countdowns survive via `activeSession.restEndsAt` (see `docs/data-layer.md`): resuming re-enters the remaining rest. Duration sets do NOT persist a deadline — an interrupted duration set restarts, because the hold itself was interrupted.

References: [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), [Audio Session API](https://developer.mozilla.org/en-US/docs/Web/API/Audio_Session_API), [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API), [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

## Verification

- Unit tests mock platform APIs and cover cue timing, preference isolation, cancellation, unsupported APIs, wake-lock races, and visibility reacquisition.
- Browser automation cannot prove audible output, haptic strength, or music interaction.
- Before release, test on the target Android phone with Spotify playing: normal volume, silent mode, vibration disabled at OS level, skip during the final five seconds, app background/foreground, manual screen lock, and battery saver.
