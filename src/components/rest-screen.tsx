import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/lib/format-countdown";
import { useCountdown } from "@/lib/use-countdown";
import { useCountdownFeedback } from "@/lib/use-countdown-feedback";
import { cn } from "@/lib/utils";

export interface RestScreenProps {
  seconds: number;
  onFinished: () => void;
  onExit: () => void; // "Salir" -- session row stays for resume
}

export function RestScreen({ seconds, onFinished, onExit }: RestScreenProps) {
  const { notifySecond, notifyComplete, cancel } = useCountdownFeedback();
  const handleTimerFinished = () => {
    notifyComplete();
    onFinished();
  };
  const remainingSeconds = useCountdown(seconds, handleTimerFinished);
  useEffect(() => {
    notifySecond(remainingSeconds);
  }, [notifySecond, remainingSeconds]);

  const isFinalCountdown = remainingSeconds >= 1 && remainingSeconds <= 5;
  const countdownText = isFinalCountdown
    ? String(remainingSeconds)
    : formatCountdown(remainingSeconds);

  const handleSkip = () => {
    cancel();
    onFinished();
  };

  const handleExit = () => {
    cancel();
    onExit();
  };

  return (
    <div
      data-test="rest-screen"
      className="flex min-h-[calc(100svh-3rem)] flex-col justify-center py-10"
    >
      <div className="flex flex-col items-center border-y py-12">
        <p className="mb-6 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          Descanso
        </p>
        <p
          data-test="rest-timer"
          role="timer"
          aria-live="polite"
          className={cn(
            "font-mono text-8xl font-medium tracking-tighter text-primary tabular-nums",
            isFinalCountdown &&
              "font-heading text-[9rem] font-black leading-none tracking-tighter",
          )}
        >
          {countdownText}
        </p>
        {!isFinalCountdown && (
          <p className="mt-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            Min : Seg
          </p>
        )}
      </div>
      <div className="mt-8 flex flex-col gap-2">
        <Button data-test="rest-skip" variant="outline" onClick={handleSkip}>
          Saltar descanso
        </Button>
        <Button variant="ghost" onClick={handleExit}>
          Salir
        </Button>
      </div>
    </div>
  );
}
