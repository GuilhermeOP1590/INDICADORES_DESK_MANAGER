# Abas de status + ranking por empresa no "Orçamento por região" — design

## Contexto

Dentro do painel "Orçamento por região" (`RegiaoOrcamentoPanel.jsx`), o
gráfico "Custo por unidade" mostra hoje um valor único por loja, somando
aprovado + pendente (`l.aprovado.valor + l.pendente.valor`, a partir do
`porLoja` que a feature anterior desta sessão já constrói com os 3 buckets
separados). Ficou confuso: dá pra ver o total, mas não quanto disso já
está aprovado, quanto ainda está pendente de aprovação e quanto foi
reprovado.

Pedido, validado com protótipo clicável:

- **Abas no topo do gráfico** — Aprovado / Pendente / Reprovado / Todos.
  Abre por padrão em **Aprovado**. Nas 3 primeiras abas o gráfico continua
  sendo uma barra simples por loja, só que usando o valor daquele bucket
  em vez do total somado. Em **Todos**, cada barra vira 3 segmentos de cor
  (verde/amarelo/vermelho) lado a lado, mesma barra.
- **Ranking por empresa** (fornecedor) — pedido no meio da conversa ("já
  que estamos mexendo também"): mesma ideia de abas, mas agrupando por
  **empresa** em vez de loja. "Empresa" aqui é o campo extra `_19465` do
  Desk (mesmo campo usado na coluna "Empresa" da lista de chamados, feature
  anterior desta sessão) — só existe pra chamado que já passou por
  "Aguardando Aprovação". Métrica escolhida: valor (R$) **e** quantidade de
  orçamentos lado a lado (não só um dos dois). Local escolhido: dentro do
  mesmo painel "Orçamento por região", filtrado pela mesma UF selecionada.

**Volume de dados hoje**: só 21 chamados (de 4.608) têm o campo Empresa
preenchido — é um campo novo, recém-adicionado no Desk. O ranking vai
começar pequeno (5 empresas na consulta feita em 2026-08-27) e crescer
conforme mais chamados passem por aprovação. Decisão explícita do usuário:
seguir mesmo com esse volume baixo.

Decisões tomadas em conversa/protótipo:

- Abas reaproveitam o componente `SubTabs` já usado em outras telas do
  app — sem componente de aba novo.
- "Todos" empilha os 3 valores na mesma barra (não é uma 4ª barra ao
  lado). Ordenação de "Todos" usa aprovado+pendente (reprovado fica de
  fora do critério de ordenação, mesmo racional já aplicado em
  `buildOrcamento`/`buildPorLojaOrcamento` — reprovado é visível mas não
  conta como custo comprometido), mas o segmento reprovado **aparece** na
  barra e entra na soma do rótulo final.
- Clicar em qualquer barra, em qualquer aba, continua abrindo a lista de
  chamados (loja: navegação completa Especialidade → Categoria →
  Equipamento já existente; empresa: direto a lista, sem níveis
  intermediários — não há taxonomia adicional pra fornecedor). A aba ativa
  passa a decidir **qual status** os chamados finais têm: Aprovado →
  `statusAprovacao=avaliado`, Pendente → `aguardando`, Reprovado →
  `reprovado`, Todos → `comOrcamento` (o comportamento único que já existia
  antes desta feature).
- Chamado sem "Empresa" preenchida simplesmente não entra no ranking (não
  existe bucket "Não informado" aqui — ao contrário de loja/UF, que sempre
  têm um valor, "sem fornecedor identificado" não ajuda a decisão que essa
  tela quer responder).

Fora de escopo: abas nos cards de UF (MG/BA) acima do gráfico — eles
continuam mostrando pendente/avaliado como texto, sem gráfico de barras;
o pedido do usuário foi só sobre o gráfico "Custo por unidade" e o novo
ranking de empresa.

## Arquitetura

### Backend

**`backend/src/services/orcamento.js`** ganha uma função nova,
`buildPorEmpresaOrcamento`, reaproveitando os helpers já criados pra
`buildPorLojaOrcamento` (`novoNo`, `acumularBucket`, `arredondarNo`,
`totalNo` — já existem no arquivo, sem mudança neles). É uma versão "achatada"
(1 nível só, sem especialidade/categoria/equipamento) agrupando por
`(empresa, uf)`:

```js
// Empresa (fornecedor) só existe pra chamado que já passou por "Aguardando Aprovação" — é
// o campo extra _19465, digitado nessa etapa (ver historicoChamado.js#extrairNomeEmpresa).
// Chamado sem empresa preenchida fica fora do ranking: não existe bucket "Não informado" aqui
// porque "sem fornecedor identificado" não ajuda a decisão que esse ranking quer responder
// (ao contrário de loja/UF, que sempre têm valor e por isso usam esse fallback em outro lugar).
export function buildPorEmpresaOrcamento(chamados, historicoMap) {
  const aguardando = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação");
  const avaliadosBrutos = chamados.filter(
    (c) => historicoMap.get(c.Chave)?.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação"
  );
  const aprovados = avaliadosBrutos.filter((c) => !foiReprovado(c));
  const reprovados = avaliadosBrutos.filter(foiReprovado);

  const empresas = new Map();

  function processar(lista, bucket) {
    for (const c of lista) {
      const nomeEmpresa = historicoMap.get(c.Chave)?.nomeEmpresa;
      if (!nomeEmpresa) continue;
      const chave = `${nomeEmpresa}||${c.uf || ""}`;
      const no = empresas.get(chave) ?? novoNo({ empresa: nomeEmpresa, uf: c.uf || null });
      empresas.set(chave, no);
      acumularBucket(no, bucket, c, historicoMap);
    }
  }

  processar(aguardando, "pendente");
  processar(aprovados, "aprovado");
  processar(reprovados, "reprovado");

  return [...empresas.values()].map(arredondarNo).sort((a, b) => totalNo(b) - totalNo(a));
}
```

`buildOrcamento` ganha uma linha a mais no objeto retornado:
`porEmpresa: buildPorEmpresaOrcamento(chamados, historicoMap)`.

**`backend/src/routes/indicadores.js`**, rota `/chamados`: precisa de um
filtro novo, `empresa`, pro clique numa barra do ranking abrir a lista
certa (hoje o campo só existe na resposta, não como filtro de entrada).
Reaproveita o `historicoMap` que a rota já calcula sob demanda:

```js
// Linha ~565: acrescentar `empresa` na desestruturação de req.query
const {
  especialidade,
  tipo,
  tipoAtividade,
  atividade,
  equipamento,
  cliente,
  operador,
  status,
  situacao,
  causa,
  statusAprovacao,
  empresa,
  q,
  dimensao,
  foraDoTopo,
  nivel,
} = req.query;

// Linha ~612: acrescentar `empresa` na condição que decide se busca o histórico, e o filtro
// correspondente dentro do bloco que já existe
if (causa || statusAprovacao || empresa || foraDoTopoCausa) {
  historicoMap = await obterHistoricoEmLote(filtrados);
  filtrados = filtrados.filter((c) => {
    const historico = historicoMap.get(c.Chave) || {};
    if (causa && historico.causa !== causa) return false;
    if (empresa && historico.nomeEmpresa !== empresa) return false;
    // ... resto do bloco existente (statusAprovacao) sem mudança
  });
}
```

Nenhuma outra rota muda.

### Frontend

**`frontend/src/components/HorizontalBarChart.jsx`** ganha 2 props
opcionais novas, `stacked` (default `false`) e `labelKey` (default
`"total"`), sem mudar o comportamento de nenhum dos outros ~10 lugares que
usam o componente (nenhum passa essas props hoje). Reescrita completa do
arquivo:

```jsx
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
// quantidade já formatados) — sem formatter aplicado depois, o LabelList mostraria em branco.
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
  if (temEmpilhado) Object.assign(item, {
    aprovadoValor: somas.aprovadoValor,
    pendenteValor: somas.pendenteValor,
    reprovadoValor: somas.reprovadoValor,
  });
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
```

**`frontend/src/styles.css`** ganha a classe da legenda (mesmo padrão
visual do protótipo aprovado, adaptado às variáveis de tema do app):

```css
.hbc-legenda { display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.hbc-legenda span { display: flex; align-items: center; gap: 5px; }
.hbc-legenda i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
```

**`frontend/src/components/MaximizableChart.jsx`**: 2 props novas,
`stacked` e `labelKey`, repassadas pros 3 pontos onde o componente
instancia `<HorizontalBarChart>` (preview + os 2 ramos dentro do modal).
A tabela de fallback (`RankingTable`, ramo com mais de
`LIMITE_BARRAS_MAXIMIZADO` itens) ganha colunas extras Aprovado/Pendente/
Reprovado quando `stacked` — mesmo padrão de coluna já usado em
`DrillDownContent.jsx` pros níveis de loja, só que aqui os dados já
chegam achatados (`d.aprovadoValor`, não `d.aprovado.valor`):

```jsx
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { RankingTable } from "./RankingTable.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

const LIMITE_BARRAS_MAXIMIZADO = 12;
const TOP_N_MAXIMIZADO = 10;

export function MaximizableChart({
  title,
  subtitle,
  data,
  color,
  limit = 8,
  filtroBase,
  dimensaoFiltro,
  formatValue,
  resumoPorCliente,
  agregarOutros = true,
  fetcher,
  fullWidth = false,
  previewHeight = 220,
  stacked = false,
  labelKey = "total",
}) {
  const drill = useDrillDown();

  const colunasOrcamento = stacked
    ? [
        { header: "Aprovado", render: (d) => (formatValue ? formatValue(d.aprovadoValor) : d.aprovadoValor), sortKeyName: "aprovadoValor" },
        { header: "Pendente", render: (d) => (formatValue ? formatValue(d.pendenteValor) : d.pendenteValor), sortKeyName: "pendenteValor" },
        {
          header: "Reprovado",
          render: (d) => (d.reprovadoValor > 0 ? (formatValue ? formatValue(d.reprovadoValor) : d.reprovadoValor) : "—"),
          sortKeyName: "reprovadoValor",
        },
      ]
    : undefined;

  return (
    <div className={`panel maximizable${fullWidth ? " full-width" : ""}`} onClick={() => !drill.pilha && drill.abrir()}>
      <div className="panel-header-row">
        <div>
          <h2>{title}</h2>
          <p className="subtitle">{subtitle}</p>
        </div>
        <span className="expand-hint">⤢</span>
      </div>
      <HorizontalBarChart
        data={data}
        color={color}
        limit={limit}
        height={previewHeight}
        formatValue={formatValue}
        agregarOutros={agregarOutros}
        stacked={stacked}
        labelKey={labelKey}
      />

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? title} onClose={drill.fechar} onBack={drill.pilha.length > 0 ? drill.voltar : undefined}>
          {!drill.topo &&
            (() => {
              const selecionar = (label, agregado, entry) => {
                if (agregado) {
                  const foraDoTopo = data.slice(0, TOP_N_MAXIMIZADO).map((d) => d.label);
                  drill.abrirLista(
                    { ...filtroBase, dimensao: dimensaoFiltro, foraDoTopo: foraDoTopo.join("|") },
                    "Outros (agregado)",
                    fetcher
                  );
                } else if (entry?.itens) {
                  drill.abrirSubRanking(entry.itens, label, { filtroBase, fetcher, color, formatValue });
                } else if (entry?.porEspecialidade) {
                  drill.abrirResumoLojaOrcamento(entry.porEspecialidade, label, { ...filtroBase, [dimensaoFiltro]: label });
                } else if (resumoPorCliente) {
                  drill.abrirResumoCliente({ ...filtroBase, cliente: label }, label);
                } else {
                  drill.abrirLista({ ...filtroBase, [dimensaoFiltro]: label }, label, fetcher);
                }
              };

              if (data.length <= LIMITE_BARRAS_MAXIMIZADO) {
                return (
                  <HorizontalBarChart
                    data={data}
                    color={color}
                    limit={30}
                    height={Math.max(320, Math.min(data.length, 31) * 26)}
                    agregarOutros={agregarOutros}
                    onBarClick={selecionar}
                    formatValue={formatValue}
                    stacked={stacked}
                    labelKey={labelKey}
                  />
                );
              }

              return (
                <div>
                  <HorizontalBarChart
                    data={data}
                    color={color}
                    limit={TOP_N_MAXIMIZADO}
                    height={TOP_N_MAXIMIZADO * 26}
                    agregarOutros={agregarOutros}
                    onBarClick={selecionar}
                    formatValue={formatValue}
                    stacked={stacked}
                    labelKey={labelKey}
                  />
                  <h3 style={{ marginTop: 20 }}>Todos ({data.length})</h3>
                  <RankingTable data={data} formatValue={formatValue} onSelecionar={selecionar} colunasExtras={colunasOrcamento} />
                </div>
              );
            })()}
          <DrillDownContent
            topo={drill.topo}
            onAbrirChamado={drill.abrirChamado}
            onAbrirLista={(filtros, titulo) => drill.abrirListaEmpilhada(filtros, titulo, fetcher)}
            onAbrirResumoCategoria={drill.abrirResumoCategoriaOrcamento}
            onAbrirResumoEquipamento={drill.abrirResumoEquipamentoOrcamento}
          />
        </Modal>
      )}
    </div>
  );
}
```

**`frontend/src/components/RegiaoOrcamentoPanel.jsx`**: reescrita
completa. Ganha `porEmpresa` como prop nova, `SubTabs` acima de cada
gráfico com estado próprio (`abaCusto`/`abaEmpresa` — independentes, cada
gráfico pode estar numa aba diferente), e a função `montarRanking` que
achata um nó (`porLoja` ou `porEmpresa`, mesmo formato `{aprovado,
pendente, reprovado}`) pro shape que `HorizontalBarChart` espera, já
considerando a aba ativa:

```jsx
import { useState } from "react";
import { StatTile } from "./StatTile.jsx";
import { SubTabs } from "./SubTabs.jsx";
import { MaximizableChart } from "./MaximizableChart.jsx";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ABAS_ORCAMENTO = [
  { value: "aprovado", label: "Aprovado" },
  { value: "pendente", label: "Pendente" },
  { value: "reprovado", label: "Reprovado" },
  { value: "todos", label: "Todos" },
];

// Cada aba mapeia pro filtro que /chamados já entende (statusAprovacao) — clicar numa barra
// sob qualquer aba abre só os chamados daquele status, não a mistura de sempre. "todos" usa o
// filtro combinado que já existia antes desta feature (pendente + avaliado).
const STATUS_POR_ABA = { aprovado: "avaliado", pendente: "aguardando", reprovado: "reprovado", todos: "comOrcamento" };

function montarRanking(lista, aba, uf, labelKey) {
  const daRegiao = (lista ?? []).filter((n) => n.uf === uf);

  if (aba === "todos") {
    return daRegiao
      .map((n) => {
        const total = n.aprovado.valor + n.pendente.valor + n.reprovado.valor;
        const quantidade = n.aprovado.total + n.pendente.total + n.reprovado.total;
        return {
          label: n[labelKey],
          total,
          // Mesmo racional de buildOrcamento: reprovado aparece na barra e no rótulo, mas
          // fica fora do critério de ordenação (não é "custo comprometido").
          ordenarPor: n.aprovado.valor + n.pendente.valor,
          aprovadoValor: n.aprovado.valor,
          pendenteValor: n.pendente.valor,
          reprovadoValor: n.reprovado.valor,
          rotulo: `${formatBRL(total)} (${quantidade})`,
          porEspecialidade: n.porEspecialidade,
        };
      })
      .sort((a, b) => b.ordenarPor - a.ordenarPor);
  }

  return daRegiao
    .map((n) => ({
      label: n[labelKey],
      total: n[aba].valor,
      rotulo: `${formatBRL(n[aba].valor)} (${n[aba].total})`,
      porEspecialidade: n.porEspecialidade,
    }))
    .filter((n) => n.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function RegiaoOrcamentoPanel({ porUf, porLoja, porEmpresa, filtroBase }) {
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);
  const [abaCusto, setAbaCusto] = useState("aprovado");
  const [abaEmpresa, setAbaEmpresa] = useState("aprovado");
  const regioes = (porUf ?? []).filter((u) => u.uf !== "Não informado");
  if (regioes.length === 0) return null;

  const clientesDaRegiao = regiaoSelecionada ? montarRanking(porLoja, abaCusto, regiaoSelecionada, "cliente") : [];
  const empresasDaRegiao = regiaoSelecionada ? montarRanking(porEmpresa, abaEmpresa, regiaoSelecionada, "empresa") : [];

  return (
    <div className="panel full-width">
      <h2>Orçamento por região</h2>
      <p className="subtitle">Valor pendente + já avaliado por estado — clique num card pra ver por unidade</p>
      <section className="stat-grid">
        {regioes.map((u) => {
          const total = u.aguardandoValor + u.avaliadosValor;
          return (
            <StatTile
              key={u.uf}
              label={u.uf}
              value={formatBRL(total)}
              meta={`${formatBRL(u.aguardandoValor)} aguardando · ${formatBRL(u.avaliadosValor)} avaliado`}
              statusClass={regiaoSelecionada === u.uf ? "status-good" : undefined}
              onClick={() => setRegiaoSelecionada((atual) => (atual === u.uf ? null : u.uf))}
            />
          );
        })}
      </section>

      {regiaoSelecionada && (
        <>
          <SubTabs options={ABAS_ORCAMENTO} active={abaCusto} onChange={setAbaCusto} />
          {clientesDaRegiao.length > 0 ? (
            <MaximizableChart
              title={`Custo por unidade — ${regiaoSelecionada}`}
              subtitle="Valor por loja/unidade — clique numa barra pra ver os chamados"
              data={clientesDaRegiao}
              color="var(--series-6)"
              limit={10}
              filtroBase={{ ...filtroBase, uf: regiaoSelecionada, statusAprovacao: STATUS_POR_ABA[abaCusto] }}
              dimensaoFiltro="cliente"
              formatValue={formatBRL}
              labelKey="rotulo"
              stacked={abaCusto === "todos"}
            />
          ) : (
            <p className="subtitle" style={{ marginTop: 12 }}>
              Nenhum chamado {ABAS_ORCAMENTO.find((a) => a.value === abaCusto).label.toLowerCase()} em {regiaoSelecionada} nesse período.
            </p>
          )}

          <SubTabs options={ABAS_ORCAMENTO} active={abaEmpresa} onChange={setAbaEmpresa} />
          {empresasDaRegiao.length > 0 ? (
            <MaximizableChart
              title={`Ranking por empresa — ${regiaoSelecionada}`}
              subtitle="Fornecedores com maior custo em orçamentos — clique numa barra pra ver os chamados"
              data={empresasDaRegiao}
              color="var(--series-2)"
              limit={10}
              filtroBase={{ ...filtroBase, uf: regiaoSelecionada, statusAprovacao: STATUS_POR_ABA[abaEmpresa] }}
              dimensaoFiltro="empresa"
              formatValue={formatBRL}
              labelKey="rotulo"
              stacked={abaEmpresa === "todos"}
            />
          ) : (
            <p className="subtitle" style={{ marginTop: 12 }}>
              Nenhuma empresa com custo {ABAS_ORCAMENTO.find((a) => a.value === abaEmpresa).label.toLowerCase()} em {regiaoSelecionada} nesse período.
            </p>
          )}
        </>
      )}
    </div>
  );
}
```

Nota: o texto de "Todos" nas duas mensagens de estado vazio fica "Nenhum
chamado todos em..." (gramaticalmente estranho) — é um caso de borda que
praticamente não ocorre (a aba "Todos" só fica vazia se a loja/empresa não
tiver NENHUM chamado com orçamento na região, caso em que ela nem apareceria
no `porLoja`/`porEmpresa` pra começo de conversa). Sem tratamento especial.

**`frontend/src/pages/Orcamento.jsx`**: 1 linha muda, acrescentando
`porEmpresa`:

```jsx
<RegiaoOrcamentoPanel porUf={payload.porUf} porLoja={payload.porLoja} porEmpresa={payload.porEmpresa} filtroBase={filtroBase} />
```

## Testes

- `backend/src/services/orcamento.test.js`: `buildPorEmpresaOrcamento` —
  agrupa por (empresa, uf); separa aprovado/pendente/reprovado; soma
  valor e quantidade corretamente; chamado sem `nomeEmpresa` no histórico
  fica de fora; duas empresas com o mesmo nome em UFs diferentes viram
  entradas separadas; ordena por aprovado+pendente decrescente (reprovado
  fora do critério de ordenação, mesmo padrão de `buildPorLojaOrcamento`).
- Sem arquivo de teste de rota no projeto (nenhuma rota em
  `backend/src/routes/indicadores.js` tem teste automatizado hoje — mesmo
  padrão já usado pra validar o filtro `equipamento=` na feature anterior).
  O filtro `empresa=` novo é verificado manualmente via curl, junto com o
  resto do fluxo (ver abaixo).
- Sem teste automatizado de frontend (o projeto não usa framework de teste
  no frontend) — verificação manual: `npm run build` limpo +
  clicar/navegar nas 4 abas dos dois gráficos com o servidor local rodando,
  conferir que os valores batem com o que o script de inspeção mostrou
  (MESQUITA REFRIGERAÇÃO, MG, aprovado R$ 39.211,60/14 chamados).

## Fluxo de dados (resumo)

```
GET /api/orcamento
  → buildOrcamento(chamados, historicoMap)
      → ... (como já existia, incluindo porLoja)
      → porEmpresa: buildPorEmpresaOrcamento(chamados, historicoMap)
           [{ empresa, uf, aprovado: {total, valor}, pendente: {...}, reprovado: {...} }, ...]

RegiaoOrcamentoPanel, com uma UF selecionada:
  montarRanking(porLoja, abaCusto, uf, "cliente") → data pro gráfico "Custo por unidade"
  montarRanking(porEmpresa, abaEmpresa, uf, "empresa") → data pro gráfico "Ranking por empresa"
  (cada uma achata pro bucket da aba ativa, ou pros 3 valores separados se abaX === "todos")

Clique numa barra (qualquer um dos 2 gráficos, qualquer aba):
  filtroBase já traz: uf, statusAprovacao: STATUS_POR_ABA[abaAtiva], período, busca
  - Custo por unidade → mesma navegação Loja → Especialidade → Categoria → Equipamento →
    chamados já existente (herda o statusAprovacao da aba ativa em toda a cadeia)
  - Ranking por empresa → direto GET /api/chamados?empresa=X&statusAprovacao=...&uf=...
    (sem níveis intermediários — fornecedor não tem taxonomia interna nessa tela)
```
