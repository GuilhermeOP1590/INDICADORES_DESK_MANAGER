# Equipamentos por Ic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba "Por Ic" em Configurações → Equipamentos, mostrando custo total, proporção Preventiva/Corretiva e recorrência de manutenção por equipamento físico específico (Ic do catálogo de Ativos do DeskManager), a partir dos chamados de Manutenção que tiveram um Ic identificado na interação.

**Architecture:** Backend estende o pipeline já existente de `historicoChamado.js` (usado hoje pelo Orçamento) pra também extrair `ICs` e `Horímetro` de cada interação — mesmo cache de 15min, sem caminho novo e caro em paralelo. Novo serviço agrega por Ic. Nova rota devolve o ranking. Frontend: gráfico + tabela ranqueada + modal de perfil por Ic, reaproveitando componentes existentes (`StatTile`, `DonutChart`, `HorizontalBarChart`, `RankingTable`, `Modal`, `DrillDownContent`, `useDrillDown`).

**Tech Stack:** Node.js/Express (backend), React/Vite (frontend), `node:test` + `node:assert/strict` para testes de backend. Frontend sem framework de teste (mesma situação de todo o resto do projeto) — validação por build + verificação manual via curl/dev server.

## Global Constraints

- Código e nomes de função/variável em português, seguindo o resto do projeto.
- Nenhuma dependência nova.
- Basear-se em `docs/superpowers/specs/2026-08-12-equipamentos-por-ic-design.md` — qualquer divergência deste plano em relação à spec deve ser resolvida a favor da spec.
- Escopo só Manutenção (Engenharia fica de fora).
- Rota nova exige `dataInicio`/`dataFim` (período obrigatório) — sem carregamento automático ao montar a página no frontend.
- Número de série / Marca-modelo (campos `_15058`/`_15060`, também descobertos na investigação) **não** entram nesta feature — fora de escopo, só Horímetro (`_9293`) e `ICs` (nativa).

---

### Task 1: Extrair `ICs` e `Horímetro` em `historicoChamado.js`

**Files:**
- Modify: `backend/src/services/historicoChamado.js`
- Create: `backend/src/services/historicoChamado.test.js`

**Interfaces:**
- Consumes: nada novo — mesma tool MCP (`dados_da_interacao_do_chamados`) já usada no arquivo.
- Produces (usado pela Task 2):
  - `extrairIcs(interacoes): string[]` — exportada só para teste.
  - `extrairHorimetro(interacoes): string | null` — exportada só para teste.
  - `obterHistoricoChamado`/`obterHistoricoEmLote` (já exportadas, comportamento existente preservado) passam a incluir `ics: string[]` e `horimetro: string | null` no objeto retornado/cacheado.

- [ ] **Step 1: Escrever os testes (vão falhar — funções ainda não existem)**

Criar `backend/src/services/historicoChamado.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairIcs, extrairHorimetro } from "./historicoChamado.js";

test("extrairIcs retorna o Ic de uma única interação", () => {
  const interacoes = [{ ICs: "300 - MTZ - Empilhadeira 06" }];
  assert.deepEqual(extrairIcs(interacoes), ["300 - MTZ - Empilhadeira 06"]);
});

test("extrairIcs junta Ics de interações diferentes, sem duplicar", () => {
  const interacoes = [
    { ICs: "300 - MTZ - Empilhadeira 06" },
    { ICs: "300 - MTZ - Empilhadeira 06" },
    { ICs: "23 - BAR - Ar-Condicionado 12000 BTUs 01" },
  ];
  assert.deepEqual(extrairIcs(interacoes), ["300 - MTZ - Empilhadeira 06", "23 - BAR - Ar-Condicionado 12000 BTUs 01"]);
});

test("extrairIcs separa múltiplos Ics na mesma interação (vírgula ou ponto-e-vírgula)", () => {
  const interacoes = [{ ICs: "300 - MTZ - Empilhadeira 06, 300 - MTZ - Empilhadeira 07" }];
  assert.deepEqual(extrairIcs(interacoes), ["300 - MTZ - Empilhadeira 06", "300 - MTZ - Empilhadeira 07"]);
});

test("extrairIcs retorna array vazio quando nenhuma interação tem ICs", () => {
  const interacoes = [{ Status: [{ text: "Resolvido" }] }, { ICs: "" }];
  assert.deepEqual(extrairIcs(interacoes), []);
});

test("extrairHorimetro pega o valor da interação mais recente que tem _9293 preenchido", () => {
  const interacoes = [{ _9293: "1001" }, { _9293: "950" }];
  assert.equal(extrairHorimetro(interacoes), "1001");
});

test("extrairHorimetro pula interações sem _9293 até achar uma preenchida", () => {
  const interacoes = [{ Status: [{ text: "Aberto" }] }, { _9293: "950" }];
  assert.equal(extrairHorimetro(interacoes), "950");
});

test("extrairHorimetro retorna null quando nenhuma interação tem _9293", () => {
  const interacoes = [{ Status: [{ text: "Resolvido" }] }];
  assert.equal(extrairHorimetro(interacoes), null);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npm test`
Expected: FAIL — `extrairIcs is not a function` (ou erro de import equivalente, já que o arquivo `historicoChamado.js` existe mas não exporta essas funções ainda).

- [ ] **Step 3: Ler o arquivo atual antes de editar**

Leia `backend/src/services/historicoChamado.js` inteiro primeiro (é um arquivo pequeno, ~117 linhas) pra ver exatamente onde encaixar as mudanças abaixo — ele já tem `CAMPO_EXTRA_VALOR`/`CAMPO_EXTRA_ORCAMENTO_CONFIRMADO`, `fetchInteracoes`, `extrairCausa`, `extrairPassouPorAguardandoAprovacao`, `parseValorBR`, `extrairValorAprovacao`, `paraIso`, `extrairDataAprovacao`, `obterHistoricoChamado`, `mapComConcorrencia`, `obterHistoricoEmLote`. NENHUMA dessas funções existentes deve ser removida ou ter sua assinatura alterada — só adicionar.

- [ ] **Step 4: Adicionar as constantes dos novos campos**

Logo abaixo de `const CAMPO_EXTRA_ORCAMENTO_CONFIRMADO = "_9637";`, adicionar:

```js
// "_9293" é o campo extra "Horímetro" (Tipo: Interações), descoberto via lista_de_campos_extras.
// "ICs" é uma coluna NATIVA (não um campo extra numérico) — devolve o(s) ativo(s) do catálogo
// de ICs do DeskManager vinculado(s) àquela interação (ex: "300 - MTZ - Empilhadeira 06"),
// descoberta por tentativa/erro direto no parâmetro Colunas. Ver
// docs/superpowers/specs/2026-08-12-equipamentos-por-ic-design.md.
const CAMPO_EXTRA_HORIMETRO = "_9293";
const CAMPO_ICS = "ICs";
```

- [ ] **Step 5: Pedir as duas colunas novas em `fetchInteracoes`**

Dentro de `fetchInteracoes`, o objeto `Colunas` passado pro `callDeskMcpTool` ganha duas entradas:

```js
Colunas: {
  Status: "on",
  CodCausa: "on",
  DataAcao: "on",
  [CAMPO_EXTRA_VALOR]: "on",
  [CAMPO_EXTRA_ORCAMENTO_CONFIRMADO]: "on",
  [CAMPO_EXTRA_HORIMETRO]: "on",
  [CAMPO_ICS]: "on",
},
```

- [ ] **Step 6: Adicionar as duas funções de extração**

Logo abaixo de `extrairDataAprovacao` (antes de `export async function obterHistoricoChamado`), adicionar:

```js
// Junta os Ics de TODAS as interações da chamada (não só a mais recente) — o mesmo chamado
// pode referenciar o equipamento em ações diferentes ao longo do atendimento. O formato
// observado é um valor só; a separação por vírgula/ponto-e-vírgula é proteção defensiva caso
// apareça mais de um Ic na mesma interação.
export function extrairIcs(interacoes) {
  const nomes = new Set();
  for (const interacao of interacoes) {
    const bruto = interacao[CAMPO_ICS];
    if (!bruto) continue;
    for (const nome of bruto.split(/[,;]/)) {
      const limpo = nome.trim();
      if (limpo) nomes.add(limpo);
    }
  }
  return [...nomes];
}

// Mesmo padrão de extrairValorAprovacao: interações vêm da mais recente pra mais antiga, o
// horímetro "vale" é o da última interação que o preencheu.
export function extrairHorimetro(interacoes) {
  const comHorimetro = interacoes.find((interacao) => interacao[CAMPO_EXTRA_HORIMETRO]);
  return comHorimetro ? comHorimetro[CAMPO_EXTRA_HORIMETRO] : null;
}
```

- [ ] **Step 7: Incluir os dois campos no histórico retornado/cacheado**

Dentro de `obterHistoricoChamado`, o objeto `historico` passa a ser:

```js
const historico = {
  causa: extrairCausa(interacoes),
  passouPorAguardandoAprovacao: extrairPassouPorAguardandoAprovacao(interacoes),
  valorAprovacao: extrairValorAprovacao(interacoes),
  dataAprovacao: extrairDataAprovacao(interacoes),
  ics: extrairIcs(interacoes),
  horimetro: extrairHorimetro(interacoes),
};
```

- [ ] **Step 8: Incluir os mesmos campos no fallback de erro de `obterHistoricoEmLote`**

Dentro de `obterHistoricoEmLote`, o `.catch(() => ({...}))` passa a ser:

```js
.catch(() => ({
  causa: null,
  passouPorAguardandoAprovacao: false,
  valorAprovacao: null,
  dataAprovacao: null,
  ics: [],
  horimetro: null,
}))
```

- [ ] **Step 9: Rodar os testes e confirmar que passam**

Run: `cd backend && npm test`
Expected: PASS — todos os testes, incluindo os 7 novos de `historicoChamado.test.js`.

- [ ] **Step 10: Verificação manual contra a API real**

Chamado `0826-000056` (chave `4326`) é conhecido por ter um Ic preenchido. Rode:

```bash
cd backend
node --input-type=module -e "
import('dotenv/config').then(() => import('./src/services/historicoChamado.js')).then(async ({obterHistoricoChamado}) => {
  const historico = await obterHistoricoChamado({ chave: 4326, codChamado: '0826-000056' }, { forceRefresh: true });
  console.log(JSON.stringify(historico, null, 2));
}).catch(e => console.error('ERRO', e.message));
"
```

Expected: objeto com `ics: [\"300 - MTZ - Empilhadeira 06\"]` e `horimetro: \"1001\"` (mais os campos já existentes: `causa`, `valorAprovacao`, etc — não precisam bater com nenhum valor específico, só existir).

- [ ] **Step 11: Commit**

```bash
cd "backend"
git add src/services/historicoChamado.js src/services/historicoChamado.test.js
git commit -m "feat: extrai ICs e Horimetro das interacoes do chamado"
```

---

### Task 2: Serviço de agregação `icsEquipamento.js`

**Files:**
- Create: `backend/src/services/icsEquipamento.js`
- Create: `backend/src/services/icsEquipamento.test.js`

**Interfaces:**
- Consumes: chamados enriquecidos (formato de `carregarChamadosEnriquecidos` — objetos com `Chave`, `CodChamado`, `DataCriacao`, `tipo`) e o `historicoMap` de `obterHistoricoEmLote` (Task 1 — `Map<chave, {ics, horimetro, causa, valorAprovacao, ...}>`).
- Produces (usado pela Task 3):
  - `buildPorIc(chamados, historicoMap): { ic: string, total: number, preventiva: number, corretiva: number, custoTotal: number, recorrenciaDias: number | null, chamados: Array<{chave, codChamado, dataCriacao, tipo, causa, valorAprovacao, horimetro}> }[]`, ordenado por `total` desc.

- [ ] **Step 1: Escrever os testes (vão falhar — módulo ainda não existe)**

Criar `backend/src/services/icsEquipamento.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPorIc } from "./icsEquipamento.js";

function chamado(overrides) {
  return { Chave: 1, CodChamado: "0000-000001", DataCriacao: "2026-08-01", tipo: "Preventiva", ...overrides };
}

test("buildPorIc agrupa por Ic e conta total corretamente", () => {
  const chamados = [
    chamado({ Chave: 1, CodChamado: "0000-000001" }),
    chamado({ Chave: 2, CodChamado: "0000-000002" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Empilhadeira 06"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Empilhadeira 06"], horimetro: "1050", causa: null, valorAprovacao: null }],
  ]);

  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].ic, "Empilhadeira 06");
  assert.equal(resultado[0].total, 2);
});

test("buildPorIc ignora chamados sem Ic no histórico", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: [], horimetro: null, causa: null, valorAprovacao: null }]]);
  assert.deepEqual(buildPorIc(chamados, historicoMap), []);
});

test("buildPorIc conta um chamado com 2 Ics nos dois grupos", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A", "Ic B"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map((r) => r.ic).sort(), ["Ic A", "Ic B"]);
});

test("buildPorIc soma custoTotal e conta preventiva/corretiva por tipo", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva" }),
    chamado({ Chave: 2, tipo: "Corretiva" }),
    chamado({ Chave: 3, tipo: "Corretiva" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 100 }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 50 }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.preventiva, 1);
  assert.equal(resultado.corretiva, 2);
  assert.equal(resultado.custoTotal, 150);
});

test("buildPorIc calcula recorrenciaDias como o intervalo médio entre datas consecutivas", () => {
  const chamados = [
    chamado({ Chave: 1, DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, DataCriacao: "2026-08-11" }),
    chamado({ Chave: 3, DataCriacao: "2026-08-21" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.recorrenciaDias, 10);
});

test("buildPorIc retorna recorrenciaDias null com só 1 chamado", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.recorrenciaDias, null);
});

test("buildPorIc ordena por total desc", () => {
  const chamados = [
    chamado({ Chave: 1 }),
    chamado({ Chave: 2 }),
    chamado({ Chave: 3 }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic B"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic B"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);
  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado[0].ic, "Ic B");
  assert.equal(resultado[0].total, 2);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './icsEquipamento.js'`.

- [ ] **Step 3: Implementar `icsEquipamento.js`**

Criar `backend/src/services/icsEquipamento.js`:

```js
// Agrupa chamados de Manutenção por Ic (equipamento específico do catálogo de Ativos do
// DeskManager, ex: "300 - MTZ - Empilhadeira 06") — granularidade mais fina que "grupo de
// equipamento" (configuracaoEquipamentos.js), que agrupa por categoria, não por unidade física.
// Só considera chamados cujo Ic foi preenchido na interação (historicoMap vem de
// historicoChamado.js#obterHistoricoEmLote) — nem todo chamado tem.
export function buildPorIc(chamados, historicoMap) {
  const porIc = new Map();

  for (const chamado of chamados) {
    const historico = historicoMap.get(chamado.Chave);
    const ics = historico?.ics ?? [];
    if (ics.length === 0) continue;

    const linha = {
      chave: chamado.Chave,
      codChamado: chamado.CodChamado,
      dataCriacao: chamado.DataCriacao,
      tipo: chamado.tipo,
      causa: historico?.causa ?? null,
      valorAprovacao: historico?.valorAprovacao ?? null,
      horimetro: historico?.horimetro ?? null,
    };

    for (const ic of ics) {
      const atual = porIc.get(ic) || { ic, chamados: [] };
      atual.chamados.push(linha);
      porIc.set(ic, atual);
    }
  }

  return [...porIc.values()]
    .map(({ ic, chamados: lista }) => {
      const ordenados = [...lista].sort((a, b) => (a.dataCriacao ?? "").localeCompare(b.dataCriacao ?? ""));
      const preventiva = ordenados.filter((c) => c.tipo === "Preventiva").length;
      const corretiva = ordenados.filter((c) => c.tipo === "Corretiva").length;
      const custoTotal = Math.round(ordenados.reduce((soma, c) => soma + (c.valorAprovacao ?? 0), 0) * 100) / 100;

      return {
        ic,
        total: ordenados.length,
        preventiva,
        corretiva,
        custoTotal,
        recorrenciaDias: calcularRecorrenciaDias(ordenados.map((c) => c.dataCriacao).filter(Boolean)),
        chamados: ordenados,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function calcularRecorrenciaDias(datasOrdenadasIso) {
  if (datasOrdenadasIso.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < datasOrdenadasIso.length; i++) {
    const anterior = new Date(datasOrdenadasIso[i - 1]);
    const atual = new Date(datasOrdenadasIso[i]);
    gaps.push((atual.getTime() - anterior.getTime()) / (1000 * 60 * 60 * 24));
  }
  return Math.round((gaps.reduce((soma, g) => soma + g, 0) / gaps.length) * 10) / 10;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npm test`
Expected: PASS — todos os testes, incluindo os 7 novos de `icsEquipamento.test.js`.

- [ ] **Step 5: Commit**

```bash
cd "backend"
git add src/services/icsEquipamento.js src/services/icsEquipamento.test.js
git commit -m "feat: servico de agregacao de chamados por Ic"
```

---

### Task 3: Rota `GET /api/configuracao/equipamentos/por-ic`

**Files:**
- Modify: `backend/src/routes/indicadores.js:1-20` (imports)
- Modify: `backend/src/routes/indicadores.js` (fim do arquivo, hoje termina na rota `DELETE /prioritarios/:codChamado`, linha 688)

**Interfaces:**
- Consumes: `buildPorIc` (Task 2); `carregarChamadosEnriquecidos`, `excluirCancelados`, `filtrarPorData`, `obterHistoricoEmLote`, `lerPeriodo` (já importados/definidos no arquivo).
- Produces: `GET /api/configuracao/equipamentos/por-ic?dataInicio&dataFim` →
  `{ ics: ReturnType<typeof buildPorIc>, totalChamados: number, totalComIc: number, totalSemIc: number }`,
  ou `400 { erro }` se `dataInicio`/`dataFim` ausentes.

- [ ] **Step 1: Adicionar o import de `buildPorIc`**

Em `backend/src/routes/indicadores.js`, logo abaixo do import de `prioridades.js` (linha 17), adicionar:

```js
import { buildPorIc } from "../services/icsEquipamento.js";
```

- [ ] **Step 2: Adicionar a rota no fim do arquivo**

Depois do fechamento da rota `DELETE /prioritarios/:codChamado` (última linha do arquivo hoje), adicionar:

```js

indicadoresRouter.get("/configuracao/equipamentos/por-ic", async (req, res) => {
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
    const ics = buildPorIc(noPeriodo, historicoMap);

    const totalComIc = noPeriodo.filter((c) => (historicoMap.get(c.Chave)?.ics?.length ?? 0) > 0).length;

    res.json({ ics, totalChamados: noPeriodo.length, totalComIc, totalSemIc: noPeriodo.length - totalComIc });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

- [ ] **Step 3: Rodar os testes de backend (garantir que nada quebrou)**

Run: `cd backend && npm test`
Expected: PASS — todos os testes.

- [ ] **Step 4: Verificação manual com o servidor rodando**

Garanta que o backend está no ar (`curl -s -m 3 http://localhost:3001/api/health`; se não responder, `cd backend && npm start` em background e aguarde). O chamado `0826-000056` (Ic conhecido) foi criado em `2026-08-01` — use um período que cubra essa data:

```bash
# 1. Sem período -> 400
curl -s -w "\nHTTP %{http_code}\n" "http://localhost:3001/api/configuracao/equipamentos/por-ic"
# Esperado: HTTP 400, {"erro":"Período (dataInicio e dataFim) é obrigatório"}

# 2. Com período cobrindo o chamado conhecido
curl -s "http://localhost:3001/api/configuracao/equipamentos/por-ic?dataInicio=2026-08-01&dataFim=2026-08-05" | node -e "
let d=''; process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const j = JSON.parse(d);
  console.log('totalChamados:', j.totalChamados, '| totalComIc:', j.totalComIc, '| totalSemIc:', j.totalSemIc);
  const empilhadeira = j.ics.find(i => i.ic.includes('Empilhadeira 06'));
  console.log('Empilhadeira 06 encontrada:', JSON.stringify(empilhadeira, null, 2));
});
"
```

Expected: `totalComIc >= 1`, e o item "300 - MTZ - Empilhadeira 06" aparece em `ics` com pelo menos 1 chamado na lista `chamados` (o `0826-000056`).

- [ ] **Step 5: Commit**

```bash
cd "backend"
git add src/routes/indicadores.js
git commit -m "feat: rota GET /api/configuracao/equipamentos/por-ic"
```

---

### Task 4: Função de API no frontend (`api.js`)

**Files:**
- Modify: `frontend/src/api.js` (fim do arquivo)

**Interfaces:**
- Consumes: rota da Task 3, helper `getJson` já existente no topo do arquivo.
- Produces (usado pela Task 5): `fetchEquipamentosPorIc(opts): Promise<{ics, totalChamados, totalComIc, totalSemIc}>` — `opts` aceita `{dataInicio, dataFim}` (mesmo padrão de `fetchOrcamento`).

- [ ] **Step 1: Adicionar a função no fim de `frontend/src/api.js`**

```js

export function fetchEquipamentosPorIc(opts) {
  return getJson("/api/configuracao/equipamentos/por-ic", opts);
}
```

- [ ] **Step 2: Validar build**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros.

- [ ] **Step 3: Commit**

```bash
cd "frontend"
git add src/api.js
git commit -m "feat: funcao de API para equipamentos por Ic"
```

---

### Task 5: Página `EquipamentosPorIc.jsx`

**Files:**
- Create: `frontend/src/pages/EquipamentosPorIc.jsx`

**Interfaces:**
- Consumes: `fetchEquipamentosPorIc` (Task 4); componentes existentes `StatTile`, `DonutChart`, `HorizontalBarChart`, `RankingTable`, `Modal`, `DrillDownContent`, `DateFilterBar`; hook `useDrillDown` (`abrirChamado({chave, codChamado})`); helpers `periodoMesFiscal`, `formatBR` de `lib/datas.js`.
- Produces (usado pela Task 6): `export default function EquipamentosPorIc()` — componente de página, sem props.

- [ ] **Step 1: Criar `frontend/src/pages/EquipamentosPorIc.jsx`**

```jsx
import { useState } from "react";
import { fetchEquipamentosPorIc } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { DonutChart } from "../components/DonutChart.jsx";
import { HorizontalBarChart } from "../components/HorizontalBarChart.jsx";
import { RankingTable } from "../components/RankingTable.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { periodoMesFiscal, formatBR } from "../lib/datas.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Modal de perfil de um Ic específico — mantém seu PRÓPRIO useDrillDown/Modal aninhado pra abrir
// o detalhe de um chamado (mesmo padrão já usado em OperadoresTable.jsx), sem precisar estender
// DrillDownContent.jsx com um tipo novo.
function PerfilIc({ ic, onClose }) {
  const drill = useDrillDown();

  const donutData = [
    { label: "Preventiva", total: ic.preventiva },
    { label: "Corretiva", total: ic.corretiva },
  ];

  return (
    <Modal title={ic.ic} onClose={onClose}>
      <section className="stat-grid">
        <StatTile label="Total de chamados" value={ic.total} />
        <StatTile label="Custo total" value={formatBRL(ic.custoTotal)} />
        <StatTile
          label="Recorrência média"
          value={ic.recorrenciaDias !== null ? `a cada ${ic.recorrenciaDias}d` : "poucos dados"}
        />
      </section>

      <div className="panel">
        <h2>Preventiva x Corretiva</h2>
        <DonutChart data={donutData} height={200} />
      </div>

      <div className="panel full-width">
        <h2>Histórico</h2>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Data</th>
              <th>Tipo</th>
              <th>Causa</th>
              <th>Valor</th>
              <th>Horímetro</th>
            </tr>
          </thead>
          <tbody>
            {ic.chamados.map((c) => (
              <tr
                key={c.chave}
                className="clickable-row"
                onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}
              >
                <td>{c.codChamado}</td>
                <td>{formatBR(c.dataCriacao)}</td>
                <td>{c.tipo ?? "—"}</td>
                <td>{c.causa ?? "—"}</td>
                <td className="num">{c.valorAprovacao ? formatBRL(c.valorAprovacao) : "—"}</td>
                <td className="num">{c.horimetro ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}
    </Modal>
  );
}

export default function EquipamentosPorIc() {
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [state, setState] = useState({ status: "idle", payload: null, error: null });
  const [icSelecionado, setIcSelecionado] = useState(null);

  async function calcular() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchEquipamentosPorIc(periodo);
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  const selecionarIc = (label, agregado, entry) => setIcSelecionado(entry);

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Equipamentos por Ic</h2>
          <p className="subtitle">
            Custo e recorrência por equipamento específico (Ic do DeskManager) — só chamados de
            Manutenção com Ic identificado na interação.
          </p>
        </div>
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={calcular} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Calculando..." : "Calcular"}
        </button>
      </div>

      {state.status === "loading" && (
        <p className="subtitle">Buscando histórico de cada chamado do período — pode levar até 1 minuto...</p>
      )}

      {state.status === "error" && <div className="state-banner error">Erro ao calcular: {state.error}</div>}

      {state.payload && (
        <>
          <div className="meta" style={{ marginBottom: 12 }}>
            {state.payload.totalChamados} chamados de Manutenção no período — {state.payload.totalComIc} com Ic
            identificado, {state.payload.totalSemIc} sem
          </div>

          {state.payload.ics.length === 0 ? (
            <p className="subtitle">Nenhum chamado com Ic identificado nesse período.</p>
          ) : (
            <>
              <div className="panel full-width">
                <h2>Top equipamentos por volume de chamados</h2>
                <HorizontalBarChart
                  data={state.payload.ics.map((ic) => ({ ...ic, label: ic.ic }))}
                  limit={15}
                  agregarOutros={false}
                  height={Math.min(state.payload.ics.length, 15) * 26 + 20}
                  onBarClick={selecionarIc}
                />
              </div>

              <div className="panel full-width">
                <h2>Todos os equipamentos ({state.payload.ics.length})</h2>
                <RankingTable
                  data={state.payload.ics.map((ic) => ({ ...ic, label: ic.ic }))}
                  nomeColuna="Equipamento (Ic)"
                  onSelecionar={selecionarIc}
                />
              </div>
            </>
          )}
        </>
      )}

      {icSelecionado && <PerfilIc ic={icSelecionado} onClose={() => setIcSelecionado(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Validar build**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros (o componente ainda não está montado em nenhuma rota — isso só confirma sintaxe/imports corretos).

- [ ] **Step 3: Commit**

```bash
cd "frontend"
git add src/pages/EquipamentosPorIc.jsx
git commit -m "feat: pagina de equipamentos por Ic"
```

---

### Task 6: Ligar a 3ª sub-aba em Configurações → Equipamentos + verificação end-to-end

**Files:**
- Modify: `frontend/src/pages/Configuracoes.jsx`

**Interfaces:**
- Consumes: `EquipamentosPorIc` (Task 5).
- Produces: nada — task final.

- [ ] **Step 1: Ler o arquivo atual**

`frontend/src/pages/Configuracoes.jsx` hoje (arquivo inteiro, é pequeno):

```jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import ConfiguracaoStatus from "./ConfiguracaoStatus.jsx";
import ConfiguracaoEquipamentos from "./ConfiguracaoEquipamentos.jsx";

const ABAS = [
  { value: "status", label: "Status" },
  { value: "equipamentos", label: "Equipamentos" },
];

export default function Configuracoes() {
  const [aba, setAba] = useState("status");

  return (
    <div>
      <SubTabs options={ABAS} active={aba} onChange={setAba} />
      {aba === "status" && <ConfiguracaoStatus />}
      {aba === "equipamentos" && <ConfiguracaoEquipamentos />}
    </div>
  );
}
```

- [ ] **Step 2: Substituir pelo conteúdo com a 3ª aba**

Reescrever `frontend/src/pages/Configuracoes.jsx` inteiro para:

```jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import ConfiguracaoStatus from "./ConfiguracaoStatus.jsx";
import ConfiguracaoEquipamentos from "./ConfiguracaoEquipamentos.jsx";
import EquipamentosPorIc from "./EquipamentosPorIc.jsx";

const ABAS = [
  { value: "status", label: "Status" },
  { value: "equipamentos", label: "Equipamentos" },
  { value: "por-ic", label: "Por Ic" },
];

export default function Configuracoes() {
  const [aba, setAba] = useState("status");

  return (
    <div>
      <SubTabs options={ABAS} active={aba} onChange={setAba} />
      {aba === "status" && <ConfiguracaoStatus />}
      {aba === "equipamentos" && <ConfiguracaoEquipamentos />}
      {aba === "por-ic" && <EquipamentosPorIc />}
    </div>
  );
}
```

- [ ] **Step 3: Validar build**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros.

- [ ] **Step 4: Verificação manual end-to-end (via curl/grep — sem navegador neste ambiente)**

1. `grep -n "EquipamentosPorIc\|por-ic" frontend/src/pages/Configuracoes.jsx` — confirme import, entrada em `ABAS`, e o `{aba === "por-ic" && ...}`.
2. Backend no ar (`curl -s -m 3 http://localhost:3001/api/health`; suba com `cd backend && npm start` em background se não responder).
3. Repita a chamada da Task 3 Step 4 (`GET /api/configuracao/equipamentos/por-ic?dataInicio=2026-08-01&dataFim=2026-08-05`) e confirme de novo que "Empilhadeira 06" aparece — isso valida que a cadeia completa (rota → serviço → histórico) segue funcionando depois de todas as mudanças de frontend.
4. Suba o frontend em dev (`cd frontend && npm run dev -- --port 5174`, background) e `curl -s -m 5 http://localhost:5174/` — confirme HTTP 200 (o Vite serve a SPA; a rota `/configuracoes` é roteada no cliente, então o teste aqui só confirma que o servidor de dev está no ar, não que o clique funciona — isso fica registrado como limitação de verificação sem navegador, igual nas tasks anteriores).

- [ ] **Step 5: Commit**

```bash
cd "frontend"
git add src/pages/Configuracoes.jsx
git commit -m "feat: liga a aba Por Ic em Configuracoes/Equipamentos"
```

---

## Self-Review

**Cobertura da spec:**
- Extrair `ICs`/`Horímetro` reaproveitando o pipeline/cache existente → Task 1. ✓
- Agregação por Ic (total, custo, preventiva/corretiva, recorrência, histórico cronológico) → Task 2. ✓
- Rota com período obrigatório, só Manutenção → Task 3. ✓
- Frontend: gráfico + tabela ranqueada + modal de perfil (StatTiles, donut, tabela cronológica com drill-down pro chamado) → Task 5. ✓
- Carregamento sob demanda (não busca ao montar) → Task 5 (`status: "idle"` inicial, só busca no `calcular()`). ✓
- 3ª sub-aba em Configurações → Equipamentos → Task 6. ✓
- Fora de escopo (número de série/marca-modelo, gráfico de linha do horímetro, mapa de relacionamento, Engenharia) — nenhuma task implementa isso, como esperado. ✓

**Consistência de tipos/assinaturas:** `ic`, `total`, `preventiva`, `corretiva`, `custoTotal`, `recorrenciaDias`, `chamados` (com `chave`, `codChamado`, `dataCriacao`, `tipo`, `causa`, `valorAprovacao`, `horimetro`) usados com o mesmo formato em Task 2 (produção), Task 3 (resposta da rota) e Task 5 (consumo no frontend) — conferido campo a campo, incluindo o truque de `{...ic, label: ic.ic}` pra alimentar `HorizontalBarChart`/`RankingTable` (que esperam `.label`) sem perder nenhum campo do perfil usado depois no modal.

**Nota sobre modal aninhado (Task 5):** é a primeira vez no projeto que um `<Modal>` abre dentro de outro (perfil do Ic → detalhe do chamado). O CSS de `.modal-backdrop`/`.modal-card` usa `position: fixed` sem nenhum ancestral com `transform`/`filter`/`contain`, então funciona corretamente sem mudança de CSS — mas apertar Esc fecha os dois modais de uma vez (cada `<Modal>` tem seu próprio listener de teclado independente). Comportamento pré-existente do `Modal.jsx`, não é um bug introduzido por esta feature — registrado aqui só pra quem for revisar não estranhar.
