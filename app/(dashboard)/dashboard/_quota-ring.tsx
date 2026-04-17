"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatBytes } from "@/lib/format";

interface Props {
  label: string;
  value: number;
  max: number;
  colorVar: string; // e.g. "var(--chart-1)"
  /**
   * How to format the numeric value. Using a discriminator rather than a
   * function prop because this component is a Client Component and function
   * props from Server Components don't serialize across the boundary.
   */
  kind: "bytes" | "count";
  unitSuffix?: string;
}

function formatValue(n: number, kind: Props["kind"]): string {
  if (kind === "bytes") return formatBytes(n);
  return n.toLocaleString("de-DE");
}

/**
 * Donut-style progress ring. Inner text shows the percentage; label and
 * value sit beside it.
 */
export function QuotaRing({
  label,
  value,
  max,
  colorVar,
  kind,
  unitSuffix,
}: Props) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.round((value / safeMax) * 100));

  const data = [{ name: label, value: pct, fill: colorVar }];

  const config = {
    value: { label, color: colorVar },
  } satisfies ChartConfig;

  return (
    <div className="flex items-center gap-5">
      <ChartContainer
        config={config}
        className="aspect-square h-32 w-32 shrink-0"
      >
        <RadialBarChart
          data={data}
          startAngle={90}
          endAngle={90 - (pct / 100) * 360}
          innerRadius={46}
          outerRadius={62}
          cx="50%"
          cy="50%"
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <RadialBar
            dataKey="value"
            cornerRadius={999}
            background={{ fill: "var(--muted)" }}
          />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground text-xl font-semibold"
          >
            {pct}%
          </text>
        </RadialBarChart>
      </ChartContainer>
      <div className="min-w-0 space-y-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold leading-tight">
          {formatValue(value, kind)}
          {unitSuffix ? (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {unitSuffix}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          von {formatValue(max, kind)} {unitSuffix ?? ""}
        </div>
      </div>
    </div>
  );
}
