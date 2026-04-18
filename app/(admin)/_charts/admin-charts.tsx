"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Wrapper-Komponenten für die Admin-Dashboard-Charts. Nutzen das
 * Shadcn-Chart-Primitive (recharts unter der Haube).
 *
 * Styling-Prinzip: wenig Rahmen, viel Whitespace, Brand-Farben aus
 * Tailwind-Palette. Tooltip-Formatter wird per Prop reingereicht — je
 * nach Metrik (€, %, Zahl, Bytes).
 */

const PALETTE = [
  "hsl(38 92% 50%)", // amber-500
  "hsl(199 89% 48%)", // sky-500
  "hsl(142 71% 45%)", // emerald-500
  "hsl(271 91% 65%)", // purple-500
  "hsl(0 84% 60%)", // red-500
  "hsl(166 76% 37%)", // teal-600
];

function baseConfig(label: string, color?: string): ChartConfig {
  return {
    value: { label, color: color ?? PALETTE[0] },
  };
}

export function AdminLineChart({
  data,
  xKey,
  yKey,
  label,
  color,
  formatY,
  height = 220,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  label: string;
  color?: string;
  formatY?: (v: number) => string;
  height?: number;
}) {
  return (
    <ChartContainer config={baseConfig(label, color)} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" className="stroke-border/50" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            className="text-[10px] text-muted-foreground"
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            className="text-[10px] text-muted-foreground"
            tickFormatter={formatY}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) =>
                  formatY ? formatY(Number(value)) : String(value)
                }
              />
            }
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={color ?? PALETTE[0]}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

/**
 * Doppelte Line — aktuell genutzt für DAU/MAU. Akzeptiert ein
 * Sekundär-Datarray; beide Serien werden auf die X-Achse der primären
 * Daten gematcht (per gleichem xKey).
 */
export function AdminDualLineChart({
  data,
  xKey,
  series,
  height = 220,
  formatY,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: Array<{ key: string; label: string; color?: string }>;
  height?: number;
  formatY?: (v: number) => string;
}) {
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.key,
      { label: s.label, color: s.color ?? PALETTE[i] },
    ]),
  );
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" className="stroke-border/50" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            className="text-[10px] text-muted-foreground"
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            className="text-[10px] text-muted-foreground"
            tickFormatter={formatY}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) =>
                  formatY ? formatY(Number(value)) : String(value)
                }
              />
            }
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color ?? PALETTE[i]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

export function AdminBarChart({
  data,
  xKey,
  yKey,
  label,
  color,
  formatY,
  height = 220,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  label: string;
  color?: string;
  formatY?: (v: number) => string;
  height?: number;
}) {
  return (
    <ChartContainer config={baseConfig(label, color)} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" className="stroke-border/50" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            className="text-[10px] text-muted-foreground"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            className="text-[10px] text-muted-foreground"
            tickFormatter={formatY}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) =>
                  formatY ? formatY(Number(value)) : String(value)
                }
              />
            }
          />
          <Bar dataKey={yKey} fill={color ?? PALETTE[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

export function AdminPieChart({
  data,
  nameKey,
  valueKey,
  formatValue,
  height = 240,
}: {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  valueKey: string;
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const config: ChartConfig = Object.fromEntries(
    data.map((d, i) => [
      String(d[nameKey]),
      { label: String(d[nameKey]), color: PALETTE[i % PALETTE.length] },
    ]),
  );
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) =>
                  formatValue ? formatValue(Number(value)) : String(value)
                }
              />
            }
          />
          <Pie
            data={data}
            nameKey={nameKey}
            dataKey={valueKey}
            innerRadius={48}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
