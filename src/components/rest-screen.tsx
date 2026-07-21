import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/lib/format-countdown";
import { useCountdown } from "@/lib/use-countdown";

export interface RestScreenProps {
  seconds: number;
  onFinished: () => void;
  onExit: () => void; // "Salir" -- session row stays for resume
}

export function RestScreen({ seconds, onFinished, onExit }: RestScreenProps) {
  const remainingSeconds = useCountdown(seconds, onFinished);
  const countdownText = formatCountdown(remainingSeconds);

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
          className="font-mono text-8xl font-medium tracking-tighter text-primary tabular-nums"
        >
          {countdownText}
        </p>
        <p className="mt-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          Min : Seg
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-2">
        <Button data-test="rest-skip" variant="outline" onClick={onFinished}>
          Saltar descanso
        </Button>
        <Button variant="ghost" onClick={onExit}>
          Salir
        </Button>
      </div>
    </div>
  );
}
