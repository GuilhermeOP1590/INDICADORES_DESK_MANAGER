import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// ~6.3px por caractere é uma estimativa segura pra fontSize 12 nesse tema (fonte padrão do
// navegador) — o Recharts padrão quebraria o rótulo em várias linhas quando ele não cabe em
// `width`, e como cada barra só tem ~32px de altura, o texto quebrado invade a linha vizinha
// (nomes de loja longos tipo "SUPPLY DISTRIBUIDORA..." colidiam com a barra de cima/baixo).
// Truncar com reticências evita a quebra; o nome completo continua acessível via <title>
// (tooltip nativo do navegador ao passar o mouse no rótulo).
const PX_POR_CARACTERE = 6.3;

function truncarRotulo(texto, largura) {
  const maxChars = Math.max(4, Math.floor((largura - 8) / PX_POR_CARACTERE));
  if (!texto || texto.length <= maxChars) return texto;
  return `${texto.slice(0, maxChars - 1)}…`;
}

function criarTickEixoY(largura) {
  return function TickEixoY({ x, y, payload }) {
    return (
      <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="var(--text-secondary)">
        <title>{payload.value}</title>
        {truncarRotulo(payload.value, largura)}
      </text>
    );
  };
}

// Soma tanto `total` quanto os 3 valores empilhados (quando presentes, modo `stacked`) — sem
// isso "Outros (agregado)" perderia os segmentos de cor na aba "Todos". `labelKey` também
// precisa de um valor pronto no item agregado quando não é "total" (ex: "rotulo" com valor +
// quantidade já formatados) — sem isso o LabelList mostraria em branco nessa barra.
function foldTop(data, limit, agregarOutros, formatValue, labelKey) {
  if (data.length <= limit) return data;
  const top = data.slice(0, limit);
  if (!agregarOutros) return top;
  const restante = data.slice(limit);
  const temEmpilhado = restante.some((d) => d.aprovadoValor !== undefined);
  const somas = restante.reduce(
    (acc, d) => {
      acc.total += d.total;
      if (temEmpilhado) {
        acc.aprovadoValor += d.aprovadoValor ?? 0;
        acc.pendenteValor += d.pendenteValor ?? 0;
        acc.reprovadoValor += d.reprovadoValor ?? 0;
      }
      return acc;
    },
    { total: 0, aprovadoValor: 0, pendenteValor: 0, reprovadoValor: 0 }
  );
  const item = { label: "Outros (agregado)", total: somas.total, agregado: true };
  if (temEmpilhado) {
    Object.assign(item, {
      aprovadoValor: somas.aprovadoValor,
      pendenteValor: somas.pendenteValor,
      reprovadoValor: somas.reprovadoValor,
    });
  }
  if (labelKey !== "total") item[labelKey] = formatValue ? formatValue(somas.total) : String(somas.total);
  return [...top, item];
}

const SEGMENTOS_EMPILHADO = [
  { dataKey: "aprovadoValor", fill: "var(--status-good)" },
  { dataKey: "pendenteValor", fill: "var(--status-warning)" },
  { dataKey: "reprovadoValor", fill: "var(--status-critical)" },
];

export function HorizontalBarChart({
  data,
  color = "var(--series-1)",
  limit = 8,
  height = 260,
  onBarClick,
  formatValue,
  agregarOutros = true,
  yAxisWidth = 150,
  stacked = false,
  labelKey = "total",
}) {
  const chartData = foldTop(data, limit, agregarOutros, formatValue, labelKey);
  const handleClick = (entry) => {
    if (onBarClick) onBarClick(entry.label, Boolean(entry.agregado), entry);
  };
  const rotuloProps = {
    dataKey: labelKey,
    position: "right",
    formatter: labelKey === "total" ? formatValue : undefined,
    style: { fill: "var(--text-secondary)", fontSize: 11 },
  };

  return (
    <>
      {stacked && (
        <div className="hbc-legenda">
          <span><i style={{ background: "var(--status-good)" }} />Aprovado</span>
          <span><i style={{ background: "var(--status-warning)" }} />Pendente</span>
          <span><i style={{ background: "var(--status-critical)" }} />Reprovado</span>
        </div>
      )}
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
            tick={criarTickEixoY(yAxisWidth)}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            // Com um tick customizado o Recharts não consegue medir o rótulo renderizado pra
            // decidir sozinho quais ticks caberiam sem sobrepor — sem isso ele passa a pular
            // rótulo sim, rótulo não (a barra fica, só o nome some). interval=0 força mostrar
            // todas; a truncagem do tick já garante que não vão colidir.
            interval={0}
          />
          <Tooltip
            cursor={{ fill: "var(--gridline)" }}
            contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--text-primary)" }}
            formatter={formatValue ? (valor) => [formatValue(valor), "Valor"] : undefined}
          />
          {stacked ? (
            SEGMENTOS_EMPILHADO.map(({ dataKey, fill }, i) => (
              <Bar
                key={dataKey}
                dataKey={dataKey}
                stackId="pilha"
                fill={fill}
                background={i === 0 && onBarClick ? { fill: "transparent" } : undefined}
                radius={i === SEGMENTOS_EMPILHADO.length - 1 ? [0, 4, 4, 0] : undefined}
                maxBarSize={22}
                cursor={onBarClick ? "pointer" : "default"}
                onClick={onBarClick ? handleClick : undefined}
              >
                {i === SEGMENTOS_EMPILHADO.length - 1 && <LabelList {...rotuloProps} />}
              </Bar>
            ))
          ) : (
            <Bar
              dataKey="total"
              fill={color}
              background={onBarClick ? { fill: "transparent" } : undefined}
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              cursor={onBarClick ? "pointer" : "default"}
              onClick={onBarClick ? handleClick : undefined}
            >
              <LabelList {...rotuloProps} />
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
