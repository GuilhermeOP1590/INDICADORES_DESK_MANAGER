import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Total (fechados+abertos) impresso ao lado da barra — sem isso o usuário só vê a composição,
// não o volume total daquela área, que é a primeira pergunta ("quantas atividades são de
// Engenharia/Manutenção"). O % de resolução (fechados/total) vem logo depois, em destaque —
// segunda pergunta natural ao comparar áreas: não só "quantos", mas "quanto disso já foi resolvido".
function TotalLabel({ x = 0, y = 0, width = 0, height = 0, index, chartData }) {
  const item = chartData[index];
  if (!item?.total) return null;
  const percentual = Math.round((item.fechados / item.total) * 100);
  return (
    <text x={x + width + 8} y={y + height / 2} dy={4} fontSize={11}>
      <tspan fill="var(--text-secondary)">{item.total}</tspan>
      <tspan fill="var(--status-good)" dx={5} fontWeight={600}>
        {percentual}%
      </tspan>
    </text>
  );
}

// Mesmo racional do VolumeTrendChart (criados/fechados/abertos), só que com "categoria" no
// lugar de "tempo": quantos chamados pertencem a cada área e quantos disso já foi resolvido.
export function ChamadosPorAreaChart({ data, onBarClick, height = 200 }) {
  const chartData = data;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--gridline)" />
        <XAxis
          type="number"
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="area"
          width={110}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--gridline)" }}
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-primary)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="fechados"
          name="Fechados"
          stackId="area"
          fill="var(--status-good)"
          maxBarSize={28}
          cursor={onBarClick ? "pointer" : "default"}
          onClick={(entry) => onBarClick?.(entry.area)}
        />
        <Bar
          dataKey="abertos"
          name="Em aberto"
          stackId="area"
          fill="var(--status-warning)"
          radius={[0, 4, 4, 0]}
          maxBarSize={28}
          cursor={onBarClick ? "pointer" : "default"}
          onClick={(entry) => onBarClick?.(entry.area)}
        >
          <LabelList dataKey="abertos" content={(props) => <TotalLabel {...props} chartData={chartData} />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
