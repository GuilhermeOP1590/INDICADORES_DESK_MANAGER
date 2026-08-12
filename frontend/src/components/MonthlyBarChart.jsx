import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatMes(mes) {
  const [ano, mesNum] = mes.split("-");
  return `${mesNum}/${ano}`;
}

// Gráfico de barras por mês, genérico — reaproveitado tanto pro comparativo de 2 séries
// (Preventiva x Corretiva) quanto pra série única (tempo aguardando peça), evita duplicar a
// configuração do recharts pros dois casos. `series.length > 1` liga a legenda automaticamente.
// `onBarClick(mes, dataKey)` é opcional — quando presente, cada barra abre o drill-down do mês
// (e, em gráfico multi-série, da série específica clicada).
export function MonthlyBarChart({ data, series, formatValue, onBarClick, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="mes"
          tickFormatter={formatMes}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
          tickFormatter={formatValue}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "var(--gridline)" }}
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={formatMes}
          formatter={formatValue ? (valor, nome) => [formatValue(valor), nome] : undefined}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            fill={s.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            cursor={onBarClick ? "pointer" : "default"}
            onClick={onBarClick ? (entry) => onBarClick(entry.mes, s.dataKey) : undefined}
          >
            <LabelList
              dataKey={s.dataKey}
              position="top"
              formatter={formatValue}
              style={{ fill: "var(--text-secondary)", fontSize: 11 }}
            />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
