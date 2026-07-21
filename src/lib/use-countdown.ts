import { useEffect, useRef, useState } from "react";

const TICK_INTERVAL_MS = 250;

/**
 * Timestamp-based countdown: the remaining time is recomputed from a fixed
 * end timestamp on every tick, so throttled or delayed intervals never drift.
 * Pausing preserves the exact remaining milliseconds. Fires `onComplete`
 * exactly once when the countdown reaches zero; the interval is cleaned up
 * on unmount.
 */
export function useCountdown(
  seconds: number,
  onComplete: () => void,
  isPaused = false,
): number {
  const [remainingSeconds, setRemainingSeconds] = useState(seconds);
  const onCompleteRef = useRef(onComplete);
  const remainingMillisecondsRef = useRef(seconds * 1000);
  const didCompleteRef = useRef(false);
  const previousSecondsRef = useRef(seconds);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const didDurationChange = previousSecondsRef.current !== seconds;
    if (didDurationChange) {
      previousSecondsRef.current = seconds;
      remainingMillisecondsRef.current = seconds * 1000;
      didCompleteRef.current = false;
      setRemainingSeconds(seconds);
    }

    if (isPaused) {
      const pausedRemainingSeconds = Math.ceil(
        remainingMillisecondsRef.current / 1000,
      );
      setRemainingSeconds(pausedRemainingSeconds);
      return;
    }

    const endsAt = Date.now() + remainingMillisecondsRef.current;

    const intervalId = setInterval(() => {
      const remainingMilliseconds = Math.max(0, endsAt - Date.now());
      remainingMillisecondsRef.current = remainingMilliseconds;
      const nextRemainingSeconds = Math.ceil(remainingMilliseconds / 1000);
      setRemainingSeconds(nextRemainingSeconds);

      const isFinished = remainingMilliseconds === 0;
      if (isFinished) {
        clearInterval(intervalId);
        const shouldNotifyCompletion = !didCompleteRef.current;
        if (shouldNotifyCompletion) {
          didCompleteRef.current = true;
          onCompleteRef.current();
        }
      }
    }, TICK_INTERVAL_MS);

    return () => {
      remainingMillisecondsRef.current = Math.max(0, endsAt - Date.now());
      clearInterval(intervalId);
    };
  }, [seconds, isPaused]);

  return remainingSeconds;
}
