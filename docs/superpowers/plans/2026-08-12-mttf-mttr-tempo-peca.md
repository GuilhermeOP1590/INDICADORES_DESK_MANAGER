# MTTF, MTTR e Tempo Aguardando Peça por Ic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 3 indicadores de confiabilidade (MTTF, MTTR, tempo aguardando peça) ao perfil de cada equipamento na aba Equipamentos (Ic).

**Architecture:** Estende dois arquivos de backend já existentes (`historicoChamado.js` e `icsEquipamento.js`) sem criar rota nova — a rota `/configuracao/equipamentos/por-ic` já devolve o objeto `ic` inteiro, então os campos novos chegam ao frontend automaticamente. O frontend ganha 3 `StatTile`s a mais no modal de perfil que já existe.

**Tech Stack:** Node.js (backend, `node:test`), React (frontend), sem dependências novas.

## Global Constraints

- MTTF/MTTR usam só chamados `tipo === "Corretiva"`. Preventiva/Rotina não contam como falha.
- MTTR não desconta tempo em "Aguardando Aprovação" — usa abertura→finalização direto.
- "Tempo aguardando peça" soma os status `"Aguardando Peça do Estoque"` e `"Peça Enviada para Loja"` como um único período parado, em **qualquer** tipo de chamado, medido em **dias** (não horas — o log de interações só tem granularidade de data).
- Os 3 indicadores aparecem só no modal de perfil do equipamento (`PerfilIc`), não na lista "Todos os equipamentos" nem no gráfico.
- Arredondamento: 1 casa decimal em todos os 3, mesmo padrão de `recorrenciaDias` já existente.

---

### Task 1: `extrairTempoAguardandoPecaDias` em `historicoChamado.js`

**Files:**
- Modify: `backend/src/services/historicoChamado.js`
- Test: `backend/src/services/historicoChamado.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores (primeira task do plano).
- Produces: `extrairTempoAguardandoPecaDias(interacoes: object[]): number` (exportada) — dias acumulados (1 casa decimal) em que o chamado passou pelos status de espera de peça. `obterHistoricoChamado` passa a devolver `tempoAguardandoPecaDias: number` dentro do objeto `historico`; `obterHistoricoEmLote`'s fallback de erro devolve `tempoAguardandoPecaDias: 0`. A Task 2 consome esses dois pontos.

O arquivo já busca `Status` e `DataAcao` de cada interação (`Colunas: { Status: "on", ..., DataAcao: "on", ... }` em `fetchInteracoes` — não precisa mudar isso). Formato de uma interação, já usado por `extrairPassouPorAguardandoAprovacao`: `interacao.Status?.[0]?.text` é o nome do status; `interacao.DataAcao` é uma string tipo `"11-08-2026"` (sem hora), convertida com o helper interno já existente `paraIso(dataBR)` → `"2026-08-11"`.

- [ ] **Step 1: Escrever os testes que falham**

Abra `backend/src/services/historicoChamado.test.js` e adicione o import e os testes abaixo (mantendo os testes que já existem no arquivo):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairIcs, extrairHorimetro, extrairTempoAguardandoPecaDias } from "./historicoChamado.js";
```

```js
test("extrairTempoAguardandoPecaDias soma um período fechado (entrou e saiu)", () => {
  const interacoes = [
    { Status: [{ text: "Em Andamento" }], DataAcao: "05-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "01-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 4);
});

test("extrairTempoAguardandoPecaDias funde Aguardando Peça do Estoque + Peça Enviada para Loja como um único período", () => {
  const interacoes = [
    { Status: [{ text: "Resolvido" }], DataAcao: "10-08-2026" },
    { Status: [{ text: "Peça Enviada para Loja" }], DataAcao: "03-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "01-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 9);
});

test("extrairTempoAguardandoPecaDias conta até agora quando o período ainda não fechou", () => {
  const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const dataBR = `${String(doisDiasAtras.getDate()).padStart(2, "0")}-${String(doisDiasAtras.getMonth() + 1).padStart(2, "0")}-${doisDiasAtras.getFullYear()}`;
  const interacoes = [{ Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: dataBR }];
  const resultado = extrairTempoAguardandoPecaDias(interacoes);
  assert.ok(resultado >= 1 && resultado <= 3, `esperado ~2 dias, veio ${resultado}`);
});

test("extrairTempoAguardandoPecaDias retorna 0 sem nenhuma ocorrência", () => {
  const interacoes = [{ Status: [{ text: "Resolvido" }], DataAcao: "10-08-2026" }];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 0);
});

test("extrairTempoAguardandoPecaDias soma dois períodos separados no mesmo histórico", () => {
  const interacoes = [
    { Status: [{ text: "Resolvido" }], DataAcao: "20-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "18-08-2026" },
    { Status: [{ text: "Em Andamento" }], DataAcao: "10-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "05-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 7);
});

test("extrairTempoAguardandoPecaDias ignora interações sem DataAcao", () => {
  const interacoes = [
    { Status: [{ text: "Aguardando Peça do Estoque" }] },
    { Status: [{ text: "Resolvido" }], DataAcao: "10-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 0);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/historicoChamado.test.js`
Expected: FAIL — `extrairTempoAguardandoPecaDias is not a function` (ainda não existe).

- [ ] **Step 3: Implementar `extrairTempoAguardandoPecaDias` e conectar no pipeline**

Em `backend/src/services/historicoChamado.js`, adicione logo abaixo de `extrairHorimetro` (antes de `export async function obterHistoricoChamado`):

```js
const STATUS_AGUARDANDO_PECA = new Set(["Aguardando Peça do Estoque", "Peça Enviada para Loja"]);

// Interações vêm da mais recente pra mais antiga — inverte pra varrer em ordem cronológica.
// Funde entradas consecutivas nos 2 status de espera de peça como um único período parado
// (trocar de um status pro outro não fecha o período — a peça só resolve quando instalada).
// Se o período mais recente ainda não fechou (chamado segue parado nesse status), conta até
// agora, pra refletir travas em andamento, não só as já resolvidas.
export function extrairTempoAguardandoPecaDias(interacoes) {
  const cronologico = [...interacoes].reverse();
  let diasTotal = 0;
  let entradaEm = null;

  for (const interacao of cronologico) {
    if (!interacao.DataAcao) continue;
    const data = new Date(paraIso(interacao.DataAcao));
    const status = interacao.Status?.[0]?.text;
    const aguardandoPeca = STATUS_AGUARDANDO_PECA.has(status);

    if (aguardandoPeca && entradaEm === null) {
      entradaEm = data;
    } else if (!aguardandoPeca && entradaEm !== null) {
      diasTotal += (data.getTime() - entradaEm.getTime()) / (1000 * 60 * 60 * 24);
      entradaEm = null;
    }
  }

  if (entradaEm !== null) {
    diasTotal += (Date.now() - entradaEm.getTime()) / (1000 * 60 * 60 * 24);
  }

  return Math.round(diasTotal * 10) / 10;
}
```

Agora conecte no pipeline. Em `obterHistoricoChamado`, o objeto `historico` fica:

```js
  const interacoes = await fetchInteracoes({ chave, codChamado });
  const historico = {
    causa: extrairCausa(interacoes),
    passouPorAguardandoAprovacao: extrairPassouPorAguardandoAprovacao(interacoes),
    valorAprovacao: extrairValorAprovacao(interacoes),
    dataAprovacao: extrairDataAprovacao(interacoes),
    ics: extrairIcs(interacoes),
    horimetro: extrairHorimetro(interacoes),
    tempoAguardandoPecaDias: extrairTempoAguardandoPecaDias(interacoes),
  };
```

E o fallback de erro dentro de `obterHistoricoEmLote` fica:

```js
export async function obterHistoricoEmLote(chamados, { concorrencia = 60, forceRefresh = false } = {}) {
  const historicos = await mapComConcorrencia(chamados, concorrencia, (chamado) =>
    obterHistoricoChamado({ chave: chamado.Chave, codChamado: chamado.CodChamado }, { forceRefresh }).catch(() => ({
      causa: null,
      passouPorAguardandoAprovacao: false,
      valorAprovacao: null,
      dataAprovacao: null,
      ics: [],
      horimetro: null,
      tempoAguardandoPecaDias: 0,
    }))
  );
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/historicoChamado.test.js`
Expected: PASS — todos os testes do arquivo, incluindo os 6 novos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/historicoChamado.js backend/src/services/historicoChamado.test.js
git commit -m "feat: extrai tempo aguardando peça do histórico de interações do chamado"
```

---

### Task 2: MTTF, MTTR e soma de tempo aguardando peça em `icsEquipamento.js`

**Files:**
- Modify: `backend/src/services/icsEquipamento.js`
- Test: `backend/src/services/icsEquipamento.test.js`

**Interfaces:**
- Consumes: `historico.tempoAguardandoPecaDias: number` (Task 1, já presente em todo item de `historicoMap`, inclusive no fallback de erro que devolve `0`).
- Produces: cada item retornado por `buildPorIc` ganha 3 campos novos: `mttfHoras: number | null`, `mttrHoras: number | null`, `tempoAguardandoPecaDiasTotal: number`. A Task 3 consome esses 3 campos.

`buildPorIc` já recebe `chamados` (objetos crus com `DataCriacao`, `NomeStatus`, `tipo`, `cliente`, etc. — campos nativos, sem precisar de enriquecimento) e `historicoMap` (`Chave -> historico`). Hoje a `linha` por chamado já tem `dataCriacao`, `tipo`, `horimetro`, `cliente`, `status`. Precisa ganhar `horaCriacao`, `dataFinalizacao`, `horaFinalizacao` (dos campos nativos `chamado.HoraCriacao`/`chamado.DataFinalizacao`/`chamado.HoraFinalizacao`, mesmo padrão já usado em `backend/src/routes/indicadores.js:175-176`) e `tempoAguardandoPecaDias`.

- [ ] **Step 1: Escrever os testes que falham**

Em `backend/src/services/icsEquipamento.test.js`, troque o helper `chamado()` no topo do arquivo por esta versão (adiciona os campos novos com default, sem quebrar os testes que já existem):

```js
function chamado(overrides) {
  return {
    Chave: 1,
    CodChamado: "0000-000001",
    DataCriacao: "2026-08-01",
    HoraCriacao: "08:00:00",
    DataFinalizacao: null,
    HoraFinalizacao: null,
    tipo: "Preventiva",
    cliente: null,
    NomeStatus: null,
    ...overrides,
  };
}
```

Adicione estes testes antes do teste `"buildPorIc ordena por total desc"`:

```js
test("buildPorIc calcula mttfHoras como a média das diferenças de horímetro entre Corretivas", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Corretiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
    chamado({ Chave: 3, tipo: "Corretiva", DataCriacao: "2026-08-10" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: "1050", causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: "1120", causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, 60);
});

test("buildPorIc descarta leitura de horímetro decrescente sem quebrar o delta seguinte", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Corretiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
    chamado({ Chave: 3, tipo: "Corretiva", DataCriacao: "2026-08-10" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: "900", causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: "1080", causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, 80);
});

test("buildPorIc retorna mttfHoras null com menos de 2 leituras válidas", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Corretiva" })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, null);
});

test("buildPorIc ignora chamados que não são Corretiva no cálculo de mttfHoras", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Preventiva", DataCriacao: "2026-08-05" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: "1050", causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, null);
});

test("buildPorIc calcula mttrHoras como a média do tempo de reparo das Corretivas finalizadas", () => {
  const chamados = [
    chamado({
      Chave: 1,
      tipo: "Corretiva",
      DataCriacao: "2026-08-01",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-01",
      HoraFinalizacao: "12:00:00",
    }),
    chamado({
      Chave: 2,
      tipo: "Corretiva",
      DataCriacao: "2026-08-02",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-02",
      HoraFinalizacao: "20:00:00",
    }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, 8);
});

test("buildPorIc ignora Corretiva não finalizada no cálculo de mttrHoras", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Corretiva", DataFinalizacao: null })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, null);
});

test("buildPorIc retorna mttrHoras null sem nenhuma Corretiva finalizada", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Preventiva" })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, null);
});

test("buildPorIc soma tempoAguardandoPecaDiasTotal entre chamados de tipos diferentes", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Corretiva" }),
    chamado({ Chave: 2, tipo: "Preventiva" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 3 }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 1.5 }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.tempoAguardandoPecaDiasTotal, 4.5);
});

test("buildPorIc retorna tempoAguardandoPecaDiasTotal 0 sem nenhuma ocorrência", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.tempoAguardandoPecaDiasTotal, 0);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/icsEquipamento.test.js`
Expected: FAIL — os testes novos falham (`resultado.mttfHoras` vem `undefined`, não `60`/`80`/`null`; mesma coisa pra `mttrHoras` e `tempoAguardandoPecaDiasTotal`).

- [ ] **Step 3: Implementar os 2 helpers e conectar no retorno de `buildPorIc`**

No topo de `backend/src/services/icsEquipamento.js`, adicione o import:

```js
import { parseDateTime } from "./indicadores.js";
```

Troque o corpo da `linha` (dentro do `for (const chamado of chamados)`) para incluir os campos novos:

```js
    const linha = {
      chave: chamado.Chave,
      codChamado: chamado.CodChamado,
      dataCriacao: chamado.DataCriacao,
      horaCriacao: chamado.HoraCriacao ?? null,
      dataFinalizacao: chamado.DataFinalizacao ?? null,
      horaFinalizacao: chamado.HoraFinalizacao ?? null,
      tipo: chamado.tipo,
      causa: historico?.causa ?? null,
      valorAprovacao: historico?.valorAprovacao ?? null,
      horimetro: historico?.horimetro ?? null,
      cliente: chamado.cliente ?? null,
      status: chamado.NomeStatus ?? null,
      tempoAguardandoPecaDias: historico?.tempoAguardandoPecaDias ?? 0,
    };
```

Troque o objeto retornado dentro do `.map(({ ic, chamados: lista }) => { ... })` pra incluir os 3 campos novos:

```js
      return {
        ic,
        total: ordenados.length,
        cliente: clienteMaisFrequente(ordenados),
        preventiva,
        corretiva,
        custoTotal,
        recorrenciaDias: calcularRecorrenciaDias(ordenados.map((c) => c.dataCriacao).filter(Boolean)),
        mttfHoras: calcularMttfHoras(ordenados.filter((c) => c.tipo === "Corretiva")),
        mttrHoras: calcularMttrHoras(ordenados.filter((c) => c.tipo === "Corretiva")),
        tempoAguardandoPecaDiasTotal:
          Math.round(ordenados.reduce((soma, c) => soma + (c.tempoAguardandoPecaDias ?? 0), 0) * 10) / 10,
        chamados: ordenados,
      };
```

Adicione os 2 helpers novos, depois de `clienteMaisFrequente` (e antes ou depois de `calcularRecorrenciaDias`, tanto faz):

```js
// Horímetro é cumulativo — uma leitura menor que a anterior é erro de cadastro, não o
// equipamento "voltando no tempo". Descarta a leitura inteira (não só o delta), senão o
// próximo delta também sai errado. `corretivas` já vem ordenado por data (herda a ordem de
// `ordenados`).
function calcularMttfHoras(corretivas) {
  const leituras = [];
  for (const c of corretivas) {
    if (c.horimetro === null) continue;
    const valor = Number(c.horimetro);
    if (Number.isNaN(valor)) continue;
    if (leituras.length === 0 || valor > leituras[leituras.length - 1]) {
      leituras.push(valor);
    }
  }

  if (leituras.length < 2) return null;

  const deltas = [];
  for (let i = 1; i < leituras.length; i++) {
    deltas.push(leituras[i] - leituras[i - 1]);
  }
  return Math.round((deltas.reduce((soma, d) => soma + d, 0) / deltas.length) * 10) / 10;
}

// Não desconta tempo em "Aguardando Aprovação" — abertura→finalização direto, mesmo padrão de
// tempoResolucaoHoras usado no resto do backend.
function calcularMttrHoras(corretivas) {
  const duracoes = [];
  for (const c of corretivas) {
    if (!c.dataFinalizacao || c.dataFinalizacao === "0000-00-00") continue;
    const inicio = parseDateTime(c.dataCriacao, c.horaCriacao);
    const fim = parseDateTime(c.dataFinalizacao, c.horaFinalizacao);
    if (!inicio || !fim) continue;
    const horas = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    if (horas >= 0) duracoes.push(horas);
  }

  if (duracoes.length === 0) return null;
  return Math.round((duracoes.reduce((soma, h) => soma + h, 0) / duracoes.length) * 10) / 10;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/icsEquipamento.test.js`
Expected: PASS — todos os testes do arquivo, incluindo os 9 novos.

Também rode a suíte inteira do backend pra garantir que nada mais quebrou:

Run: `cd backend && node --test`
Expected: PASS — todos os testes (o total antes desta task era 51).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/icsEquipamento.js backend/src/services/icsEquipamento.test.js
git commit -m "feat: calcula MTTF, MTTR e tempo aguardando peça acumulado por equipamento"
```

---

### Task 3: Exibir os 3 indicadores no perfil do equipamento

**Files:**
- Modify: `frontend/src/pages/EquipamentosPorIc.jsx`

**Interfaces:**
- Consumes: `ic.mttfHoras: number | null`, `ic.mttrHoras: number | null`, `ic.tempoAguardandoPecaDiasTotal: number` (Task 2, já chegam no payload de `GET /api/configuracao/equipamentos/por-ic` sem mudança de rota).
- Produces: nada consumido por outra task (última task do plano).

O componente `PerfilIc` (dentro de `frontend/src/pages/EquipamentosPorIc.jsx`) já tem uma `<section className="stat-grid">` com 4 `StatTile`s (Total de chamados, Cliente, Custo total, Recorrência média). Adicione 3 depois da Recorrência média.

- [ ] **Step 1: Adicionar os 3 StatTiles**

Troque o bloco:

```jsx
      <section className="stat-grid">
        <StatTile label="Total de chamados" value={ic.total} />
        <StatTile label="Cliente" value={ic.cliente ?? "Não identificado"} />
        <StatTile label="Custo total" value={formatBRL(ic.custoTotal)} />
        <StatTile
          label="Recorrência média"
          value={ic.recorrenciaDias !== null ? `a cada ${ic.recorrenciaDias}d` : "poucos dados"}
        />
      </section>
```

por:

```jsx
      <section className="stat-grid">
        <StatTile label="Total de chamados" value={ic.total} />
        <StatTile label="Cliente" value={ic.cliente ?? "Não identificado"} />
        <StatTile label="Custo total" value={formatBRL(ic.custoTotal)} />
        <StatTile
          label="Recorrência média"
          value={ic.recorrenciaDias !== null ? `a cada ${ic.recorrenciaDias}d` : "poucos dados"}
        />
        <StatTile label="MTTF" value={ic.mttfHoras !== null ? `${ic.mttfHoras}h` : "poucos dados"} />
        <StatTile label="MTTR" value={ic.mttrHoras !== null ? `${ic.mttrHoras}h` : "poucos dados"} />
        <StatTile label="Tempo aguardando peça" value={`${ic.tempoAguardandoPecaDiasTotal} dias`} />
      </section>
```

- [ ] **Step 2: Build de produção**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros (o aviso de chunk >500kB já existe hoje e não é deste build).

- [ ] **Step 3: Validar contra a API real**

Reinicie o backend (mata o processo na porta 3001 e roda `npm start` de novo, pra pegar o código da Task 2) e confira o payload:

```bash
curl -s "http://localhost:3001/api/configuracao/equipamentos/por-ic?dataInicio=2026-08-01&dataFim=2026-08-12" | node -e "
let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const j = JSON.parse(data);
  console.log(j.ics.slice(0,3).map(ic => ({ ic: ic.ic, mttfHoras: ic.mttfHoras, mttrHoras: ic.mttrHoras, tempoAguardandoPecaDiasTotal: ic.tempoAguardandoPecaDiasTotal })));
});
"
```

Expected: cada item do array tem as 3 chaves presentes (`mttfHoras`, `mttrHoras` — número ou `null` — e `tempoAguardandoPecaDiasTotal` — sempre número).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EquipamentosPorIc.jsx
git commit -m "feat: mostra MTTF, MTTR e tempo aguardando peça no perfil do equipamento"
```
