# Tendência Mensal (Manutenção) e Decomposição do MTTR (Equipamentos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um gráfico mês a mês de despesas Preventiva x Corretiva + tempo aguardando peça em Manutenção, e decompor o MTTR de cada equipamento (Ic) em espera de peça x reparo de fato.

**Architecture:** Parte 1 é um novo serviço de agregação mensal + rota + seção de página, seguindo o mesmo padrão caro (busca histórico de interação por chamado) já usado em Orçamento/Equipamentos por Ic. Parte 2 estende o cálculo de MTTR que já existe em `icsEquipamento.js` pra devolver a decomposição em vez de só o total, sem mudar a rota.

**Tech Stack:** Node.js (backend, `node:test`), React + recharts (frontend), sem dependências novas.

## Global Constraints

- Parte 1 olha **todos os chamados de Manutenção do período**, não só os com Ic identificado.
- Parte 1 usa período **livre** (`DateFilterBar`, sem padrão fixo de N meses) — carregamento sob demanda via botão "Calcular", não automático.
- Os dois indicadores da Parte 1 (despesa, tempo aguardando peça) são gráficos **mês a mês**, não números únicos.
- Parte 1 fica na aba **Geral** de Manutenção (mesmo critério de `EquipamentosPorIc`: análise não filtrada por tipo).
- Parte 2 só **decompõe** o MTTR já existente (Corretiva finalizada) — não cria indicador novo, e aparece só no perfil do equipamento, como 2º `DonutChart`.
- Arredondamento: 1 casa decimal em horas/dias, 2 casas em valores monetários — mesmo padrão já usado no resto do backend.

---

### Task 1: Serviço e rota de tendência mensal

**Files:**
- Create: `backend/src/services/tendenciaMensalManutencao.js`
- Test: `backend/src/services/tendenciaMensalManutencao.test.js`
- Modify: `backend/src/routes/indicadores.js`

**Interfaces:**
- Consumes: nada de tasks anteriores (primeira task do plano). Usa `carregarChamadosEnriquecidos`, `filtrarPorData`, `excluirCancelados`, `obterHistoricoEmLote`, `lerPeriodo` — todos já importados/definidos em `backend/src/routes/indicadores.js`.
- Produces: `buildTendenciaMensal(chamados: object[], historicoMap: Map): Array<{ mes: string, valorPreventiva: number, valorCorretiva: number, tempoAguardandoPecaDias: number }>` (exportada). Rota `GET /manutencao/tendencia-mensal?dataInicio&dataFim` devolvendo `{ tendencia: [...], totalChamados: number }`. A Task 2 consome essa rota via `fetchTendenciaMensalManutencao`.

`chamados` são objetos crus com `Chave`, `DataCriacao` (`"AAAA-MM-DD"`), `tipo` — mesmo formato que `icsEquipamento.js#buildPorIc` já recebe. `historicoMap` é `Chave -> { valorAprovacao, tempoAguardandoPecaDias, ... }`, vindo de `obterHistoricoEmLote` (`historicoChamado.js`).

- [ ] **Step 1: Escrever os testes que falham**

Crie `backend/src/services/tendenciaMensalManutencao.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTendenciaMensal } from "./tendenciaMensalManutencao.js";

function chamado(overrides) {
  return { Chave: 1, DataCriacao: "2026-08-01", tipo: "Preventiva", ...overrides };
}

test("buildTendenciaMensal agrupa por mês (AAAA-MM) a partir de DataCriacao", () => {
  const chamados = [chamado({ Chave: 1, DataCriacao: "2026-08-05" }), chamado({ Chave: 2, DataCriacao: "2026-08-20" })];
  const historicoMap = new Map([
    [1, { valorAprovacao: 100, tempoAguardandoPecaDias: 0 }],
    [2, { valorAprovacao: 50, tempoAguardandoPecaDias: 0 }],
  ]);
  const resultado = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].mes, "2026-08");
});

test("buildTendenciaMensal soma valorPreventiva e valorCorretiva separadamente", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
    chamado({ Chave: 3, tipo: "Corretiva", DataCriacao: "2026-08-10" }),
  ];
  const historicoMap = new Map([
    [1, { valorAprovacao: 100, tempoAguardandoPecaDias: 0 }],
    [2, { valorAprovacao: 50, tempoAguardandoPecaDias: 0 }],
    [3, { valorAprovacao: 30, tempoAguardandoPecaDias: 0 }],
  ]);
  const [resultado] = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.valorPreventiva, 100);
  assert.equal(resultado.valorCorretiva, 80);
});

test("buildTendenciaMensal soma tempoAguardandoPecaDias de qualquer tipo", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
  ];
  const historicoMap = new Map([
    [1, { valorAprovacao: 0, tempoAguardandoPecaDias: 2 }],
    [2, { valorAprovacao: 0, tempoAguardandoPecaDias: 1.5 }],
  ]);
  const [resultado] = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.tempoAguardandoPecaDias, 3.5);
});

test("buildTendenciaMensal ordena por mês ascendente", () => {
  const chamados = [
    chamado({ Chave: 1, DataCriacao: "2026-09-01" }),
    chamado({ Chave: 2, DataCriacao: "2026-07-01" }),
    chamado({ Chave: 3, DataCriacao: "2026-08-01" }),
  ];
  const historicoMap = new Map([
    [1, { valorAprovacao: 0, tempoAguardandoPecaDias: 0 }],
    [2, { valorAprovacao: 0, tempoAguardandoPecaDias: 0 }],
    [3, { valorAprovacao: 0, tempoAguardandoPecaDias: 0 }],
  ]);
  const resultado = buildTendenciaMensal(chamados, historicoMap);
  assert.deepEqual(resultado.map((r) => r.mes), ["2026-07", "2026-08", "2026-09"]);
});

test("buildTendenciaMensal ignora chamado sem DataCriacao", () => {
  const chamados = [chamado({ Chave: 1, DataCriacao: null })];
  const historicoMap = new Map([[1, { valorAprovacao: 100, tempoAguardandoPecaDias: 0 }]]);
  assert.deepEqual(buildTendenciaMensal(chamados, historicoMap), []);
});

test("buildTendenciaMensal usa 0 quando historicoMap não tem entrada pro chamado", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" })];
  const historicoMap = new Map();
  const [resultado] = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.valorPreventiva, 0);
  assert.equal(resultado.tempoAguardandoPecaDias, 0);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/tendenciaMensalManutencao.test.js`
Expected: FAIL — o módulo `./tendenciaMensalManutencao.js` ainda não existe.

- [ ] **Step 3: Implementar `buildTendenciaMensal`**

Crie `backend/src/services/tendenciaMensalManutencao.js`:

```js
// Agrega chamados de Manutenção por mês de criação (AAAA-MM) — diferente de icsEquipamento.js,
// que agrupa por Ic e só olha o subconjunto com Ic identificado, aqui é TODO chamado do período,
// pra dar o quadro completo de custo/tempo aguardando peça (base pra cobrar o time de suprimentos).
export function buildTendenciaMensal(chamados, historicoMap) {
  const porMes = new Map();

  for (const chamado of chamados) {
    if (!chamado.DataCriacao) continue;
    const mes = chamado.DataCriacao.slice(0, 7);
    const historico = historicoMap.get(chamado.Chave);
    const valor = historico?.valorAprovacao ?? 0;
    const tempoAguardandoPeca = historico?.tempoAguardandoPecaDias ?? 0;

    const atual = porMes.get(mes) || { mes, valorPreventiva: 0, valorCorretiva: 0, tempoAguardandoPecaDias: 0 };
    if (chamado.tipo === "Preventiva") atual.valorPreventiva += valor;
    if (chamado.tipo === "Corretiva") atual.valorCorretiva += valor;
    atual.tempoAguardandoPecaDias += tempoAguardandoPeca;
    porMes.set(mes, atual);
  }

  return [...porMes.values()]
    .map((item) => ({
      ...item,
      valorPreventiva: Math.round(item.valorPreventiva * 100) / 100,
      valorCorretiva: Math.round(item.valorCorretiva * 100) / 100,
      tempoAguardandoPecaDias: Math.round(item.tempoAguardandoPecaDias * 10) / 10,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/tendenciaMensalManutencao.test.js`
Expected: PASS — todos os 6 testes.

- [ ] **Step 5: Adicionar a rota**

Em `backend/src/routes/indicadores.js`, adicione o import junto dos outros (perto de `import { buildPorIc } from "../services/icsEquipamento.js";`):

```js
import { buildTendenciaMensal } from "../services/tendenciaMensalManutencao.js";
```

E adicione a rota, logo depois do fechamento da rota `GET /configuracao/equipamentos/por-ic` (o `});` que fecha aquele handler):

```js
indicadoresRouter.get("/manutencao/tendencia-mensal", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    if (!periodo.dataInicio || !periodo.dataFim) {
      res.status(400).json({ erro: "Período (dataInicio e dataFim) é obrigatório" });
      return;
    }

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const noPeriodo = filtrarPorData(excluirCancelados(chamados), periodo).filter((c) => c.especialidade === "Manutenção");

    const historicoMap = await obterHistoricoEmLote(noPeriodo);
    const tendencia = buildTendenciaMensal(noPeriodo, historicoMap);

    res.json({ tendencia, totalChamados: noPeriodo.length });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

- [ ] **Step 6: Rodar a suíte inteira do backend e validar a rota ao vivo**

Run: `cd backend && node --test`
Expected: PASS — todos os testes (66 antes desta task + 6 novos = 72).

Reinicie o backend (mata o processo na porta 3001, sobe `npm start` de novo) e teste a rota:

```bash
curl -s "http://localhost:3001/api/manutencao/tendencia-mensal?dataInicio=2026-01-01&dataFim=2026-08-12" | node -e "
let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const j = JSON.parse(data);
  console.log('totalChamados', j.totalChamados, 'meses', j.tendencia.length);
  console.log(j.tendencia.slice(0,3));
});
"
```

Expected: `totalChamados` > 0, `tendencia` é um array de objetos `{ mes, valorPreventiva, valorCorretiva, tempoAguardandoPecaDias }` ordenado por mês.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/tendenciaMensalManutencao.js backend/src/services/tendenciaMensalManutencao.test.js backend/src/routes/indicadores.js
git commit -m "feat: agrega despesas e tempo aguardando peça de Manutenção por mês"
```

---

### Task 2: Seção de tendência mensal em Manutenção (frontend)

**Files:**
- Modify: `frontend/src/api.js`
- Create: `frontend/src/components/MonthlyBarChart.jsx`
- Create: `frontend/src/components/TendenciaMensalManutencao.jsx`
- Modify: `frontend/src/pages/Manutencao.jsx`

**Interfaces:**
- Consumes: rota `GET /api/manutencao/tendencia-mensal` (Task 1), payload `{ tendencia: [{ mes, valorPreventiva, valorCorretiva, tempoAguardandoPecaDias }], totalChamados }`.
- Produces: nada consumido por outra task desta parte (última task da Parte 1). `MonthlyBarChart` fica disponível como componente reaproveitável, mas nenhuma outra task deste plano o consome.

- [ ] **Step 1: Adicionar `fetchTendenciaMensalManutencao` em `api.js`**

Em `frontend/src/api.js`, logo depois de `fetchEquipamentosPorIc`:

```js
export function fetchTendenciaMensalManutencao(opts) {
  return getJson("/api/manutencao/tendencia-mensal", opts);
}
```

- [ ] **Step 2: Criar `MonthlyBarChart.jsx`**

Crie `frontend/src/components/MonthlyBarChart.jsx`:

```jsx
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatMes(mes) {
  const [ano, mesNum] = mes.split("-");
  return `${mesNum}/${ano}`;
}

// Gráfico de barras por mês, genérico — reaproveitado tanto pro comparativo de 2 séries
// (Preventiva x Corretiva) quanto pra série única (tempo aguardando peça), evita duplicar a
// configuração do recharts pros dois casos. `series.length > 1` liga a legenda automaticamente.
export function MonthlyBarChart({ data, series, formatValue, height = 260 }) {
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
          <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Criar `TendenciaMensalManutencao.jsx`**

Crie `frontend/src/components/TendenciaMensalManutencao.jsx`:

```jsx
import { useState } from "react";
import { fetchTendenciaMensalManutencao } from "../api.js";
import { MonthlyBarChart } from "./MonthlyBarChart.jsx";
import { DateFilterBar } from "./DateFilterBar.jsx";
import { periodoMesFiscal } from "../lib/datas.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDias = (valor) => `${valor}d`;

export function TendenciaMensalManutencao() {
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [state, setState] = useState({ status: "idle", payload: null, error: null });

  async function calcular() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchTendenciaMensalManutencao(periodo);
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Tendência mensal</h2>
          <p className="subtitle">
            Despesas Preventiva x Corretiva e tempo aguardando peça, mês a mês — busca o histórico
            de cada chamado do período, pode levar um tempo (quanto maior o período, mais demora).
          </p>
        </div>
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={calcular} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Calculando..." : "Calcular"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao calcular: {state.error}</div>}

      {state.payload &&
        (state.payload.tendencia.length === 0 ? (
          <p className="subtitle">Nenhum chamado de Manutenção nesse período.</p>
        ) : (
          <>
            <div className="panel full-width">
              <h2>Despesas por mês</h2>
              <p className="subtitle">Preventiva x Corretiva, somando o valor aprovado de cada chamado</p>
              <MonthlyBarChart
                data={state.payload.tendencia}
                series={[
                  { dataKey: "valorPreventiva", name: "Preventiva", color: "var(--series-3)" },
                  { dataKey: "valorCorretiva", name: "Corretiva", color: "var(--series-2)" },
                ]}
                formatValue={formatBRL}
              />
            </div>

            <div className="panel full-width">
              <h2>Tempo aguardando peça por mês</h2>
              <p className="subtitle">Dias acumulados em "Aguardando Peça do Estoque" + "Peça Enviada para Loja"</p>
              <MonthlyBarChart
                data={state.payload.tendencia}
                series={[{ dataKey: "tempoAguardandoPecaDias", name: "Dias aguardando peça", color: "var(--series-5)" }]}
                formatValue={formatDias}
              />
            </div>
          </>
        ))}
    </div>
  );
}
```

- [ ] **Step 4: Conectar em `Manutencao.jsx`**

Em `frontend/src/pages/Manutencao.jsx`, adicione o import junto dos outros:

```js
import { TendenciaMensalManutencao } from "../components/TendenciaMensalManutencao.jsx";
```

E, dentro do bloco `{detalhe && (<> ... </>)}`, logo depois da `</section>` que fecha o `panel-grid` com "Por tipo de equipamento" / "Por cliente" / "Por operador" (a mesma posição onde `EquipamentosPorIc` costumava ficar antes de virar aba própria), adicione:

```jsx
              {tipoAtivo === GERAL && <TendenciaMensalManutencao />}
```

- [ ] **Step 5: Build de produção**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros novos (o aviso de chunk >500kB já existe hoje).

- [ ] **Step 6: Validar visualmente**

Suba o frontend (`cd frontend && npm run dev`, se ainda não estiver rodando) e o backend (porta 3001), abra a aba Manutenção (Geral), role até "Tendência mensal", escolha um período com dados (ex: `2026-01-01` a `2026-08-12`) e clique "Calcular". Confirme que os 2 gráficos aparecem com barras por mês e tooltip formatado (R$ no primeiro, "Xd" no segundo).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api.js frontend/src/components/MonthlyBarChart.jsx frontend/src/components/TendenciaMensalManutencao.jsx frontend/src/pages/Manutencao.jsx
git commit -m "feat: gráfico de tendência mensal (despesas e tempo aguardando peça) em Manutenção"
```

---

### Task 3: Decomposição do MTTR em `icsEquipamento.js`

**Files:**
- Modify: `backend/src/services/icsEquipamento.js`
- Test: `backend/src/services/icsEquipamento.test.js`

**Interfaces:**
- Consumes: `linha.tempoAguardandoPecaDias`, `linha.dataFinalizacao`, `linha.horaCriacao`, `linha.horaFinalizacao` — campos já existentes em `icsEquipamento.js` desde a feature de MTTF/MTTR (não precisam de mudança).
- Produces: cada item retornado por `buildPorIc` ganha 2 campos novos: `mttrAguardandoPecaHoras: number | null`, `mttrReparoHoras: number | null` (`mttrHoras` continua existindo, com o mesmo significado de antes — total). A Task 4 consome esses 2 campos.

Hoje `buildPorIc` chama `calcularMttrHoras(corretivas)`, que devolve só a média do tempo total (`number | null`). Essa task troca essa função por `calcularDecomposicaoMttr(corretivas)`, que devolve `{ mttrHoras, mttrAguardandoPecaHoras, mttrReparoHoras } | null` — mesmo cálculo de antes pro total, mais a quebra em 2 partes usando o `tempoAguardandoPecaDias` que cada `linha` já carrega.

- [ ] **Step 1: Escrever os testes que falham**

Em `backend/src/services/icsEquipamento.test.js`, localize os 3 testes de `mttrHoras` que já existem (`"buildPorIc calcula mttrHoras..."`, `"buildPorIc ignora Corretiva não finalizada..."`, `"buildPorIc retorna mttrHoras null sem nenhuma Corretiva finalizada"`) e troque os 2 últimos por estas versões (adicionam as 2 asserções novas, mesmo corpo de resto):

```js
test("buildPorIc ignora Corretiva não finalizada no cálculo de mttrHoras", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Corretiva", DataFinalizacao: null })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, null);
  assert.equal(resultado.mttrAguardandoPecaHoras, null);
  assert.equal(resultado.mttrReparoHoras, null);
});

test("buildPorIc retorna mttrHoras null sem nenhuma Corretiva finalizada", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Preventiva" })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, null);
  assert.equal(resultado.mttrAguardandoPecaHoras, null);
  assert.equal(resultado.mttrReparoHoras, null);
});
```

Depois, adicione estes 2 testes novos logo abaixo:

```js
test("buildPorIc decompõe mttrHoras em espera de peça x reparo", () => {
  const chamados = [
    chamado({
      Chave: 1,
      tipo: "Corretiva",
      DataCriacao: "2026-08-01",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-03",
      HoraFinalizacao: "08:00:00",
    }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 1 }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  // total: 48h (2 dias). 1 dia (24h) esperando peça, 24h de reparo.
  assert.equal(resultado.mttrHoras, 48);
  assert.equal(resultado.mttrAguardandoPecaHoras, 24);
  assert.equal(resultado.mttrReparoHoras, 24);
});

test("buildPorIc limita mttrAguardandoPecaHoras ao total do chamado (proteção contra inconsistência)", () => {
  const chamados = [
    chamado({
      Chave: 1,
      tipo: "Corretiva",
      DataCriacao: "2026-08-01",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-01",
      HoraFinalizacao: "12:00:00",
    }),
  ];
  const historicoMap = new Map([
    // tempoAguardandoPecaDias (10 dias = 240h) muito maior que o total do chamado (4h) — dado
    // inconsistente, mas não pode gerar reparoHoras negativo.
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 10 }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, 4);
  assert.equal(resultado.mttrAguardandoPecaHoras, 4);
  assert.equal(resultado.mttrReparoHoras, 0);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/icsEquipamento.test.js`
Expected: FAIL — `resultado.mttrAguardandoPecaHoras`/`resultado.mttrReparoHoras` vêm `undefined`, não os valores esperados.

- [ ] **Step 3: Implementar `calcularDecomposicaoMttr`**

Em `backend/src/services/icsEquipamento.js`, troque a função `calcularMttrHoras` inteira por:

```js
// Não desconta tempo em "Aguardando Aprovação" — abertura→finalização direto, mesmo padrão de
// tempoResolucaoHoras usado no resto do backend. Além do total (mttrHoras, igual antes),
// decompõe em espera de peça x reparo de fato, usando o tempoAguardandoPecaDias que cada
// `linha` já carrega desde a feature de MTTF/MTTR.
function calcularDecomposicaoMttr(corretivas) {
  const partes = [];
  for (const c of corretivas) {
    if (!c.dataFinalizacao || c.dataFinalizacao === "0000-00-00") continue;
    const inicio = parseDateTime(c.dataCriacao, c.horaCriacao);
    const fim = parseDateTime(c.dataFinalizacao, c.horaFinalizacao);
    if (!inicio || !fim) continue;
    const totalHoras = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    if (totalHoras < 0) continue;
    // min() protege contra tempoAguardandoPecaDias maior que o total do chamado (inconsistência
    // de dados) gerar reparoHoras negativo.
    const esperaPecaHoras = Math.min((c.tempoAguardandoPecaDias ?? 0) * 24, totalHoras);
    partes.push({ totalHoras, esperaPecaHoras, reparoHoras: totalHoras - esperaPecaHoras });
  }

  if (partes.length === 0) return null;

  const media = (campo) => Math.round((partes.reduce((soma, p) => soma + p[campo], 0) / partes.length) * 10) / 10;
  return {
    mttrHoras: media("totalHoras"),
    mttrAguardandoPecaHoras: media("esperaPecaHoras"),
    mttrReparoHoras: media("reparoHoras"),
  };
}
```

Depois, no objeto retornado dentro do `.map(({ ic, chamados: lista }) => { ... })`, logo antes do `return {`, calcule a decomposição uma única vez:

```js
      const decomposicaoMttr = calcularDecomposicaoMttr(ordenados.filter((c) => c.tipo === "Corretiva"));
```

E troque a linha `mttrHoras: calcularMttrHoras(ordenados.filter((c) => c.tipo === "Corretiva")),` dentro do `return { ... }` por:

```js
        mttrHoras: decomposicaoMttr?.mttrHoras ?? null,
        mttrAguardandoPecaHoras: decomposicaoMttr?.mttrAguardandoPecaHoras ?? null,
        mttrReparoHoras: decomposicaoMttr?.mttrReparoHoras ?? null,
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/icsEquipamento.test.js`
Expected: PASS — todos os testes do arquivo, incluindo os 2 novos e os 2 atualizados.

Rode a suíte inteira também:

Run: `cd backend && node --test`
Expected: PASS — todos os testes (72 antes desta task + 2 novos = 74; os 2 testes atualizados não mudam a contagem).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/icsEquipamento.js backend/src/services/icsEquipamento.test.js
git commit -m "feat: decompõe MTTR em espera de peça x reparo por equipamento"
```

---

### Task 4: Exibir a decomposição no perfil do equipamento (frontend)

**Files:**
- Modify: `frontend/src/pages/EquipamentosPorIc.jsx`

**Interfaces:**
- Consumes: `ic.mttrAguardandoPecaHoras: number | null`, `ic.mttrReparoHoras: number | null` (Task 3, já chegam no payload de `GET /api/configuracao/equipamentos/por-ic` sem mudança de rota).
- Produces: nada consumido por outra task (última task do plano).

O componente `PerfilIc` já tem um painel `<div className="panel"><h2>Preventiva x Corretiva</h2><DonutChart .../></div>`. Adicione um 2º painel ao lado, com a decomposição do MTTR.

- [ ] **Step 1: Adicionar o 2º DonutChart**

Troque o bloco:

```jsx
      <div className="panel">
        <h2>Preventiva x Corretiva</h2>
        <DonutChart data={donutData} height={200} />
      </div>
```

por:

```jsx
      <div className="panel">
        <h2>Preventiva x Corretiva</h2>
        <DonutChart data={donutData} height={200} />
      </div>

      {ic.mttrHoras !== null ? (
        <div className="panel">
          <h2>Composição do MTTR</h2>
          <DonutChart
            data={[
              { label: "Espera de peça", total: ic.mttrAguardandoPecaHoras },
              { label: "Reparo", total: ic.mttrReparoHoras },
            ]}
            height={200}
          />
        </div>
      ) : (
        <div className="panel">
          <h2>Composição do MTTR</h2>
          <p className="subtitle">Poucos dados nesse período.</p>
        </div>
      )}
```

- [ ] **Step 2: Build de produção**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros.

- [ ] **Step 3: Validar contra a API real**

Reinicie o backend (pra pegar o código da Task 3) e confira o payload:

```bash
curl -s "http://localhost:3001/api/configuracao/equipamentos/por-ic?dataInicio=2026-01-01&dataFim=2026-08-12" | node -e "
let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const j = JSON.parse(data);
  console.log(j.ics.slice(0,3).map(ic => ({ ic: ic.ic, mttrHoras: ic.mttrHoras, mttrAguardandoPecaHoras: ic.mttrAguardandoPecaHoras, mttrReparoHoras: ic.mttrReparoHoras })));
});
"
```

Expected: cada item tem as 3 chaves presentes (número ou `null`, consistentes entre si — se `mttrHoras` é `null`, os outros 2 também são).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EquipamentosPorIc.jsx
git commit -m "feat: mostra composição do MTTR (espera de peça x reparo) no perfil do equipamento"
```
