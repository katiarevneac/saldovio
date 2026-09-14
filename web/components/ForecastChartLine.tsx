"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { toBaniPoints, findMinimum } from "@/lib/forecast-chart-data";
import { formatAmountValue } from "@/lib/money";
import styles from "./ForecastChartLine.module.css";

type ForecastChartLineProps = {
  dailyBalances: { date: string; balance: string }[];
  afterSeries?: { date: string; balance: string }[];
};

// The line has an "actual" segment (solid) and a "projected" segment
// (dashed). Actuals require historical balance points before today,
// which the backend doesn't provide yet (out of scope per the design
// spec) — actualUpToIndex is always 0, so the actual segment is
// structurally present but always empty, and every real point renders
// via the projected (dashed) series.
const ACTUAL_UP_TO_INDEX = 0;

function ForecastTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const date = payload?.value ?? "";
  const label = date.length === 10 ? `${date.slice(8, 10)}.${date.slice(5, 7)}` : date;
  return (
    <foreignObject x={(x ?? 0) - 20} y={y ?? 0} width={40} height={20}>
      <span className={styles.tick} data-testid={`forecast-tick-${date}`}>
        {label}
      </span>
    </foreignObject>
  );
}

function pointDot(testIdPrefix: string) {
  return function Dot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: { date: string } }) {
    if (cx === undefined || cy === undefined || !payload) return null;
    return (
      <circle
        data-testid={`${testIdPrefix}-${payload.date}`}
        cx={cx}
        cy={cy}
        r={2.5}
        fill="var(--color-accent)"
      />
    );
  };
}

export default function ForecastChartLine({ dailyBalances, afterSeries }: ForecastChartLineProps) {
  const points = toBaniPoints(dailyBalances);
  const minimum = findMinimum(points);
  const actualPoints = points.slice(0, ACTUAL_UP_TO_INDEX + 1 === 1 ? 0 : ACTUAL_UP_TO_INDEX + 1);
  const afterPoints = afterSeries ? toBaniPoints(afterSeries) : null;
  const afterMinimum = afterPoints ? findMinimum(afterPoints) : null;

  const chartData = points.map((point, index) => ({
    date: point.date,
    projected: point.bani,
    actual: index < actualPoints.length ? point.bani : null,
    after: afterPoints ? afterPoints[index]?.bani ?? null : null,
  }));

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={<ForecastTick />} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(value: number) => formatAmountValue(value)}
            width={64}
            tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Area
            type="monotone"
            dataKey="projected"
            stroke="none"
            fill="var(--color-accent)"
            fillOpacity={0.14}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={pointDot("forecast-point")}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="projected"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={pointDot("forecast-point")}
            isAnimationActive={false}
          />
          {afterPoints ? (
            <Line
              type="monotone"
              dataKey="after"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={pointDot("forecast-point-after")}
              isAnimationActive={false}
            />
          ) : null}
          {points.length > 0 ? (
            <ReferenceLine x={points[0].date} stroke="var(--color-text-tertiary)" strokeDasharray="3 3" label="Today" />
          ) : null}
          {minimum ? (
            <ReferenceLine y={minimum.bani} stroke="var(--color-verdict-no)" label="Low" />
          ) : null}
          {afterMinimum ? (
            <ReferenceLine x={afterMinimum.date} stroke="var(--color-verdict-no)" strokeDasharray="3 3" />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
