import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Somar só faz sentido pra valores aditivos (contagem, R$). Uma taxa/percentual (ex: % de
// resolução) não pode virar "Outros (agregado): 670%" — nesse caso só corta o excedente
// sem fingir um total (ver agregarOutros abaixo).
function foldTop(data, limit, agregarOutros) {
  if (data.length <= limit) return data;
  const top = data.slice(0, limit);
  if (!agregarOutros) return top;
  const outros = data.slice(limit).reduce((sum, d) => sum + d.total, 0);
  return [...top, { label: "Outros (agregado)", total: outros, agregado: true }];
}

export function HorizontalBarChart({
  data,
  color = "var(--series-1)",
  limit = 8,
  height = 260,
  onBarClick,
  formatValue,
  agregarOutros = true,
  yAxisWidth = 150,
}) {
  const chartData = foldTop(data, limit, agregarOutros);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--gridline)" />
        <XAxis
          type="number"
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
          allowDecimals={false}
          tickFormatter={formatValue}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={yAxisWidth}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--gridline)" }}
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-primary)" }}
          formatter={formatValue ? (valor) => [formatValue(valor), "Valor"] : undefined}
        />
        <Bar
          dataKey="total"
          fill={color}
          background={onBarClick ? { fill: "transparent" } : undefined}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          cursor={onBarClick ? "pointer" : "default"}
          onClick={(entry) => {
            if (onBarClick) onBarClick(entry.label, Boolean(entry.agregado), entry);
          }}
        >
          <LabelList
            dataKey="total"
            position="right"
            formatter={formatValue}
            style={{ fill: "var(--text-secondary)", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
