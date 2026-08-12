import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

function ehFimDeSemana(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const diaSemana = new Date(ano, mes - 1, dia).getDay();
  return diaSemana === 0 || diaSemana === 6;
}

// Linha só faz sentido com pontos suficientes pra sugerir uma tendência contínua — com poucos
// pontos (típico de "Mês" numa janela curta) ela vira um segmento reto entre 2-3 pontos, o que
// mais confunde do que ajuda. Abaixo desse limiar, barra é a leitura honesta (dataviz skill).
const LIMITE_PARA_BARRAS = 8;

// Cada categoria (dia/semana/mês) precisa de espaço mínimo pra não amassar quando o período
// tem muitos pontos (ex: mês inteiro em "Dia") — o gráfico cresce e rola horizontalmente em
// vez de espremer tudo no espaço fixo do painel.
const LARGURA_POR_PONTO = { barras: 90, area: 46 };
const LARGURA_MINIMA = 600;

const TOOLTIP_STYLE = {
  contentStyle: { background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "var(--text-primary)" },
};

// Data do tooltip em vermelho/negrito quando o ponto sob o mouse é fim de semana — funciona
// mesmo quando o rótulo daquele dia não é um dos exibidos no eixo (ver TickPeriodo acima).
function tooltipLabelFormatter(label, payload) {
  const fimDeSemana = payload?.[0]?.payload?.fimDeSemana;
  if (!fimDeSemana) return label;
  return <span style={{ fontWeight: 700, color: "var(--status-critical)" }}>{label}</span>;
}

// Total do período fica acima da pilha (fechados+abertos) — sem isso o usuário só vê a
// composição, não o volume criado naquele dia, que é a pergunta original do gráfico.
function TotalLabel({ x = 0, y = 0, width = 0, index, chartData }) {
  const total = chartData[index]?.total;
  if (!total) return null;
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fill="var(--text-secondary)" fontSize={11}>
      {total}
    </text>
  );
}

// Marca sábado/domingo com uma linha vertical tracejada — uma faixa (ReferenceArea) com
// x1=x2 fica com largura zero e some quando o eixo usa escala de ponto (caso do gráfico de
// área, com mais de 8 dias), então uma linha é a forma que funciona nos dois modos.
// Vermelha (não cinza) porque é o único marcador de fim de semana garantido pra TODO
// sábado/domingo — o rótulo de texto do eixo (TickPeriodo) só existe nos dias que o recharts
// decide mostrar (minTickGap/preserveStartEnd descartam a maioria num período longo).
function LinhasFimDeSemana({ chartData }) {
  return chartData
    .filter((d) => d.fimDeSemana)
    .map((d) => (
      <ReferenceLine key={d.periodo} x={d.periodo} stroke="var(--status-critical)" strokeOpacity={0.5} strokeDasharray="3 3" />
    ));
}

// Rótulo do eixo X em vermelho/negrito nos dias de fim de semana — reforça visualmente a
// mesma informação da linha tracejada, mas legível mesmo sem passar o mouse.
function TickPeriodo({ x, y, payload, finsDeSemana }) {
  const destaque = finsDeSemana.has(payload.value);
  return (
    <text
      x={x}
      y={y + 10}
      textAnchor="middle"
      fontSize={11}
      fontWeight={destaque ? 700 : 400}
      fill={destaque ? "var(--status-critical)" : "var(--text-muted)"}
    >
      {payload.value}
    </text>
  );
}

export function VolumeTrendChart({ data, granularidade = "dia", days = 90, onSelecionarPeriodo }) {
  const serie = agruparSerie(
    data.filter((d) => d.label !== "Não informado"),
    granularidade
  );

  const chartData = serie.slice(-days).map((d) => ({
    label: d.label,
    periodo: formatLabel(d.label, granularidade),
    fimDeSemana: granularidade === "dia" && ehFimDeSemana(d.label),
    total: d.total,
    fechados: d.fechados ?? 0,
    abertos: d.abertos ?? 0,
  }));

  const finsDeSemana = new Set(chartData.filter((d) => d.fimDeSemana).map((d) => d.periodo));

  const usaBarras = chartData.length <= LIMITE_PARA_BARRAS;
  const largura = Math.max(LARGURA_MINIMA, chartData.length * (usaBarras ? LARGURA_POR_PONTO.barras : LARGURA_POR_PONTO.area));

  function handleClick(state) {
    const ponto = state?.activePayload?.[0]?.payload;
    if (ponto && onSelecionarPeriodo) onSelecionarPeriodo(ponto.label);
  }

  const grafico = usaBarras ? (
    <ComposedChart data={chartData} margin={{ left: 0, right: 16, top: 20, bottom: 4 }} onClick={handleClick}>
      <CartesianGrid vertical={false} stroke="var(--gridline)" />
      <LinhasFimDeSemana chartData={chartData} />
      <XAxis
        dataKey="periodo"
        tick={<TickPeriodo finsDeSemana={finsDeSemana} />}
        axisLine={{ stroke: "var(--baseline)" }}
        tickLine={false}
      />
      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
      <Tooltip cursor={{ fill: "var(--gridline)" }} {...TOOLTIP_STYLE} labelFormatter={tooltipLabelFormatter} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <Bar dataKey="fechados" name="Fechados" stackId="volume" fill="var(--status-good)" maxBarSize={64} cursor={onSelecionarPeriodo ? "pointer" : "default"} />
      <Bar
        dataKey="abertos"
        name="Em aberto"
        stackId="volume"
        fill="var(--status-warning)"
        radius={[4, 4, 0, 0]}
        maxBarSize={64}
        cursor={onSelecionarPeriodo ? "pointer" : "default"}
      >
        <LabelList dataKey="abertos" content={(props) => <TotalLabel {...props} chartData={chartData} />} />
      </Bar>
      <Line type="monotone" dataKey="total" name="Total" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
    </ComposedChart>
  ) : (
    <ComposedChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 4 }} onClick={handleClick}>
      <CartesianGrid vertical={false} stroke="var(--gridline)" />
      <LinhasFimDeSemana chartData={chartData} />
      <XAxis
        dataKey="periodo"
        tick={<TickPeriodo finsDeSemana={finsDeSemana} />}
        axisLine={{ stroke: "var(--baseline)" }}
        tickLine={false}
        interval="preserveStartEnd"
        minTickGap={24}
      />
      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
      <Tooltip cursor={{ stroke: "var(--baseline)" }} {...TOOLTIP_STYLE} labelFormatter={tooltipLabelFormatter} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <Area
        type="monotone"
        dataKey="fechados"
        name="Fechados"
        stackId="volume"
        stroke="var(--status-good)"
        fill="var(--status-good)"
        fillOpacity={0.35}
      />
      <Area
        type="monotone"
        dataKey="abertos"
        name="Em aberto"
        stackId="volume"
        stroke="var(--status-warning)"
        fill="var(--status-warning)"
        fillOpacity={0.35}
      />
      <Line type="monotone" dataKey="total" name="Total" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
    </ComposedChart>
  );

  return (
    <div>
      {granularidade === "dia" && (
        <p className="meta" style={{ marginBottom: 4 }}>
          Linhas tracejadas vermelhas marcam sábados e domingos
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: largura, height: 280, cursor: onSelecionarPeriodo ? "pointer" : "default" }}>
          <ResponsiveContainer width="100%" height="100%">
            {grafico}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
