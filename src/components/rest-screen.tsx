import { Button } from "@/components/ui/button";
import { useCountdown } from "@/lib/use-countdown";

export interface RestScreenProps {
  seconds: number;
  onFinished: () => void;
  onExit: () => void; // "Salir" -- session row stays for resume
}

export function RestScreen({ seconds, onFinished, onExit }: RestScreenProps) {
  const remainingSeconds = useCountdown(seconds, onFinished);

  return (
    <div
      data-test="rest-screen"
      className="flex flex-col items-center gap-6 py-12"
    >
      <p className="text-lg text-muted-foreground">Descanso</p>
      <p
        data-test="rest-timer"
        role="timer"
        aria-live="polite"
        className="font-heading text-8xl font-bold tabular-nums"
      >
        {remainingSeconds}
      </p>
      <Button data-test="rest-skip" variant="outline" onClick={onFinished}>
        Saltar descanso
      </Button>
      <Button variant="ghost" onClick={onExit}>
        Salir
      </Button>
    </div>
  );
}
