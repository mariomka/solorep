import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
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
  bucketProgressionPoints,
  buildExerciseNameMap,
  buildExerciseProgression,
  filterProgressionPoints,
  formatStatsDate,
  type ProgressionMetric,
  type ProgressionRange,
  resolveExerciseName,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

interface ExerciseStatsDetailProps {
  exerciseKey: string;
  onBack: () => void;
}

const METRIC_LABELS: Record<ProgressionMetric, string> = {
  weight: "Peso máximo (kg)",
  reps: "Repeticiones máximas",
  duration: "Duración máxima (s)",
};

const RANGE_OPTIONS: Array<{ range: ProgressionRange; label: string }> = [
  { range: "3m", label: "3M" },
  { range: "1y", label: "1A" },
  { range: "all", label: "Todo" },
];

const BUCKET_THRESHOLD = 40;
const DOT_THRESHOLD = 30;

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
  const [range, setRange] = useState<ProgressionRange | null>(null);
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

  const now = Date.now();
  const recentPoints = filterProgressionPoints(progression.points, "3m", now);
  const hasRecentPoints = recentPoints.length > 0;
  const hasOlderPoints = recentPoints.length < progression.points.length;
  const effectiveRange = range ?? (hasRecentPoints ? "3m" : "all");
  const showSelector = hasOlderPoints;

  const rangePoints = filterProgressionPoints(
    progression.points,
    effectiveRange,
    now,
  );
  const shouldBucket =
    effectiveRange === "all" && rangePoints.length > BUCKET_THRESHOLD;
  const displayedPoints = shouldBucket
    ? bucketProgressionPoints(rangePoints, now)
    : rangePoints;
  const hasDisplayedPoints = displayedPoints.length > 0;
  const hideDots = displayedPoints.length > DOT_THRESHOLD;

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
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <p
              data-test="exercise-progression-metric"
              className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase"
            >
              {METRIC_LABELS[progression.metric]}
            </p>
            {showSelector && (
              <div className="flex gap-4">
                {RANGE_OPTIONS.map((option) => {
                  const isActive = option.range === effectiveRange;
                  return (
                    <button
                      key={option.range}
                      data-test={`chart-range-${option.range}`}
                      type="button"
                      aria-pressed={isActive}
                      data-state={isActive ? "active" : "inactive"}
                      className={cn(
                        "border-b-2 pb-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground",
                      )}
                      onClick={() => setRange(option.range)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {hasDisplayedPoints ? (
            <ChartContainer config={chartConfig}>
              <AreaChart
                accessibilityLayer
                data={displayedPoints}
                margin={{ top: 8, left: 16, right: 16 }}
              >
                <defs>
                  <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-value)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-value)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  fill="url(#fillValue)"
                  // A single-session series renders nothing without dots;
                  // dense series drown in them.
                  dot={hideDots ? false : { fill: "var(--color-value)" }}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p
              data-test="chart-range-empty"
              className="text-sm text-muted-foreground"
            >
              No hay datos en este periodo.
            </p>
          )}
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
