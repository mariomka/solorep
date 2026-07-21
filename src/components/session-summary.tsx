import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeSummary } from "@/lib/session-plan";
import {
  discardActiveSession,
  finishSession,
  getActiveSession,
} from "@/lib/session-store";

export interface SessionSummaryProps {
  onFinished: () => void;
}

interface SummaryData {
  durationText: string;
  setsCompleted: number;
  totalVolume: number;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  const hasHours = hours > 0;
  if (hasHours) {
    const paddedMinutes = String(minutes).padStart(2, "0");
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

async function loadSummary(): Promise<SummaryData | null> {
  const session = await getActiveSession();
  if (session === undefined) {
    return null;
  }
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - session.startedAt) / 1000),
  );
  const { setsCompleted, totalVolume } = computeSummary(session.completed);
  // Fractional weights accumulate float noise: display rounded to 1 decimal.
  const displayVolume = Math.round(totalVolume * 10) / 10;

  return {
    durationText: formatDuration(elapsedSeconds),
    setsCompleted,
    totalVolume: displayVolume,
  };
}

export function SessionSummary({ onFinished }: SessionSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null | undefined>(
    undefined,
  );
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const isFinishingRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    loadSummary()
      .then((data) => {
        if (isActive) {
          setSummary(data);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load the session summary", error);
        if (isActive) {
          setSummary(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  const isSessionMissing = summary === null;
  useEffect(() => {
    // The caller guarantees an active session exists; bail out if it does not.
    if (isSessionMissing) {
      onFinished();
    }
  }, [isSessionMissing, onFinished]);

  const isLoading = summary === undefined;
  if (isLoading || isSessionMissing) {
    return null;
  }

  const handleFinish = async () => {
    if (isFinishingRef.current) {
      return;
    }

    isFinishingRef.current = true;
    setIsFinishing(true);
    setErrorMessage(undefined);
    try {
      await finishSession();
      onFinished();
    } catch (error: unknown) {
      console.error("Failed to finish the session", error);
      isFinishingRef.current = false;
      setErrorMessage(
        "No se pudo terminar el entrenamiento. Inténtalo de nuevo.",
      );
      setIsFinishing(false);
    }
  };

  const handleDiscard = async () => {
    if (isFinishingRef.current) {
      return;
    }

    isFinishingRef.current = true;
    setIsFinishing(true);
    setErrorMessage(undefined);
    try {
      await discardActiveSession();
      onFinished();
    } catch (error: unknown) {
      console.error("Failed to discard the session", error);
      isFinishingRef.current = false;
      setErrorMessage("No se pudo descartar el entrenamiento.");
      setIsFinishing(false);
    }
  };

  return (
    <div data-test="session-summary" className="flex flex-col">
      <Badge variant="status" className="mb-3 mt-4">
        Entrenamiento completado
      </Badge>
      <h2 className="mb-9 font-heading text-3xl font-semibold">Resumen</h2>
      <dl className="mb-8 border-t">
        <div className="flex items-baseline justify-between gap-6 border-b py-5">
          <dt className="text-sm text-muted-foreground">Duración</dt>
          <dd
            data-test="summary-duration"
            className="font-mono text-2xl font-medium text-primary tabular-nums"
          >
            {summary.durationText}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 border-b py-5">
          <dt className="text-sm text-muted-foreground">Series completadas</dt>
          <dd
            data-test="summary-sets-completed"
            className="font-mono text-2xl font-medium text-primary tabular-nums"
          >
            {summary.setsCompleted}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 border-b py-5">
          <dt className="text-sm text-muted-foreground">Volumen total</dt>
          <dd
            data-test="summary-total-volume"
            className="font-mono text-2xl font-medium text-primary tabular-nums"
          >
            {summary.totalVolume} kg
          </dd>
        </div>
      </dl>
      {errorMessage !== undefined && (
        <p
          data-test="summary-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}
      <div className="mt-6 flex gap-2">
        <Button
          data-test="summary-finish"
          className="flex-1"
          disabled={isFinishing}
          onClick={handleFinish}
        >
          Terminar
        </Button>
        {errorMessage !== undefined && (
          <Button
            data-test="summary-discard"
            variant="destructive"
            disabled={isFinishing}
            onClick={handleDiscard}
          >
            Descartar
          </Button>
        )}
      </div>
    </div>
  );
}
