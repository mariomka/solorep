import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { db } from "@/lib/db";
import {
  buildExerciseNameMap,
  buildExerciseProgression,
  formatStatsDate,
  type ProgressionMetric,
  resolveExerciseName,
} from "@/lib/stats";

interface ExerciseStatsDetailProps {
  exerciseKey: string;
  onBack: () => void;
}

const METRIC_LABELS: Record<ProgressionMetric, string> = {
  weight: "Peso máximo (kg)",
  reps: "Repeticiones máximas",
  duration: "Duración máxima (s)",
};

const chartConfig = {
  value: {
    label: "Valor",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

const axisDateFormat = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
});

export function ExerciseStatsDetail({
  exerciseKey,
  onBack,
}: ExerciseStatsDetailProps) {
  const data = useLiveQuery(() =>
    Promise.all([
      db.sessions.orderBy("finishedAt").toArray(),
      db.routines.toArray(),
    ]),
  );

  const isLoading = data === undefined;
  if (isLoading) {
    return null;
  }

  const [sessions, routines] = data;
  const nameMap = buildExerciseNameMap(routines);
  const exerciseName = resolveExerciseName(exerciseKey, nameMap);
  const progression = buildExerciseProgression(sessions, exerciseKey);
  const hasPoints = progression.points.length > 0;

  return (
    <div className="flex flex-col">
      <Button
        data-test="exercise-stats-back"
        variant="ghost"
        size="sm"
        className="-ml-4 mb-8 self-start"
        aria-label="Volver"
        onClick={onBack}
      >
        <ArrowLeft />
        Volver
      </Button>
      <Badge variant="secondary" className="mb-3">
        Progresión
      </Badge>
      <h2
        data-test="exercise-stats-name"
        className="mb-8 font-heading text-3xl font-semibold leading-tight"
      >
        {exerciseName}
      </h2>
      {hasPoints ? (
        <div data-test="exercise-progression-chart">
          <p
            data-test="exercise-progression-metric"
            className="mb-4 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {METRIC_LABELS[progression.metric]}
          </p>
          <ChartContainer config={chartConfig}>
            <LineChart
              accessibilityLayer
              data={progression.points}
              margin={{ top: 8, left: 16, right: 16 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="finishedAt"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(finishedAt: number) =>
                  axisDateFormat.format(finishedAt)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, payload) => {
                      const finishedAt = payload?.[0]?.payload?.finishedAt;
                      const hasDate = typeof finishedAt === "number";
                      return hasDate ? formatStatsDate(finishedAt) : "";
                    }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-value)"
                strokeWidth={2}
                // A single-session series renders nothing without dots.
                dot={{ fill: "var(--color-value)" }}
              />
            </LineChart>
          </ChartContainer>
        </div>
      ) : (
        <p
          data-test="exercise-progression-empty"
          className="text-sm text-muted-foreground"
        >
          No hay datos para este ejercicio.
        </p>
      )}
    </div>
  );
}
