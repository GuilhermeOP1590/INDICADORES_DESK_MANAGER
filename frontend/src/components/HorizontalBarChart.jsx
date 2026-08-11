import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function foldTop(data, limit) {
  if (data.length <= limit) return data;
  const top = data.slice(0, limit);
  const outros = data.slice(limit).reduce((sum, d) => sum + d.total, 0);
  return [...top, { label: "Outros (agregado)", total: outros, agregado: true }];
}

export function HorizontalBarChart({ data, color = "var(--series-1)", limit = 8, height = 260, onBarClick }) {
  const chartData = foldTop(data, limit).slice().reverse();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--gridline)" />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--gridline)" }}
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-primary)" }}
        />
        <Bar
          dataKey="total"
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          cursor={onBarClick ? "pointer" : "default"}
          onClick={(entry) => {
            if (onBarClick && !entry.agregado) onBarClick(entry.label);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
