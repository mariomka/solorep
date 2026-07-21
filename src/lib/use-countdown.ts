import { useEffect, useRef, useState } from "react";

const TICK_INTERVAL_MS = 250;

/**
 * Timestamp-based countdown: the remaining time is recomputed from a fixed
 * end timestamp on every tick, so throttled or delayed intervals never drift.
 * Fires `onComplete` exactly once when the countdown reaches zero; the
 * interval is cleaned up on unmount.
 */
export function useCountdown(seconds: number, onComplete: () => void): number {
  const [remainingSeconds, setRemainingSeconds] = useState(seconds);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setRemainingSeconds(seconds);
    const endsAt = Date.now() + seconds * 1000;

    const intervalId = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);

      const isFinished = remaining === 0;
      if (isFinished) {
        clearInterval(intervalId);
        onCompleteRef.current();
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [seconds]);

  return remainingSeconds;
}
