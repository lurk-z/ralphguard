"use client";

/**
 * TrendChart — line chart of the irritation/toxicity time-course (Day 1/3/7)
 * for each endpoint. Client-only (recharts needs the DOM).
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = { day: string } & Record<string, number | string>;
type Series = { key: string; label: string; color: string };

export default function TrendChart({
  data,
  lines,
  dark = false,
}: {
  data: Row[];
  lines: Series[];
  dark?: boolean;
}) {
  const grid = dark ? "#3a3a3a" : "#eef2f5";
  const axis = dark ? "#777" : "#94a3b8";
  const tickFill = dark ? "#cbd5e1" : "#64748b";
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: tickFill }} stroke={axis} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: tickFill }} stroke={axis} />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: dark ? "1px solid #3a3a3a" : "1px solid #e2e8f0",
            background: dark ? "#2b2b2b" : "#fff",
            color: dark ? "#e5e7eb" : "#334155",
          }}
          labelStyle={{ fontWeight: 600, color: dark ? "#e5e7eb" : "#334155" }}
        />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={l.color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
