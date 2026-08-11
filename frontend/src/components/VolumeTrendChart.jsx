import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { agruparSerie } from "../lib/datas.js";

function formatLabel(label, granularidade) {
  if (!label || label === "Não informado") return label;

  if (granularidade === "mes") {
    const [ano, mes] = label.split("-");
    return `${mes}/${ano}`;
  }

  // "dia" e "semana" usam data ISO (semana = segunda-feira daquela semana)
  const [, mes, dia] = label.split("-");
  return `${dia}/${mes}`;
}

export function VolumeTrendChart({ data, granularidade = "dia", days = 90 }) {
  const serie = agruparSerie(
    data.filter((d) => d.label !== "Não informado"),
    granularidade
  );

  const chartData = serie.slice(-days).map((d) => ({ periodo: formatLabel(d.label, granularidade), total: d.total }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="periodo"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
        <Tooltip
          cursor={{ stroke: "var(--baseline)" }}
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-primary)" }}
        />
        <Line type="monotone" dataKey="total" name="Chamados criados" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
