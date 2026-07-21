import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl font-bold">Resumen</h2>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Duración</span>
            <span className="font-heading text-2xl font-bold tabular-nums">
              {summary.durationText}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Series completadas</span>
            <span className="font-heading text-2xl font-bold tabular-nums">
              {summary.setsCompleted}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Volumen total</span>
            <span className="font-heading text-2xl font-bold tabular-nums">
              {summary.totalVolume} kg
            </span>
          </div>
        </CardContent>
      </Card>
      {errorMessage !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={isFinishing}
          onClick={handleFinish}
        >
          Terminar
        </Button>
        {errorMessage !== undefined && (
          <Button
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
