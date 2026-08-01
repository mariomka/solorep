import { useCallback, useEffect, useRef } from "react";
import { CountdownFeedbackController } from "./countdown-feedback";

export interface CountdownFeedbackControls {
  notifyStart: () => void;
  notifySecond: (remainingSeconds: number) => void;
  notifyComplete: () => void;
  cancel: () => void;
}

function reportFeedbackError(error: unknown): void {
  console.error("Failed to play countdown feedback", error);
}

export function useCountdownFeedback(): CountdownFeedbackControls {
  const controllerRef = useRef<CountdownFeedbackController | undefined>(
    undefined,
  );
  const didCompleteNaturallyRef = useRef(false);

  if (controllerRef.current === undefined) {
    controllerRef.current = new CountdownFeedbackController();
  }
  const controller = controllerRef.current;

  useEffect(
    () => () => {
      if (!didCompleteNaturallyRef.current) {
        controller.reset();
      }
    },
    [controller],
  );

  const notifyStart = useCallback(() => {
    controller.playStart().catch(reportFeedbackError);
  }, [controller]);

  const notifySecond = useCallback(
    (remainingSeconds: number) => {
      const isActiveSecond = remainingSeconds > 0;
      if (!isActiveSecond) {
        return;
      }
      controller.update(remainingSeconds).catch(reportFeedbackError);
    },
    [controller],
  );

  const notifyComplete = useCallback(() => {
    didCompleteNaturallyRef.current = true;
    controller.update(0).catch(reportFeedbackError);
  }, [controller]);

  const cancel = useCallback(() => {
    controller.reset();
  }, [controller]);

  return { notifyStart, notifySecond, notifyComplete, cancel };
}
