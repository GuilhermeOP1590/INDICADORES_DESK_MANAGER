# Filtro de período por data de aprovação/inserção do orçamento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a tela de Orçamento filtrar por 3 datas diferentes — criação (como já funciona hoje), aprovação (data real da decisão) e orçamento inserido (data em que o valor foi lançado) — selecionáveis por 3 minicards, mantendo o modo "Criação" com zero mudança de comportamento.

**Architecture:** Backend ganha uma extração nova de data (`dataDecisao`, derivada do histórico de interações do Desk que já é buscado hoje) e dois filtros genéricos em `filtros.js`; a rota `GET /orcamento` passa a aceitar `modoData` e, quando ele não é `"criacao"`, amplia a janela de busca de chamados 3 meses pra trás antes de filtrar pelo campo do histórico certo. Frontend ganha um seletor de mês calendário paralelo ao mês fiscal já existente, e um novo trio de minicards que troca `modoData` e reseta o período pro tipo de mês correspondente.

**Tech Stack:** Node.js/Express (backend), React 18 + Vite (frontend), `node:test`/`node:assert` para testes de backend, sem framework de teste no frontend (convenção já existente no projeto).

## Global Constraints

- Modo **"criacao"** (padrão) deve manter comportamento idêntico ao atual — nenhuma chamada extra ao Desk, nenhuma mudança de resultado. Isso é a spec inteira: qualquer diff nesse modo é bug.
- **Mês cheio** = do dia 01 ao último dia do mês (calendário), usado só nos modos "aprovacao" e "insercao". Modo "criacao" continua usando o ciclo fiscal (26 do mês anterior a 25 do mês atual) — sem mudança.
- Janela de busca ampliada nos modos "aprovacao"/"insercao": **3 meses** antes do início do período escolhido (constante `MESES_LOOKBACK_HISTORICO`, backend).
- Sem persistência em banco — todo dado continua derivado do Desk em tempo real, com o mesmo cache em memória já existente em `historicoChamado.js`.
- O endpoint `GET /orcamento/resumo-rapido` **não** ganha o parâmetro `modoData` — ele só sabe filtrar por criação (é rápido justamente por não buscar histórico). O frontend simplesmente não o chama fora do modo "criacao".
- Sem teste de rota automatizado nem framework de teste no frontend — seguir a convenção já existente no projeto (verificação manual via curl / build+clique).
- Funções de extração testáveis em `historicoChamado.js` são exportadas (mesmo padrão já usado por `extrairIcs`, `extrairHorimetro`, `extrairNomeEmpresa`, `extrairTempoAguardandoPecaDias`).

---

## File Structure

**Backend:**
- Modify `backend/src/services/historicoChamado.js` — nova extração `extrairDataDecisao`, exportada; novo campo `dataDecisao` no objeto de histórico.
- Modify `backend/src/services/historicoChamado.test.js` — testes de `extrairDataDecisao`.
- Modify `backend/src/services/filtros.js` — novas funções `ampliarParaTras` e `filtrarPorDataHistorico`.
- Create `backend/src/services/filtros.test.js` — testes das 2 funções novas (arquivo não existe ainda).
- Modify `backend/src/routes/indicadores.js` — rota `GET /orcamento` aceita `modoData`, amplia a janela de busca e aplica o filtro certo.

**Frontend:**
- Modify `frontend/src/lib/datas.js` — `periodoMesCalendario`, `nomeMesCalendario`, `listaMesesCalendario` (equivalentes calendário das funções fiscais já existentes).
- Create `frontend/src/lib/useMesesCalendarioDisponiveis.js` — hook espelhando `useMesesFiscaisDisponiveis.js`.
- Modify `frontend/src/components/DateFilterBar.jsx` — prop `modo` nova, decide fiscal vs calendário.
- Modify `frontend/src/pages/Orcamento.jsx` — estado `modoData`, minicards de seleção, reset de período ao trocar modo, `modoData` na chamada de `fetchOrcamento`, resumo rápido pulado fora do modo criação.

---

### Task 1: Backend — extrair a data real de decisão (aprovação/reprovação)

**Files:**
- Modify: `backend/src/services/historicoChamado.js`
- Test: `backend/src/services/historicoChamado.test.js`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `extrairDataDecisao(interacoes)` exportada de `historicoChamado.js`, retorna string ISO (`"AAAA-MM-DD"`) ou `null`. Campo novo `dataDecisao` no objeto retornado por `obterHistoricoChamado`/`obterHistoricoEmLote` (Task 3 consome esse campo via `historicoMap.get(chave).dataDecisao`).

- [ ] **Step 1: Escrever os testes que ainda falham**

Abra `backend/src/services/historicoChamado.test.js`. Troque a linha de import (linha 3) para incluir `extrairDataDecisao`:

```js
import {
  extrairIcs,
  extrairHorimetro,
  extrairNomeEmpresa,
  extrairTempoAguardandoPecaDias,
  extrairDataDecisao,
  ttlPara,
} from "./historicoChamado.js";
```

Acrescente ao final do arquivo (depois do último `test(...)`, que hoje termina na linha 107):

```js

test("extrairDataDecisao pega a data da primeira interação após sair de Aguardando Aprovação", () => {
  const interacoes = [
    { Status: [{ text: "Orçamento Reprovado" }], DataAcao: "03-09-2026" },
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "28-08-2026" },
    { Status: [{ text: "Aberto" }], DataAcao: "20-08-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), "2026-09-03");
});

test("extrairDataDecisao funciona igual pra aprovado (não filtra por status final, só pela transição)", () => {
  const interacoes = [
    { Status: [{ text: "Aprovado" }], DataAcao: "05-09-2026" },
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "01-09-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), "2026-09-05");
});

test("extrairDataDecisao ignora status intermediários que não sejam Aguardando Aprovação", () => {
  const interacoes = [
    { Status: [{ text: "Finalizado" }], DataAcao: "10-09-2026" },
    { Status: [{ text: "Em Execução" }], DataAcao: "06-09-2026" },
    { Status: [{ text: "Aprovado" }], DataAcao: "05-09-2026" },
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "01-09-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), "2026-09-05");
});

test("extrairDataDecisao retorna null quando o chamado nunca passou por Aguardando Aprovação", () => {
  const interacoes = [{ Status: [{ text: "Finalizado" }], DataAcao: "10-09-2026" }];
  assert.equal(extrairDataDecisao(interacoes), null);
});

test("extrairDataDecisao retorna null quando o chamado ainda está Aguardando Aprovação (não decidido)", () => {
  const interacoes = [
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "01-09-2026" },
    { Status: [{ text: "Aberto" }], DataAcao: "20-08-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), null);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Rodar (a partir da raiz do repo):
```bash
cd backend && node --test src/services/historicoChamado.test.js
```
Esperado: falha ao importar (`SyntaxError: The requested module './historicoChamado.js' does not provide an export named 'extrairDataDecisao'`) — a função ainda não existe.

- [ ] **Step 3: Implementar `extrairDataDecisao` e ligar no histórico**

Em `backend/src/services/historicoChamado.js`, logo depois da função `extrairDataAprovacao` (que termina na linha 103, antes do comentário `// Junta os Ics de TODAS as interações...`), acrescente:

```js
// Pega a data em que o chamado DEIXOU "Aguardando Aprovação" pela primeira vez — é a decisão
// real (aprovado ou reprovado), diferente de dataAprovacao (que é quando o valor foi lançado,
// pedindo aprovação — pode ser dias antes da decisão em si). Interações vêm da mais recente pra
// mais antiga; inverte pra varrer em ordem cronológica, mesmo padrão de
// extrairTempoAguardandoPecaDias.
export function extrairDataDecisao(interacoes) {
  const cronologico = [...interacoes].reverse();
  let passouPorAguardando = false;
  for (const interacao of cronologico) {
    const status = interacao.Status?.[0]?.text;
    if (status === "Aguardando Aprovação") {
      passouPorAguardando = true;
      continue;
    }
    if (passouPorAguardando && interacao.DataAcao) {
      return paraIso(interacao.DataAcao);
    }
  }
  return null;
}
```

Depois, no objeto `historico` dentro de `obterHistoricoChamado` (linhas 169-178), acrescente o campo novo:

```js
  const interacoes = await fetchInteracoes({ chave, codChamado });
  const historico = {
    causa: extrairCausa(interacoes),
    passouPorAguardandoAprovacao: extrairPassouPorAguardandoAprovacao(interacoes),
    valorAprovacao: extrairValorAprovacao(interacoes),
    nomeEmpresa: extrairNomeEmpresa(interacoes),
    dataAprovacao: extrairDataAprovacao(interacoes),
    dataDecisao: extrairDataDecisao(interacoes),
    ics: extrairIcs(interacoes),
    horimetro: extrairHorimetro(interacoes),
    tempoAguardandoPecaDias: extrairTempoAguardandoPecaDias(interacoes),
  };
```

E no fallback de erro dentro de `obterHistoricoEmLote` (linhas 204-213):

```js
    ).catch(() => ({
      causa: null,
      passouPorAguardandoAprovacao: false,
      valorAprovacao: null,
      nomeEmpresa: null,
      dataAprovacao: null,
      dataDecisao: null,
      ics: [],
      horimetro: null,
      tempoAguardandoPecaDias: 0,
    }))
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
cd backend && node --test src/services/historicoChamado.test.js
```
Esperado: todos os testes passam, incluindo os 5 novos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/historicoChamado.js backend/src/services/historicoChamado.test.js
git commit -m "feat: extrai data real de decisão de aprovação/reprovação do histórico"
```

---

### Task 2: Backend — filtros genéricos por data de histórico e janela ampliada

**Files:**
- Modify: `backend/src/services/filtros.js`
- Test: Create `backend/src/services/filtros.test.js`

**Interfaces:**
- Consumes: nada de outras tasks (funções puras, independentes).
- Produces: `ampliarParaTras(periodo, meses)` e `filtrarPorDataHistorico(chamados, historicoMap, campo, periodo)`, ambas exportadas de `filtros.js` — Task 3 consome as duas.

- [ ] **Step 1: Escrever os testes que ainda falham**

Crie `backend/src/services/filtros.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ampliarParaTras, filtrarPorDataHistorico } from "./filtros.js";

test("ampliarParaTras desloca dataInicio pra trás em N meses, mantendo dataFim", () => {
  const periodo = { dataInicio: "2026-09-01", dataFim: "2026-09-30" };
  assert.deepEqual(ampliarParaTras(periodo, 3), { dataInicio: "2026-06-01", dataFim: "2026-09-30" });
});

test("ampliarParaTras atravessa virada de ano corretamente", () => {
  const periodo = { dataInicio: "2026-01-15", dataFim: "2026-01-31" };
  assert.deepEqual(ampliarParaTras(periodo, 3), { dataInicio: "2025-10-15", dataFim: "2026-01-31" });
});

test("ampliarParaTras sem dataInicio retorna o período sem alteração", () => {
  const periodo = { dataFim: "2026-09-30" };
  assert.deepEqual(ampliarParaTras(periodo, 3), periodo);
});

test("filtrarPorDataHistorico filtra chamados pelo campo indicado do historicoMap", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }, { Chave: "C" }];
  const historicoMap = new Map([
    ["A", { dataDecisao: "2026-08-15" }],
    ["B", { dataDecisao: "2026-09-10" }],
    ["C", { dataDecisao: "2026-09-25" }],
  ]);
  const resultado = filtrarPorDataHistorico(chamados, historicoMap, "dataDecisao", {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-30",
  });
  assert.deepEqual(resultado.map((c) => c.Chave), ["B", "C"]);
});

test("filtrarPorDataHistorico exclui chamado sem entrada no historicoMap ou com campo nulo", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }];
  const historicoMap = new Map([["A", { dataDecisao: null }]]);
  const resultado = filtrarPorDataHistorico(chamados, historicoMap, "dataDecisao", {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-30",
  });
  assert.deepEqual(resultado, []);
});

test("filtrarPorDataHistorico sem dataInicio/dataFim retorna todos os chamados", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }];
  const historicoMap = new Map();
  assert.deepEqual(filtrarPorDataHistorico(chamados, historicoMap, "dataDecisao", {}), chamados);
});

test("filtrarPorDataHistorico respeita os limites (inclusive) de dataInicio e dataFim", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }, { Chave: "C" }];
  const historicoMap = new Map([
    ["A", { dataAprovacao: "2026-09-01" }],
    ["B", { dataAprovacao: "2026-09-30" }],
    ["C", { dataAprovacao: "2026-10-01" }],
  ]);
  const resultado = filtrarPorDataHistorico(chamados, historicoMap, "dataAprovacao", {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-30",
  });
  assert.deepEqual(resultado.map((c) => c.Chave), ["A", "B"]);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
cd backend && node --test src/services/filtros.test.js
```
Esperado: falha ao importar (`ampliarParaTras`/`filtrarPorDataHistorico` não existem em `filtros.js`).

- [ ] **Step 3: Implementar as duas funções**

Em `backend/src/services/filtros.js`, acrescente ao final do arquivo (depois de `buscarPorTexto`, linha 31):

```js

// Amplia o início do período em N meses pra trás, mantendo o fim — usado quando o filtro real é
// por uma data derivada do histórico (aprovação/inserção do orçamento), que só é conhecida
// DEPOIS de buscar o histórico: sem ampliar a janela de criação, um chamado criado antes do
// período mas decidido/lançado dentro dele nunca entraria no conjunto buscado.
export function ampliarParaTras(periodo, meses) {
  if (!periodo.dataInicio) return periodo;
  const [ano, mes, dia] = periodo.dataInicio.split("-").map(Number);
  const data = new Date(ano, mes - 1 - meses, dia);
  const pad2 = (n) => String(n).padStart(2, "0");
  const dataInicio = `${data.getFullYear()}-${pad2(data.getMonth() + 1)}-${pad2(data.getDate())}`;
  return { ...periodo, dataInicio };
}

// Filtra por uma data derivada do histórico (dataAprovacao ou dataDecisao) em vez de
// DataCriacao — mesma lógica de filtrarPorData, só que a data vem do historicoMap.
export function filtrarPorDataHistorico(chamados, historicoMap, campo, { dataInicio, dataFim } = {}) {
  if (!dataInicio && !dataFim) return chamados;
  return chamados.filter((chamado) => {
    const data = historicoMap.get(chamado.Chave)?.[campo];
    if (!data) return false;
    if (dataInicio && data < dataInicio) return false;
    if (dataFim && data > dataFim) return false;
    return true;
  });
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
cd backend && node --test src/services/filtros.test.js
```
Esperado: todos os 7 testes passam.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/filtros.js backend/src/services/filtros.test.js
git commit -m "feat: adiciona ampliarParaTras e filtrarPorDataHistorico em filtros.js"
```

---

### Task 3: Backend — rota `/orcamento` aceita `modoData`

**Files:**
- Modify: `backend/src/routes/indicadores.js`

**Interfaces:**
- Consumes: `extrairDataDecisao`/campo `dataDecisao` (Task 1, via `historicoMap`), `ampliarParaTras`/`filtrarPorDataHistorico` (Task 2).
- Produces: `GET /orcamento` aceita query param `modoData` (`"criacao"` default | `"aprovacao"` | `"insercao"`); resposta ganha campo `modoData` (eco do que foi aplicado) — Task 6 (frontend) consome via `fetchOrcamento({ modoData, ... })`.

- [ ] **Step 1: Atualizar o import de `filtros.js`**

Em `backend/src/routes/indicadores.js`, linha 22, troque:

```js
import { excluirCancelados, filtrarPorData, filtrarPorUf, buscarPorTexto } from "../services/filtros.js";
```

por:

```js
import { excluirCancelados, filtrarPorData, filtrarPorUf, buscarPorTexto, ampliarParaTras, filtrarPorDataHistorico } from "../services/filtros.js";
```

- [ ] **Step 2: Reescrever a rota `GET /orcamento`**

Localize a rota (linhas 454-472):

```js
indicadoresRouter.get("/orcamento", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const especialidade = req.query.especialidade || "Geral";

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), req.query.q), req.query.uf);
    if (especialidade !== "Geral") {
      noPeriodo = noPeriodo.filter((c) => c.especialidade === especialidade);
    }

    const historicoMap = await obterHistoricoEmLote(noPeriodo);
    res.json({ especialidade, ...buildOrcamento(noPeriodo, historicoMap) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

Substitua por:

```js
const MESES_LOOKBACK_HISTORICO = 3;
const CAMPO_HISTORICO_POR_MODO = { aprovacao: "dataDecisao", insercao: "dataAprovacao" };

indicadoresRouter.get("/orcamento", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const especialidade = req.query.especialidade || "Geral";
    const modoData = req.query.modoData || "criacao";

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const periodoBusca = modoData === "criacao" ? periodo : ampliarParaTras(periodo, MESES_LOOKBACK_HISTORICO);
    let candidatos = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodoBusca), req.query.q), req.query.uf);
    if (especialidade !== "Geral") {
      candidatos = candidatos.filter((c) => c.especialidade === especialidade);
    }

    const historicoMap = await obterHistoricoEmLote(candidatos);
    const noPeriodo =
      modoData === "criacao"
        ? candidatos
        : filtrarPorDataHistorico(candidatos, historicoMap, CAMPO_HISTORICO_POR_MODO[modoData], periodo);

    res.json({ especialidade, modoData, ...buildOrcamento(noPeriodo, historicoMap) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

Note que a constante `MESES_LOOKBACK_HISTORICO` e o mapa `CAMPO_HISTORICO_POR_MODO` ficam **fora** do handler, no nível do módulo (mesmo estilo de `apenasManutencaoEEngenharia`, declarado uma vez).

- [ ] **Step 3: Rodar a suite de testes do backend inteira, garantir que nada quebrou**

```bash
cd backend && node --test
```
Esperado: todos os testes existentes continuam passando (nenhum teste de rota, então isso é regressão em `orcamento.js`/`filtros.js`/`historicoChamado.js`, não da rota em si).

- [ ] **Step 4: Verificação manual da rota nova**

Suba o backend localmente (`cd backend && npm run dev` ou equivalente já usado no projeto) e rode, num período com dados reais:

```bash
curl "http://localhost:3000/api/orcamento?dataInicio=2026-08-26&dataFim=2026-09-25&modoData=criacao" | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const j=JSON.parse(d); console.log('criacao:', j.totalChamados, 'chamados, modoData:', j.modoData)})"

curl "http://localhost:3000/api/orcamento?dataInicio=2026-09-01&dataFim=2026-09-30&modoData=aprovacao" | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const j=JSON.parse(d); console.log('aprovacao:', j.totalChamados, 'chamados, modoData:', j.modoData)})"
```

Esperado: a segunda chamada responde (pode demorar mais — ela busca histórico de uma janela maior), `modoData` no JSON bate com o que foi pedido, e `totalChamados` é diferente entre os dois modos (confirma que o filtro está de fato mudando o conjunto, não só ecoando o parâmetro).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/indicadores.js
git commit -m "feat: rota /orcamento aceita modoData (criacao/aprovacao/insercao)"
```

---

### Task 4: Frontend — mês calendário (utilitários + hook)

**Files:**
- Modify: `frontend/src/lib/datas.js`
- Create: `frontend/src/lib/useMesesCalendarioDisponiveis.js`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `periodoMesCalendario(deslocamento = 0)`, `nomeMesCalendario(periodo)`, `listaMesesCalendario(qtd = 15)` exportadas de `datas.js`; `useMesesCalendarioDisponiveis()` exportada do hook novo. Task 5 (`DateFilterBar.jsx`) consome as duas; Task 6 (`Orcamento.jsx`) consome `periodoMesCalendario`.

- [ ] **Step 1: Adicionar as funções de mês calendário em `datas.js`**

Em `frontend/src/lib/datas.js`, logo depois de `listaMesesFiscais` (que termina na linha 100, antes de `function inicioDaSemana`), acrescente:

```js

// Mês calendário cheio (dia 01 ao último dia) — diferente do ciclo fiscal (26→25) usado pro modo
// "Criação". `deslocamento` em meses (negativo = passado), mesmo padrão de deslocarMeses.
export function periodoMesCalendario(deslocamento = 0) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento + 1, 0);
  return { dataInicio: formatISO(inicio), dataFim: formatISO(fim) };
}

export function nomeMesCalendario(periodo) {
  const [ano, mes] = periodo.dataInicio.split("-").map(Number);
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
}

// Lista os últimos `qtd` meses calendário (mais recente primeiro) — mesmo papel de
// listaMesesFiscais, mas pro seletor de mês cheio.
export function listaMesesCalendario(qtd = 15) {
  const lista = [];
  for (let i = 0; i < qtd; i++) {
    const periodo = periodoMesCalendario(-i);
    lista.push({ ...periodo, label: nomeMesCalendario(periodo) });
  }
  return lista;
}
```

- [ ] **Step 2: Verificar manualmente que os cálculos batem**

Rode a partir de `frontend/`:

```bash
node --input-type=module -e "
import('./src/lib/datas.js').then((m) => {
  console.log('mes atual:', m.periodoMesCalendario(0));
  console.log('mes anterior:', m.periodoMesCalendario(-1));
  console.log('lista(3):', m.listaMesesCalendario(3).map((x) => x.label));
});
"
```

Esperado (rodando em setembro/2026): `mes atual` → `{ dataInicio: '2026-09-01', dataFim: '2026-09-30' }`; `mes anterior` → `{ dataInicio: '2026-08-01', dataFim: '2026-08-31' }`; `lista(3)` → `[ 'Set/26', 'Ago/26', 'Jul/26' ]`.

- [ ] **Step 3: Criar o hook `useMesesCalendarioDisponiveis`**

Crie `frontend/src/lib/useMesesCalendarioDisponiveis.js` (espelha `useMesesFiscaisDisponiveis.js` linha por linha, trocando a fonte de meses):

```js
import { useEffect, useState } from "react";
import { fetchPeriodosDisponiveis } from "../api.js";
import { listaMesesCalendario } from "./datas.js";

// Só lista meses calendário que têm pelo menos um chamado — mesmo racional de
// useMesesFiscaisDisponiveis, só que pro seletor de mês cheio (modos Aprovação/Inserção).
export function useMesesCalendarioDisponiveis() {
  const [meses, setMeses] = useState(listaMesesCalendario());

  useEffect(() => {
    fetchPeriodosDisponiveis()
      .then(({ dataMinima, dataMaxima }) => {
        if (!dataMinima || !dataMaxima) return;
        setMeses(listaMesesCalendario().filter((mes) => mes.dataInicio <= dataMaxima && mes.dataFim >= dataMinima));
      })
      .catch(() => {});
  }, []);

  return meses;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/datas.js frontend/src/lib/useMesesCalendarioDisponiveis.js
git commit -m "feat: adiciona mês calendário (utilitários + hook) em paralelo ao mês fiscal"
```

---

### Task 5: Frontend — `DateFilterBar` ganha o modo fiscal/calendário

**Files:**
- Modify: `frontend/src/components/DateFilterBar.jsx`

**Interfaces:**
- Consumes: `periodoMesCalendario` não é usado aqui diretamente, mas `nomeMesCalendario` (Task 4) e `useMesesCalendarioDisponiveis` (Task 4).
- Produces: `<DateFilterBar periodo={...} onChange={...} modo="criacao" | "aprovacao" | "insercao" />` — prop `modo` opcional, default `"criacao"` (comportamento atual preservado se ninguém passar a prop). Task 6 consome passando `modo={modoData}`.

- [ ] **Step 1: Reescrever `DateFilterBar.jsx`**

Substitua o arquivo inteiro `frontend/src/components/DateFilterBar.jsx` por:

```jsx
import { useState } from "react";
import { periodoHoje, periodoOntem, periodoSemanaPassada, nomeMesFiscal, nomeMesCalendario } from "../lib/datas.js";
import { useMesesFiscaisDisponiveis } from "../lib/useMesesFiscaisDisponiveis.js";
import { useMesesCalendarioDisponiveis } from "../lib/useMesesCalendarioDisponiveis.js";

const PRESETS = [
  { key: "hoje", label: "Hoje", calcular: periodoHoje },
  { key: "ontem", label: "Ontem", calcular: periodoOntem },
  { key: "semana", label: "Semana passada", calcular: periodoSemanaPassada },
  { key: "personalizado", label: "Personalizado", calcular: null },
];

export function DateFilterBar({ periodo, onChange, modo = "criacao" }) {
  const [presetAtivo, setPresetAtivo] = useState("mes");
  const mesesFiscais = useMesesFiscaisDisponiveis();
  const mesesCalendario = useMesesCalendarioDisponiveis();
  const ehFiscal = modo === "criacao";
  const meses = ehFiscal ? mesesFiscais : mesesCalendario;
  const nomeMes = ehFiscal ? nomeMesFiscal : nomeMesCalendario;

  function selecionarPreset(preset) {
    setPresetAtivo(preset.key);
    if (preset.calcular) {
      onChange(preset.calcular());
    }
  }

  function selecionarMes(e) {
    const mes = meses.find((m) => m.label === e.target.value);
    if (!mes) return;
    setPresetAtivo("mes");
    onChange({ dataInicio: mes.dataInicio, dataFim: mes.dataFim });
  }

  return (
    <div className="date-filter-bar">
      <select
        className={`date-filter-select ${presetAtivo === "mes" ? "active" : ""}`}
        value={presetAtivo === "mes" ? nomeMes(periodo) : ""}
        onChange={selecionarMes}
      >
        <option value="" disabled>
          {ehFiscal ? "Mês fiscal (26 a 25)" : "Mês (01 ao fim)"}
        </option>
        {meses.map((mes) => (
          <option key={mes.label} value={mes.label}>
            {mes.label}
          </option>
        ))}
      </select>
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          className={`date-filter-btn ${presetAtivo === preset.key ? "active" : ""}`}
          onClick={() => selecionarPreset(preset)}
        >
          {preset.label}
        </button>
      ))}
      {presetAtivo === "personalizado" && (
        <span className="date-filter-custom">
          <input type="date" value={periodo.dataInicio ?? ""} onChange={(e) => onChange({ ...periodo, dataInicio: e.target.value })} />
          <span>até</span>
          <input type="date" value={periodo.dataFim ?? ""} onChange={(e) => onChange({ ...periodo, dataFim: e.target.value })} />
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificação manual**

Rode o frontend (`cd frontend && npm run dev`) e abra a tela de Orçamento (única tela que usa `DateFilterBar` hoje — confirme com `grep -r "DateFilterBar" frontend/src` se outra tela também usa, e cheque essa também). Sem nenhuma outra mudança ainda (Task 6 não foi feita), o dropdown deve continuar mostrando "Mês fiscal (26 a 25)" e os meses fiscais de sempre — só a prop `modo` (não usada ainda por ninguém) foi adicionada, `modo` default é `"criacao"`, então nada muda visualmente ainda.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DateFilterBar.jsx
git commit -m "feat: DateFilterBar ganha prop modo pra alternar entre mês fiscal e mês calendário"
```

---

### Task 6: Frontend — minicards de modo na tela de Orçamento

**Files:**
- Modify: `frontend/src/pages/Orcamento.jsx`

**Interfaces:**
- Consumes: `periodoMesCalendario` (Task 4), `modo` prop de `DateFilterBar` (Task 5), `modoData` na query de `GET /orcamento` (Task 3).
- Produces: comportamento final visível na tela — nenhuma outra task consome esta.

- [ ] **Step 1: Atualizar o import de `datas.js`**

Linha 18, troque:

```js
import { periodoMesFiscal, deslocarMeses, formatBR } from "../lib/datas.js";
```

por:

```js
import { periodoMesFiscal, periodoMesCalendario, deslocarMeses, formatBR } from "../lib/datas.js";
```

- [ ] **Step 2: Adicionar a constante `MODOS_DATA`**

Depois do array `ABAS` (linhas 20-24) e antes de `formatBRL` (linha 26):

```js
const ABAS = [
  { value: "Geral", label: "Geral" },
  { value: "Manutenção", label: "Manutenção" },
  { value: "Engenharia", label: "Engenharia" },
];

const MODOS_DATA = [
  { value: "criacao", label: "Criação", calcularPeriodo: periodoMesFiscal },
  { value: "aprovacao", label: "Aprovação", calcularPeriodo: () => periodoMesCalendario(0) },
  { value: "insercao", label: "Orçamento inserido", calcularPeriodo: () => periodoMesCalendario(0) },
];

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
```

- [ ] **Step 3: Adicionar estado `modoData` e a função `selecionarModoData`**

Logo após `const [aba, setAba] = useState("Geral");` (linha 33), acrescente o estado:

```js
  const [aba, setAba] = useState("Geral");
  const [modoData, setModoData] = useState("criacao");
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
```

Depois de `const ufsDisponiveis = useUfsDisponiveis();` (linha 41) e antes de `const [comparando, setComparando] = useState(false);` (linha 43), acrescente a função:

```js
  const ufsDisponiveis = useUfsDisponiveis();

  // Reseta o período pro tipo de mês certo (fiscal pra criação, calendário cheio pros outros 2)
  // sempre que o modo muda — sem isso, trocar de "Criação" pra "Aprovação" manteria um período de
  // ciclo fiscal (26→25) aplicado a um filtro que deveria ser mês cheio (01 a 30).
  function selecionarModoData(modo) {
    if (modo === modoData) return;
    setModoData(modo);
    setPeriodo(MODOS_DATA.find((m) => m.value === modo).calcularPeriodo());
    if (modo !== "criacao") setResumoRapido({ status: "idle", dados: null, error: null });
  }

  const [comparando, setComparando] = useState(false);
```

- [ ] **Step 4: `carregarResumoRapido` sai cedo fora do modo criação**

Em `carregarResumoRapido` (linha 47), acrescente a guarda logo no início:

```js
  async function carregarResumoRapido(forceRefresh = false) {
    if (modoData !== "criacao") return;
    setResumoRapido((s) => ({ ...s, status: "loading" }));
```

- [ ] **Step 5: `load` passa `modoData` pro backend**

Em `load` (linhas 63-71), troque a chamada de `fetchOrcamento`:

```js
  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchOrcamento({
        forceRefresh,
        especialidade: aba,
        modoData,
        ...periodo,
        q: busca || undefined,
        uf: uf || undefined,
      });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }
```

- [ ] **Step 6: `modoData` entra nas dependências do `useEffect` principal**

Linhas 73-77, troque:

```js
  useEffect(() => {
    carregarResumoRapido();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, periodo.dataInicio, periodo.dataFim, busca, uf]);
```

por:

```js
  useEffect(() => {
    carregarResumoRapido();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, modoData, periodo.dataInicio, periodo.dataFim, busca, uf]);
```

- [ ] **Step 7: JSX — minicards + `DateFilterBar` com `modo` + aviso nos modos novos**

Troque (linhas 116-129):

```jsx
  return (
    <div>
      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button
          className="refresh-btn"
          onClick={() => {
            carregarResumoRapido(true);
            load(true);
          }}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>
```

por:

```jsx
  return (
    <div>
      <section className="stat-grid">
        {MODOS_DATA.map((m) => (
          <StatTile
            key={m.value}
            value={m.label}
            statusClass={modoData === m.value ? "status-good" : undefined}
            onClick={() => selecionarModoData(m.value)}
          />
        ))}
      </section>

      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} modo={modoData} />
        <button
          className="refresh-btn"
          onClick={() => {
            carregarResumoRapido(true);
            load(true);
          }}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      {modoData !== "criacao" && (
        <p className="subtitle" style={{ marginTop: -8, marginBottom: 12 }}>
          Filtrando por {modoData === "aprovacao" ? "mês de aprovação" : "mês em que o orçamento foi inserido"} — a busca
          inicial pode levar mais tempo (procura também chamados criados um pouco antes do período).
        </p>
      )}
```

- [ ] **Step 8: `npm run build` limpo**

```bash
cd frontend && npm run build
```
Esperado: build passa sem erro (sem warning novo de import não usado, prop faltando etc).

- [ ] **Step 9: Verificação manual completa**

Com `npm run dev` rodando, abra a tela de Orçamento:

1. Confirme que os 3 minicards aparecem acima do dropdown de período, com "Criação" já ativo (destacado em verde) por padrão.
2. Clique em "Aprovação" — confirme que: o dropdown de mês passa a mostrar "Mês (01 ao fim)" com o mês atual selecionado (mês cheio, não o ciclo 26→25 de antes); o resumo rápido ("N chamados no período...") desaparece; o aviso de busca ampliada aparece; o loading demora mais que no modo Criação; ao terminar, os cards Aguardando/Aprovados/Reprovados mostram valores plausivelmente diferentes dos do modo Criação no mesmo mês.
3. Clique em "Orçamento inserido" — mesmo comportamento do item 2, mas os valores retornados devem ser (em geral) diferentes dos de "Aprovação", já que são datas diferentes.
4. Volte pra "Criação" — confirme que o resumo rápido volta a aparecer, o dropdown volta a mostrar "Mês fiscal (26 a 25)", e os valores voltam a bater exatamente com o que a tela mostrava antes de qualquer uma dessas mudanças (mesmo período fiscal, mesmo total).
5. Com "Aprovação" ativo, teste os botões "Hoje"/"Ontem"/"Personalizado" — devem continuar funcionando (filtrando por aprovação nesse dia/intervalo).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/Orcamento.jsx
git commit -m "feat: minicards de modo (Criação/Aprovação/Orçamento inserido) na tela de Orçamento"
```

---

## Self-Review

**Cobertura da spec:**
- Extração de `dataDecisao` (evento de decisão, separado de `dataAprovacao`/inserção) → Task 1.
- `filtrarPorDataHistorico` + `ampliarParaTras` (janela de 3 meses) → Task 2.
- Rota `/orcamento` com `modoData`, resumo rápido sem o parâmetro → Task 3.
- Mês calendário cheio (01 ao fim) só nos modos novos, mês fiscal intacto no modo criação → Tasks 4 e 5.
- Minicards clicáveis, reset de período ao trocar modo, resumo rápido escondido fora de "criacao" → Task 6.
- Zero regressão no modo "criacao" → garantido pela guarda `modoData === "criacao" ? candidatos : ...` (Task 3) e pelo default `modo = "criacao"` em `DateFilterBar` (Task 5).

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todos os steps têm código completo ou comando+resultado esperado.

**Consistência de tipos/nomes:** `dataDecisao` (Task 1) usado exatamente com esse nome em `CAMPO_HISTORICO_POR_MODO` (Task 3); `modoData` usado com os mesmos 3 valores literais (`"criacao"`/`"aprovacao"`/`"insercao"`) em Tasks 3, 5 e 6; `periodoMesCalendario`/`nomeMesCalendario`/`listaMesesCalendario` (Task 4) chamadas com as mesmas assinaturas em Tasks 5 e 6. Sem divergência encontrada.
