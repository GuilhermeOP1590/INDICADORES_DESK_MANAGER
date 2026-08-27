# Abas de status + ranking por empresa no "Orçamento por região" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No painel "Orçamento por região", trocar o gráfico "Custo por unidade" (valor único por loja) por 4 abas (Aprovado/Pendente/Reprovado/Todos, "Todos" empilhado por cor) e adicionar um segundo gráfico, "Ranking por empresa" (fornecedor), com as mesmas 4 abas.

**Architecture:** Backend ganha 1 função nova (`buildPorEmpresaOrcamento`, mesmo padrão de `buildPorLojaOrcamento` já existente) e 1 filtro novo na rota `/chamados` (`empresa`). Frontend: `HorizontalBarChart` ganha um modo `stacked` opcional (3 `<Bar>` com `stackId` em vez de 1) usado só quando a aba "Todos" está ativa; `RegiaoOrcamentoPanel` passa a controlar 2 abas independentes (uma por gráfico) e achata os dados (`porLoja`/`porEmpresa`) pro formato que o gráfico espera, considerando a aba ativa.

**Tech Stack:** Node 20 / Express (backend, `node --test`), React 18 / Vite / Recharts (frontend, sem framework de teste — verificação via `npm run build` + curl contra o backend real).

## Global Constraints

- Reaproveitar os helpers já existentes em `orcamento.js` (`novoNo`, `acumularBucket`, `arredondarNo`, `totalNo`, `foiReprovado`) — nenhum deles muda.
- Chamado sem `nomeEmpresa` no histórico fica de fora do ranking de empresa — não existe bucket "Não informado" aqui (diferente de loja/UF).
- `HorizontalBarChart` ganha props novas com defaults que preservam 100% o comportamento atual (`stacked = false`, `labelKey = "total"`) — nenhum dos ~10 consumidores existentes deve mudar de comportamento.
- Ordenação em "Todos": sempre `aprovado.valor + pendente.valor` (reprovado fica de fora do critério de ordenação, mas aparece no segmento da barra e no valor total do rótulo) — mesmo racional já usado em `buildOrcamento`/`buildPorLojaOrcamento`.
- Cores dos segmentos empilhados: `var(--status-good)` (aprovado), `var(--status-warning)` (pendente), `var(--status-critical)` (reprovado) — já existem em `frontend/src/styles.css`, não criar cor nova.
- Reaproveitar o componente `SubTabs` (`frontend/src/components/SubTabs.jsx`) já existente — não criar componente de aba novo.
- Projeto não tem teste automatizado de rota (nenhuma rota em `backend/src/routes/indicadores.js` tem hoje) nem framework de teste no frontend — filtro `empresa=` da rota e todo o fluxo de frontend são verificados manualmente via curl/`npm run build`, mesmo padrão já usado nas features anteriores desta sessão.
- Mapeamento aba → `statusAprovacao` usado em todo clique de barra: `aprovado→avaliado`, `pendente→aguardando`, `reprovado→reprovado`, `todos→comOrcamento`.

---

### Task 1: Backend — `buildPorEmpresaOrcamento`

**Files:**
- Modify: `backend/src/services/orcamento.js`
- Test: `backend/src/services/orcamento.test.js`

**Interfaces:**
- Consumes: `novoNo(camposExtra)`, `acumularBucket(no, bucket, chamado, historicoMap)`, `arredondarNo(no)`, `totalNo(no)`, `foiReprovado(chamado)` — todos já existem em `orcamento.js`, sem mudança.
- Produces: `export function buildPorEmpresaOrcamento(chamados, historicoMap)` → `Array<{ empresa: string, uf: string|null, aprovado: {total, valor}, pendente: {total, valor}, reprovado: {total, valor} }>`, ordenado por `aprovado.valor + pendente.valor` decrescente. Usado no Task 2 (wiring em `buildOrcamento`) e consumido no frontend a partir do Task 5 (via o campo `porEmpresa` do payload).

- [ ] **Step 1: Escrever os testes que falham**

Abra `backend/src/services/orcamento.test.js` e acrescente ao final do arquivo (depois do último `test(...)` existente, incluindo a importação de `buildPorEmpresaOrcamento`):

```js
// No topo do arquivo, ajustar a linha de import existente:
// import { buildResumoRapidoOrcamento, buildOrcamento, foiReprovado, buildPorLojaOrcamento } from "./orcamento.js";
// vira:
// import { buildResumoRapidoOrcamento, buildOrcamento, foiReprovado, buildPorLojaOrcamento, buildPorEmpresaOrcamento } from "./orcamento.js";

test("buildPorEmpresaOrcamento agrupa por empresa+uf, separa aprovado/pendente/reprovado e ignora chamado sem nomeEmpresa", () => {
  const chamados = [
    { Chave: 1, NomeStatus: "Resolvido", uf: "MG" },
    { Chave: 2, NomeStatus: "Aguardando Aprovação", uf: "MG" },
    { Chave: 3, NomeStatus: "Orçamento Reprovado", uf: "MG" },
    { Chave: 4, NomeStatus: "Resolvido", uf: "BA" },
    { Chave: 5, NomeStatus: "Resolvido", uf: "MG" },
  ];
  const historicoMap = new Map([
    [1, { passouPorAguardandoAprovacao: true, valorAprovacao: 100, nomeEmpresa: "MESQUITA REFRIGERAÇÃO" }],
    [2, { passouPorAguardandoAprovacao: false, valorAprovacao: 50, nomeEmpresa: "MESQUITA REFRIGERAÇÃO" }],
    [3, { passouPorAguardandoAprovacao: true, valorAprovacao: 300, nomeEmpresa: "MESQUITA REFRIGERAÇÃO" }],
    [4, { passouPorAguardandoAprovacao: true, valorAprovacao: 400, nomeEmpresa: "PORTUGAL GERADORES" }],
    [5, { passouPorAguardandoAprovacao: true, valorAprovacao: 10, nomeEmpresa: null }],
  ]);

  const resultado = buildPorEmpresaOrcamento(chamados, historicoMap);

  assert.equal(resultado.length, 2, "chamado 5 sem nomeEmpresa não deve gerar entrada");

  // PORTUGAL GERADORES (aprovado 400) vem antes de MESQUITA REFRIGERAÇÃO (aprovado 100 +
  // pendente 50 = 150) — reprovado (300) não conta pro total usado na ordenação.
  assert.equal(resultado[0].empresa, "PORTUGAL GERADORES");
  assert.equal(resultado[0].uf, "BA");
  assert.deepEqual(resultado[0].aprovado, { total: 1, valor: 400 });
  assert.deepEqual(resultado[0].pendente, { total: 0, valor: 0 });
  assert.deepEqual(resultado[0].reprovado, { total: 0, valor: 0 });

  assert.equal(resultado[1].empresa, "MESQUITA REFRIGERAÇÃO");
  assert.equal(resultado[1].uf, "MG");
  assert.deepEqual(resultado[1].aprovado, { total: 1, valor: 100 });
  assert.deepEqual(resultado[1].pendente, { total: 1, valor: 50 });
  assert.deepEqual(resultado[1].reprovado, { total: 1, valor: 300 });
});

test("buildPorEmpresaOrcamento separa a mesma empresa em UFs diferentes como entradas distintas", () => {
  const chamados = [
    { Chave: 1, NomeStatus: "Resolvido", uf: "MG" },
    { Chave: 2, NomeStatus: "Resolvido", uf: "BA" },
  ];
  const historicoMap = new Map([
    [1, { passouPorAguardandoAprovacao: true, valorAprovacao: 100, nomeEmpresa: "EMPILHA EMPILHADEIRAS" }],
    [2, { passouPorAguardandoAprovacao: true, valorAprovacao: 200, nomeEmpresa: "EMPILHA EMPILHADEIRAS" }],
  ]);

  const resultado = buildPorEmpresaOrcamento(chamados, historicoMap);

  assert.equal(resultado.length, 2);
  assert.ok(resultado.every((e) => e.empresa === "EMPILHA EMPILHADEIRAS"));
  assert.deepEqual(resultado.map((e) => e.uf).sort(), ["BA", "MG"]);
});

test("buildPorEmpresaOrcamento retorna array vazio pra lista de chamados vazia", () => {
  assert.deepEqual(buildPorEmpresaOrcamento([], new Map()), []);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/orcamento.test.js`
Expected: FAIL — `buildPorEmpresaOrcamento is not a function` (ou `undefined`) nos 3 testes novos.

- [ ] **Step 3: Implementar `buildPorEmpresaOrcamento`**

Em `backend/src/services/orcamento.js`, acrescentar logo depois da função `buildPorLojaOrcamento` (antes de `export function buildOrcamento`):

```js
// Empresa (fornecedor) só existe pra chamado que já passou por "Aguardando Aprovação" — é o
// campo extra _19465, digitado nessa etapa (ver historicoChamado.js#extrairNomeEmpresa).
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

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/orcamento.test.js`
Expected: PASS em todos os testes do arquivo (os 3 novos + os já existentes, incluindo os de `buildPorLojaOrcamento`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/orcamento.js backend/src/services/orcamento.test.js
git commit -m "feat: adiciona buildPorEmpresaOrcamento pro ranking de fornecedores"
```

---

### Task 2: Backend — payload `porEmpresa` + filtro `empresa` na rota `/chamados`

**Files:**
- Modify: `backend/src/services/orcamento.js`
- Modify: `backend/src/routes/indicadores.js`

**Interfaces:**
- Consumes: `buildPorEmpresaOrcamento` (Task 1).
- Produces: `buildOrcamento(...)` retorna também `porEmpresa` (mesmo formato do Task 1). Rota `GET /api/chamados` aceita `?empresa=<nome exato>` — filtra pelos chamados cujo `historicoMap.get(chave).nomeEmpresa === empresa`. Consumido pelo frontend a partir do Task 5.

- [ ] **Step 1: Adicionar `porEmpresa` ao retorno de `buildOrcamento`**

Em `backend/src/services/orcamento.js`, dentro de `export function buildOrcamento(chamados, historicoMap)`, no objeto retornado, logo depois da linha `porLoja: buildPorLojaOrcamento(chamados, historicoMap),`:

```js
    porLoja: buildPorLojaOrcamento(chamados, historicoMap),
    porEmpresa: buildPorEmpresaOrcamento(chamados, historicoMap),
```

- [ ] **Step 2: Adicionar o filtro `empresa` na rota `/chamados`**

Em `backend/src/routes/indicadores.js`, na rota `indicadoresRouter.get("/chamados", ...)`:

Na desestruturação de `req.query` (por volta da linha 564-580), acrescentar `empresa`:

```js
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
```

Mais abaixo, no bloco que já calcula `historicoMap` sob demanda (por volta da linha 610-633), trocar a condição e adicionar o filtro:

```js
    const foraDoTopoCausa = dimensao === "causa" && foraDoTopo ? new Set(foraDoTopo.split("|")) : null;
    let historicoMap = null;
    if (causa || statusAprovacao || empresa || foraDoTopoCausa) {
      historicoMap = await obterHistoricoEmLote(filtrados);
      filtrados = filtrados.filter((c) => {
        const historico = historicoMap.get(c.Chave) || {};
        if (causa && historico.causa !== causa) return false;
        if (empresa && historico.nomeEmpresa !== empresa) return false;
        if (foraDoTopoCausa && foraDoTopoCausa.has(historico.causa)) return false;
        const passouAprovacao = historico.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação";
        const ehReprovado = passouAprovacao && foiReprovado(c);
        const ehAvaliado = passouAprovacao && !ehReprovado;
        const ehAguardando = c.NomeStatus === "Aguardando Aprovação";
        if (statusAprovacao === "aguardando" && !ehAguardando) return false;
        if (statusAprovacao === "avaliado" && !ehAvaliado) return false;
        if (statusAprovacao === "reprovado" && !ehReprovado) return false;
        if (statusAprovacao === "comOrcamento" && !(ehAguardando || ehAvaliado)) return false;
        return true;
      });
    }
```

(Só a linha da condição `if (...)` e a linha nova `if (empresa && ...)` mudam — o resto do bloco é o que já existe hoje, reproduzido aqui por completo pra não haver ambiguidade de onde a linha nova entra.)

- [ ] **Step 3: Rodar a suíte inteira do backend**

Run: `cd backend && npm test`
Expected: PASS em todos os testes (nenhum teste existente depende do formato exato do payload de `buildOrcamento` a ponto de quebrar com um campo novo).

- [ ] **Step 4: Verificar manualmente com curl (backend rodando local)**

Se o servidor backend não estiver rodando: `cd backend && npm run dev` (deixar rodando em background).

```bash
curl -s "http://localhost:3001/api/orcamento" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log(JSON.stringify(d.porEmpresa, null, 2))"
```
Expected: array com as ~5 empresas reais (ex: `MESQUITA REFRIGERAÇÃO`/MG com `aprovado: {total: 14, valor: 39211.6}` — mesmo número já confirmado nesta conversa via script de inspeção).

Pegue o nome exato de uma empresa do resultado acima (ex: `MESQUITA REFRIGERAÇÃO`) e confirme o filtro novo:

```bash
curl -s "http://localhost:3001/api/chamados?empresa=MESQUITA%20REFRIGERA%C3%87%C3%83O&statusAprovacao=avaliado&uf=MG" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log(d.total)"
```
Expected: `14` (bate com `aprovado.total` da empresa no payload acima).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/orcamento.js backend/src/routes/indicadores.js
git commit -m "feat: expõe porEmpresa no payload de orçamento e adiciona filtro empresa em /chamados"
```

---

### Task 3: Frontend — `HorizontalBarChart` ganha modo `stacked` + `labelKey`

**Files:**
- Modify: `frontend/src/components/HorizontalBarChart.jsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: nada novo (Recharts, já uma dependência do projeto).
- Produces: `HorizontalBarChart` ganha 2 props opcionais: `stacked` (boolean, default `false`) e `labelKey` (string, default `"total"`). Com os defaults, o componente se comporta exatamente como antes. Consumido no Task 4 (`MaximizableChart`).

- [ ] **Step 1: Substituir o conteúdo de `HorizontalBarChart.jsx`**

Conteúdo completo do arquivo (substitui o arquivo inteiro):

```jsx
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
```

- [ ] **Step 2: Adicionar a classe CSS da legenda**

Em `frontend/src/styles.css`, acrescentar ao final do arquivo:

```css
.hbc-legenda { display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.hbc-legenda span { display: flex; align-items: center; gap: 5px; }
.hbc-legenda i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
```

- [ ] **Step 3: Build limpo**

Run: `cd frontend && npm run build`
Expected: build termina sem erro. Nenhuma tela muda visualmente ainda — nenhum consumidor de `HorizontalBarChart` passa `stacked`/`labelKey` até o Task 5, então o `dataKey="total"` + `formatter={formatValue}` continuam idênticos ao comportamento anterior (`labelKey` default `"total"` cai no branch `formatter: labelKey === "total" ? formatValue : undefined` → mesmo formatter de antes).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/HorizontalBarChart.jsx frontend/src/styles.css
git commit -m "feat: HorizontalBarChart ganha modo empilhado (stacked) opcional pra aprovado/pendente/reprovado"
```

---

### Task 4: Frontend — `MaximizableChart` repassa `stacked`/`labelKey`

**Files:**
- Modify: `frontend/src/components/MaximizableChart.jsx`

**Interfaces:**
- Consumes: `HorizontalBarChart` com as props `stacked`/`labelKey` (Task 3); `RankingTable` com prop `colunasExtras` (já existe, formato `{header, render, sortKeyName}`).
- Produces: `MaximizableChart` ganha 2 props opcionais a mais, `stacked` (default `false`) e `labelKey` (default `"total"`), repassadas pros 3 pontos internos que renderizam `HorizontalBarChart`. Consumido no Task 5 (`RegiaoOrcamentoPanel`).

- [ ] **Step 1: Substituir o conteúdo de `MaximizableChart.jsx`**

Conteúdo completo do arquivo:

```jsx
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { RankingTable } from "./RankingTable.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

// Acima disso, dezenas de barras de 26px viram uma faixa ilegível — melhor mostrar só o
// top N como barra (onde a comparação visual ainda funciona) e o resto numa tabela com
// busca/ordenação (ver RankingTable).
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

  // Só existe quando "stacked" está ligado (aba "Todos") — mesmas 3 colunas já usadas nos
  // níveis de loja em DrillDownContent.jsx, só que lendo direto de aprovadoValor/pendenteValor/
  // reprovadoValor (os dados aqui já chegam achatados por RegiaoOrcamentoPanel).
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
                  // "Outros (agregado)" só aparece no gráfico top-N (ramo abaixo, mais de
                  // LIMITE_BARRAS_MAXIMIZADO itens) — o corte precisa refletir o N real desse
                  // gráfico, não um número arbitrário.
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

- [ ] **Step 2: Build limpo**

Run: `cd frontend && npm run build`
Expected: build termina sem erro. Ainda sem mudança visual — `RegiaoOrcamentoPanel` (Task 5) é quem primeiro passa `stacked=true`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MaximizableChart.jsx
git commit -m "feat: MaximizableChart repassa stacked/labelKey pro HorizontalBarChart e pra RankingTable"
```

---

### Task 5: Frontend — abas em `RegiaoOrcamentoPanel` + ranking por empresa

**Files:**
- Modify: `frontend/src/components/RegiaoOrcamentoPanel.jsx`
- Modify: `frontend/src/pages/Orcamento.jsx`

**Interfaces:**
- Consumes: `SubTabs` (`frontend/src/components/SubTabs.jsx`, já existe: props `options`, `active`, `onChange`); `MaximizableChart` com `stacked`/`labelKey` (Task 4); payload `porLoja`/`porEmpresa` (Task 1/2, cada item `{ [cliente|empresa]: string, uf: string|null, aprovado: {total,valor}, pendente: {total,valor}, reprovado: {total,valor} }`).
- Produces: comportamento final visível ao usuário — nada consome isso depois.

- [ ] **Step 1: Substituir o conteúdo de `RegiaoOrcamentoPanel.jsx`**

Conteúdo completo do arquivo:

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

// Achata um nó (loja ou empresa, mesmo formato { aprovado, pendente, reprovado }) pro shape que
// HorizontalBarChart espera, já considerando a aba ativa. "Todos" mantém os 3 valores
// separados pro modo empilhado; as outras abas viram uma barra simples (mesmo path de sempre).
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

- [ ] **Step 2: Passar `porEmpresa` pro painel**

Em `frontend/src/pages/Orcamento.jsx`, trocar a linha (por volta da linha 223):

```jsx
<RegiaoOrcamentoPanel porUf={payload.porUf} porLoja={payload.porLoja} filtroBase={filtroBase} />
```

por:

```jsx
<RegiaoOrcamentoPanel porUf={payload.porUf} porLoja={payload.porLoja} porEmpresa={payload.porEmpresa} filtroBase={filtroBase} />
```

- [ ] **Step 3: Build limpo**

Run: `cd frontend && npm run build`
Expected: build termina sem erro.

- [ ] **Step 4: Verificar o payload real com curl**

Com o backend rodando (`cd backend && npm run dev`, se ainda não estiver):

```bash
curl -s "http://localhost:3001/api/orcamento" | node -e "
const d = JSON.parse(require('fs').readFileSync(0));
const mg = d.porLoja.filter((l) => l.uf === 'MG').slice(0, 3);
console.log('porLoja (MG, top 3):', JSON.stringify(mg.map((l) => ({cliente: l.cliente, aprovado: l.aprovado, pendente: l.pendente, reprovado: l.reprovado})), null, 2));
console.log('porEmpresa:', JSON.stringify(d.porEmpresa, null, 2));
"
```
Expected: `porLoja` traz os 3 buckets separados por loja (não mudou de formato, só confirma que o campo existe pro frontend consumir); `porEmpresa` traz a lista de ~5 empresas já validada nesta conversa.

- [ ] **Step 5: Verificação manual no navegador**

Com backend (`cd backend && npm run dev`) e frontend (`cd frontend && npm run dev`) rodando:

1. Abrir a tela de Orçamento no navegador.
2. Clicar num card de UF (ex: MG) — devem aparecer 2 blocos de abas (Aprovado/Pendente/Reprovado/Todos), um acima de "Custo por unidade — MG" e outro acima de "Ranking por empresa — MG".
3. Confirmar que a aba **Aprovado** já vem selecionada por padrão nos dois gráficos.
4. Clicar em **Todos** em qualquer um dos dois gráficos — as barras devem virar 3 segmentos de cor (verde/amarelo/vermelho) com a legenda aparecendo acima do gráfico.
5. Trocar de aba no "Custo por unidade" sem mexer no "Ranking por empresa" (e vice-versa) — cada gráfico deve manter sua própria aba, independente do outro.
6. Clicar numa barra do "Ranking por empresa" (aba Aprovado) — deve abrir a lista de chamados daquela empresa; conferir que o total bate com o valor mostrado na barra (ex: MESQUITA REFRIGERAÇÃO, MG, Aprovado → 14 chamados, R$ 39.211,60).
7. Clicar numa barra do "Custo por unidade" (qualquer aba) — a navegação Loja → Especialidade → Categoria → Equipamento continua funcionando como antes (feature da sessão anterior).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RegiaoOrcamentoPanel.jsx frontend/src/pages/Orcamento.jsx
git commit -m "feat: adiciona abas de status e ranking por empresa no painel Orçamento por região"
```
