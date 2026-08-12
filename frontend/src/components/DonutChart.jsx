import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const PALETA = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

// Rosca (não pizza cheia) para não competir com o miolo, com legenda sempre visível —
// pensado pra poucas categorias (2-6), nunca pra distribuições longas (isso é gráfico de barra).
// O rótulo na fatia mostra só o %: nome completo fica na legenda e no tooltip, senão
// o texto do rótulo estoura a largura do painel em rótulos longos (ex: "Aguardando Aprovação").
export function DonutChart({ data, height = 260, onSliceClick, formatValue }) {
  const total = data.reduce((soma, d) => soma + d.total, 0);
  const fmt = formatValue ?? ((v) => v.toLocaleString("pt-BR"));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <Pie
          data={data}
          dataKey="total"
          nameKey="label"
          innerRadius="55%"
          outerRadius="72%"
          paddingAngle={2}
          cornerRadius={3}
          cursor={onSliceClick ? "pointer" : "default"}
          onClick={onSliceClick ? (entry) => onSliceClick(entry.label) : undefined}
          label={({ total: valor }) => (total > 0 ? `${Math.round((valor / total) * 100)}%` : "")}
          labelLine={{ stroke: "var(--baseline)" }}
        >
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={PALETA[index % PALETA.length]} stroke="var(--surface-1)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          formatter={(valor, nome) => [fmt(valor), nome]}
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-primary)" }}
        />
        <Legend
          verticalAlign="bottom"
          height={48}
          formatter={(value) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
