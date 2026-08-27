# Orçamento por loja (Loja → Especialidade → Categoria → Equipamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dentro do painel "Orçamento por região" já existente na tela de Orçamento, trocar o comportamento de clicar numa loja — em vez de abrir a lista de chamados direto, abre uma navegação em pilha (Especialidade → Categoria de custo → Equipamento, esse último só em Manutenção) mostrando aprovado/pendente/reprovado em cada nível, chegando na lista de chamados de verdade só no fim.

**Architecture:** Backend ganha uma função pura nova (`buildPorLojaOrcamento`) que agrega os chamados já carregados em 3-4 níveis aninhados (loja → especialidade → categoria → equipamento) com os mesmos 3 buckets financeiros (aprovado/pendente/reprovado) que o resto do Orçamento já usa; o campo novo (`porLoja`) entra no payload de `/api/orcamento` sem exigir rota nova. No frontend, 3 telas novas de navegação (dados já vêm prontos no payload, sem fetch) reaproveitam o componente `RankingTable` que já existe (mesmo usado em Equipamentos por Ic pra mostrar as 3 colunas de custo); só o último clique de cada ramo dispara uma busca de verdade em `/api/chamados` (que já suporta os filtros necessários, sem mudança nenhuma nele).

**Tech Stack:** Node 20 + Express (backend), `node --test` (testes backend), React 18 + Vite (frontend, sem framework de teste — verificação via `npm run build` + `curl`).

## Global Constraints

- Reprovado nunca entra em nenhuma soma de "custo real" (aprovado + pendente) — fica visível, mas fora do total usado pra ordenar/comparar. Mesmo racional já usado em `buildOrcamento` e `icsEquipamento.js`.
- Engenharia não tem conceito de "equipamento": sua categoria (`tipoAtividade`) já é o nível mais fino — clicar numa categoria de Engenharia vai direto pros chamados, sem nível de equipamento.
- Nenhuma rota nova e nenhum filtro novo em `/api/chamados` — os filtros que já existem (`equipamento`, `tipoAtividade`, `cliente`, `uf`, `especialidade`, `statusAprovacao`) cobrem tudo que esta feature precisa.
- `porCliente` (campo já existente no payload de `/api/orcamento`) não muda e não sai do payload — só deixa de ser o que `RegiaoOrcamentoPanel` usa pro ranking de loja.

---

### Task 1: `buildPorLojaOrcamento` no backend (TDD)

**Files:**
- Modify: `backend/src/services/orcamento.js`
- Test: `backend/src/services/orcamento.test.js`

**Interfaces:**
- Consumes: `grupoDoEquipamento(equipamento, config)` e `lerConfiguracaoEquipamentos()`, ambos já exportados por `backend/src/services/configuracaoEquipamentos.js`; `foiReprovado(chamado)`, `valorDe`, `arredondar`, já existentes em `orcamento.js`.
- Produces: `export function buildPorLojaOrcamento(chamados, historicoMap, equipConfig = lerConfiguracaoEquipamentos())` → retorna um array de nós `{ cliente, uf, aprovado: {total, valor}, pendente: {total, valor}, reprovado: {total, valor}, porEspecialidade: [ { especialidade, aprovado, pendente, reprovado, porCategoria: [ { categoria, aprovado, pendente, reprovado, porEquipamento?: [ { equipamento, aprovado, pendente, reprovado } ] } ] } ] }`, ordenado (em todo nível) por `aprovado.valor + pendente.valor` decrescente. `porEquipamento` só existe quando `especialidade === "Manutenção"`. Usado pela Task 2 (via `buildOrcamento`'s campo `porLoja`).

- [ ] **Step 1: Escrever os testes que falham**

Abra `backend/src/services/orcamento.test.js` e adicione ao final do arquivo (mantendo o `import` do topo — vamos ajustá-lo no próximo passo):

```js
const CONFIG_TESTE = {
  grupos: ["Movimentação", "Refrigeração"],
  atribuicoes: { "empilhadeira": "Movimentação", "camara de resfriado": "Refrigeração" },
};

test("buildPorLojaOrcamento agrupa loja > especialidade > categoria > equipamento e separa aprovado/pendente/reprovado", () => {
  const chamados = [
    { Chave: 1, NomeStatus: "Resolvido", especialidade: "Manutenção", equipamento: "Empilhadeira", cliente: "Loja A", uf: "SP" },
    { Chave: 2, NomeStatus: "Aguardando Aprovação", especialidade: "Manutenção", equipamento: "Empilhadeira", cliente: "Loja A", uf: "SP" },
    { Chave: 3, NomeStatus: "Orçamento Reprovado", especialidade: "Manutenção", equipamento: "Camara de Resfriado", cliente: "Loja A", uf: "SP" },
    { Chave: 4, NomeStatus: "Resolvido", especialidade: "Engenharia", tipoAtividade: "Elétrica", cliente: "Loja A", uf: "SP" },
    { Chave: 5, NomeStatus: "Resolvido", especialidade: "Manutenção", equipamento: "Bebedouro", cliente: "Loja B", uf: "MG" },
  ];
  const historicoMap = new Map([
    [1, { passouPorAguardandoAprovacao: true, valorAprovacao: 100 }],
    [2, { passouPorAguardandoAprovacao: false, valorAprovacao: 50 }],
    [3, { passouPorAguardandoAprovacao: true, valorAprovacao: 300 }],
    [4, { passouPorAguardandoAprovacao: true, valorAprovacao: 400 }],
    [5, { passouPorAguardandoAprovacao: true, valorAprovacao: 10 }],
  ]);

  const resultado = buildPorLojaOrcamento(chamados, historicoMap, CONFIG_TESTE);

  // Loja A (aprovado 500 + pendente 50 = 550) vem antes de Loja B (aprovado 10) — reprovado
  // (300) não conta pro total usado na ordenação.
  assert.equal(resultado[0].cliente, "Loja A");
  assert.equal(resultado[0].uf, "SP");
  assert.deepEqual(resultado[0].aprovado, { total: 2, valor: 500 });
  assert.deepEqual(resultado[0].pendente, { total: 1, valor: 50 });
  assert.deepEqual(resultado[0].reprovado, { total: 1, valor: 300 });

  const manutencaoA = resultado[0].porEspecialidade.find((e) => e.especialidade === "Manutenção");
  assert.deepEqual(manutencaoA.aprovado, { total: 1, valor: 100 });
  assert.deepEqual(manutencaoA.pendente, { total: 1, valor: 50 });
  assert.deepEqual(manutencaoA.reprovado, { total: 1, valor: 300 });

  const movimentacao = manutencaoA.porCategoria.find((c) => c.categoria === "Movimentação");
  assert.deepEqual(movimentacao.aprovado, { total: 1, valor: 100 });
  assert.deepEqual(movimentacao.pendente, { total: 1, valor: 50 });
  assert.ok(Array.isArray(movimentacao.porEquipamento), "Manutenção deve ter porEquipamento");
  assert.equal(movimentacao.porEquipamento[0].equipamento, "Empilhadeira");
  assert.deepEqual(movimentacao.porEquipamento[0].aprovado, { total: 1, valor: 100 });
  assert.deepEqual(movimentacao.porEquipamento[0].pendente, { total: 1, valor: 50 });

  const refrigeracao = manutencaoA.porCategoria.find((c) => c.categoria === "Refrigeração");
  assert.deepEqual(refrigeracao.reprovado, { total: 1, valor: 300 });
  assert.deepEqual(refrigeracao.aprovado, { total: 0, valor: 0 });

  const engenhariaA = resultado[0].porEspecialidade.find((e) => e.especialidade === "Engenharia");
  assert.deepEqual(engenhariaA.aprovado, { total: 1, valor: 400 });
  const eletrica = engenhariaA.porCategoria.find((c) => c.categoria === "Elétrica");
  assert.equal(eletrica.porEquipamento, undefined, "Engenharia não deve ter porEquipamento");

  const lojaB = resultado.find((l) => l.cliente === "Loja B");
  const manutencaoB = lojaB.porEspecialidade[0];
  const naoClassificado = manutencaoB.porCategoria.find((c) => c.categoria === "Não classificado");
  assert.ok(naoClassificado, "equipamento sem grupo configurado (Bebedouro) cai em 'Não classificado'");
});

test("buildPorLojaOrcamento retorna array vazio pra lista de chamados vazia", () => {
  assert.deepEqual(buildPorLojaOrcamento([], new Map(), CONFIG_TESTE), []);
});
```

Ajuste a linha de import no topo do arquivo (linha 3) para incluir `buildPorLojaOrcamento`:

```js
import { buildResumoRapidoOrcamento, buildOrcamento, foiReprovado, buildPorLojaOrcamento } from "./orcamento.js";
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npm test`
Expected: FAIL — `buildPorLojaOrcamento is not a function` (ou `undefined`) nos dois testes novos. Os testes já existentes continuam passando.

- [ ] **Step 3: Implementar `buildPorLojaOrcamento` em `orcamento.js`**

No topo do arquivo `backend/src/services/orcamento.js`, adicione o import (antes da primeira linha existente):

```js
import { grupoDoEquipamento, lerConfiguracaoEquipamentos } from "./configuracaoEquipamentos.js";
```

Depois da função `buildResumoRapidoOrcamento` (e antes de `export function buildOrcamento`), adicione:

```js
function chaveCategoria(chamado, equipConfig) {
  if (chamado.especialidade === "Engenharia") return chamado.tipoAtividade || "Não classificado";
  return grupoDoEquipamento(chamado.equipamento, equipConfig);
}

function bucketVazio() {
  return { total: 0, valor: 0 };
}

function novoNo(camposExtra) {
  return { ...camposExtra, aprovado: bucketVazio(), pendente: bucketVazio(), reprovado: bucketVazio() };
}

function acumularBucket(no, bucket, chamado, historicoMap) {
  no[bucket].total += 1;
  no[bucket].valor += valorDe(historicoMap, chamado);
}

// Some do custo "real": aprovado + pendente. Reprovado fica de fora do total usado pra
// ordenar (mesmo racional de buildOrcamento/icsEquipamento — visível, mas não comprometido).
function totalNo(no) {
  return no.aprovado.valor + no.pendente.valor;
}

function arredondarNo(no) {
  return {
    ...no,
    aprovado: { ...no.aprovado, valor: arredondar(no.aprovado.valor) },
    pendente: { ...no.pendente, valor: arredondar(no.pendente.valor) },
    reprovado: { ...no.reprovado, valor: arredondar(no.reprovado.valor) },
  };
}

// Navegação Loja -> Especialidade -> Categoria de custo -> Equipamento (só Manutenção) usada
// pelo painel "Orçamento por região" — cada nível traz aprovado/pendente/reprovado separados
// (mesmo racional de icsEquipamento.js). Engenharia não tem "equipamento": sua categoria
// (tipoAtividade) já é o nível mais fino.
export function buildPorLojaOrcamento(chamados, historicoMap, equipConfig = lerConfiguracaoEquipamentos()) {
  const aguardando = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação");
  const avaliadosBrutos = chamados.filter(
    (c) => historicoMap.get(c.Chave)?.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação"
  );
  const aprovados = avaliadosBrutos.filter((c) => !foiReprovado(c));
  const reprovados = avaliadosBrutos.filter(foiReprovado);

  const lojas = new Map();

  function processar(lista, bucket) {
    for (const c of lista) {
      const cliente = c.cliente || "Não informado";
      const especialidade = c.especialidade || "Não informado";
      const categoria = chaveCategoria(c, equipConfig);

      const noLoja = lojas.get(cliente) ?? novoNo({ cliente, uf: c.uf || null, porEspecialidade: new Map() });
      lojas.set(cliente, noLoja);
      acumularBucket(noLoja, bucket, c, historicoMap);

      const noEsp = noLoja.porEspecialidade.get(especialidade) ?? novoNo({ especialidade, porCategoria: new Map() });
      noLoja.porEspecialidade.set(especialidade, noEsp);
      acumularBucket(noEsp, bucket, c, historicoMap);

      const noCat = noEsp.porCategoria.get(categoria) ?? novoNo({ categoria });
      noEsp.porCategoria.set(categoria, noCat);
      acumularBucket(noCat, bucket, c, historicoMap);

      if (especialidade === "Manutenção") {
        const equipamento = c.equipamento || "Não informado";
        noCat.porEquipamento = noCat.porEquipamento ?? new Map();
        const noEquip = noCat.porEquipamento.get(equipamento) ?? novoNo({ equipamento });
        noCat.porEquipamento.set(equipamento, noEquip);
        acumularBucket(noEquip, bucket, c, historicoMap);
      }
    }
  }

  processar(aguardando, "pendente");
  processar(aprovados, "aprovado");
  processar(reprovados, "reprovado");

  return [...lojas.values()]
    .map((loja) => ({
      ...arredondarNo(loja),
      porEspecialidade: [...loja.porEspecialidade.values()]
        .map((esp) => ({
          ...arredondarNo(esp),
          porCategoria: [...esp.porCategoria.values()]
            .map((cat) => ({
              ...arredondarNo(cat),
              ...(cat.porEquipamento
                ? { porEquipamento: [...cat.porEquipamento.values()].map(arredondarNo).sort((a, b) => totalNo(b) - totalNo(a)) }
                : {}),
            }))
            .sort((a, b) => totalNo(b) - totalNo(a)),
        }))
        .sort((a, b) => totalNo(b) - totalNo(a)),
    }))
    .sort((a, b) => totalNo(b) - totalNo(a));
}
```

Por fim, dentro de `export function buildOrcamento(chamados, historicoMap) { ... }`, adicione uma linha no objeto retornado (logo depois de `historicoAprovacoes: buildHistoricoAprovacoes(avaliados, historicoMap),`):

```js
    historicoAprovacoes: buildHistoricoAprovacoes(avaliados, historicoMap),
    porLoja: buildPorLojaOrcamento(chamados, historicoMap),
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npm test`
Expected: PASS em todos os testes (os 2 novos + todos os que já existiam antes, incluindo os de `buildOrcamento`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/orcamento.js backend/src/services/orcamento.test.js
git commit -m "feat: adiciona buildPorLojaOrcamento (navegação loja>especialidade>categoria>equipamento)"
```

---

### Task 2: Backend expõe `porLoja` de verdade + frontend troca `porCliente` por `porLoja` no painel de região

**Files:**
- Modify: `frontend/src/components/RegiaoOrcamentoPanel.jsx`
- Modify: `frontend/src/pages/Orcamento.jsx`

**Interfaces:**
- Consumes: `payload.porLoja` (do `GET /api/orcamento`, já populado pela Task 1 — cada item tem `{ cliente, uf, aprovado: {valor}, pendente: {valor}, porEspecialidade }`).
- Produces: `RegiaoOrcamentoPanel` agora aceita prop `porLoja` (no lugar de `porCliente`) e monta `clientesDaRegiao` com um campo a mais, `porEspecialidade`, usado pela Task 3.

- [ ] **Step 1: Trocar a prop em `RegiaoOrcamentoPanel.jsx`**

Em `frontend/src/components/RegiaoOrcamentoPanel.jsx`, troque:

```jsx
export function RegiaoOrcamentoPanel({ porUf, porCliente, filtroBase }) {
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);
  const regioes = (porUf ?? []).filter((u) => u.uf !== "Não informado");
  if (regioes.length === 0) return null;

  const clientesDaRegiao = regiaoSelecionada
    ? (porCliente ?? [])
        .filter((c) => c.uf === regiaoSelecionada)
        .map((c) => ({ label: c.cliente, total: c.aguardandoValor + c.avaliadosValor }))
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total)
    : [];
```

por:

```jsx
export function RegiaoOrcamentoPanel({ porUf, porLoja, filtroBase }) {
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);
  const regioes = (porUf ?? []).filter((u) => u.uf !== "Não informado");
  if (regioes.length === 0) return null;

  const clientesDaRegiao = regiaoSelecionada
    ? (porLoja ?? [])
        .filter((l) => l.uf === regiaoSelecionada)
        .map((l) => ({ label: l.cliente, total: l.aprovado.valor + l.pendente.valor, porEspecialidade: l.porEspecialidade }))
        .filter((l) => l.total > 0)
        .sort((a, b) => b.total - a.total)
    : [];
```

O resto do arquivo (cards de UF, `MaximizableChart` de "Custo por unidade") não muda.

- [ ] **Step 2: Trocar a prop no chamador (`Orcamento.jsx`)**

Em `frontend/src/pages/Orcamento.jsx`, troque:

```jsx
          <RegiaoOrcamentoPanel porUf={payload.porUf} porCliente={payload.porCliente} filtroBase={filtroBase} />
```

por:

```jsx
          <RegiaoOrcamentoPanel porUf={payload.porUf} porLoja={payload.porLoja} filtroBase={filtroBase} />
```

- [ ] **Step 3: Build e verificação com dado real**

Run: `cd frontend && npm run build`
Expected: build limpo (sem erro de sintaxe/import).

Com o backend rodando (`http://localhost:3001`), confirme que o campo `porLoja` chega populado e com a árvore completa:

Run:
```bash
curl -s "http://localhost:3001/api/orcamento?dataInicio=2020-01-01&dataFim=2026-12-31" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  console.log('total lojas em porLoja:', j.porLoja.length);
  const primeira = j.porLoja[0];
  console.log('primeira loja:', primeira.cliente, primeira.uf, primeira.aprovado, primeira.pendente, primeira.reprovado);
  console.log('especialidades:', primeira.porEspecialidade.map(e => e.especialidade));
});
"
```
Expected: `total lojas em porLoja` maior que 0, e a primeira loja tem `porEspecialidade` com pelo menos "Manutenção" e/ou "Engenharia".

Nesse ponto, clicar numa loja na tela ainda abre a lista de chamados direto (comportamento antigo) — a Task 3 é que muda esse clique. Isso é esperado e não quebra nada.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RegiaoOrcamentoPanel.jsx frontend/src/pages/Orcamento.jsx
git commit -m "feat: RegiaoOrcamentoPanel usa porLoja (com árvore de especialidade) no lugar de porCliente"
```

---

### Task 3: `useDrillDown` ganha os 3 níveis novos + `MaximizableChart` passa a abri-los

**Files:**
- Modify: `frontend/src/lib/useDrillDown.js`
- Modify: `frontend/src/components/MaximizableChart.jsx`

**Interfaces:**
- Consumes: nada de tasks anteriores diretamente (usa a prop `entry.porEspecialidade` já presente nos dados desde a Task 2).
- Produces: `useDrillDown()` passa a expor `abrirResumoLojaOrcamento(porEspecialidade, titulo, filtroBase)`, `abrirResumoCategoriaOrcamento(porCategoria, titulo, filtroBase)`, `abrirResumoEquipamentoOrcamento(porEquipamento, titulo, filtroBase)` — cada uma empilha `{ tipo: "resumoLojaOrcamento" | "resumoCategoriaOrcamento" | "resumoEquipamentoOrcamento", ...dados, titulo, filtroBase }`. `MaximizableChart` passa a chamar `drill.abrirResumoLojaOrcamento` quando o item clicado tem `porEspecialidade`, e conecta `onAbrirResumoCategoria`/`onAbrirResumoEquipamento` no `<DrillDownContent>` (consumidos pela Task 4).

- [ ] **Step 1: Adicionar as 3 funções em `useDrillDown.js`**

Em `frontend/src/lib/useDrillDown.js`, logo depois da função `abrirSubRanking` (antes de `function abrirChamado`), adicione:

```js
  // Resumo de orçamento por loja (Manutenção x Engenharia) — dado já pronto no payload de
  // /orcamento, sem fetch. filtroBase carrega cliente/uf/período/statusAprovacao já herdados
  // do clique anterior, pra a lista de chamados no fim nunca vazar loja errada.
  function abrirResumoLojaOrcamento(porEspecialidade, titulo, filtroBase) {
    setPilha((p) => [...(p ?? []), { tipo: "resumoLojaOrcamento", porEspecialidade, titulo, filtroBase }]);
  }

  // Resumo por categoria de custo (grupo de equipamento em Manutenção, tipoAtividade em
  // Engenharia) dentro de uma especialidade de uma loja — mesmo racional, sem fetch.
  function abrirResumoCategoriaOrcamento(porCategoria, titulo, filtroBase) {
    setPilha((p) => [...(p ?? []), { tipo: "resumoCategoriaOrcamento", porCategoria, titulo, filtroBase }]);
  }

  // Resumo por equipamento individual dentro de uma categoria — só existe pra Manutenção.
  function abrirResumoEquipamentoOrcamento(porEquipamento, titulo, filtroBase) {
    setPilha((p) => [...(p ?? []), { tipo: "resumoEquipamentoOrcamento", porEquipamento, titulo, filtroBase }]);
  }
```

E no `return` do hook, adicione as 3 novas funções à lista já existente:

```js
  return {
    pilha,
    topo,
    abrir,
    abrirLista,
    abrirResumoCliente,
    abrirNivelDetalhe,
    abrirResumoBacklog,
    abrirListaEmpilhada,
    abrirSubRanking,
    abrirResumoLojaOrcamento,
    abrirResumoCategoriaOrcamento,
    abrirResumoEquipamentoOrcamento,
    abrirChamado,
    voltar,
    fechar,
  };
```

- [ ] **Step 2: Adicionar o branch em `MaximizableChart.jsx`**

Em `frontend/src/components/MaximizableChart.jsx`, dentro da função `selecionar`, troque:

```js
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
                } else if (resumoPorCliente) {
                  drill.abrirResumoCliente({ ...filtroBase, cliente: label }, label);
                } else {
                  drill.abrirLista({ ...filtroBase, [dimensaoFiltro]: label }, label, fetcher);
                }
              };
```

por:

```js
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
```

- [ ] **Step 3: Conectar as 2 novas props no `<DrillDownContent>`**

No mesmo arquivo, troque:

```jsx
          <DrillDownContent
            topo={drill.topo}
            onAbrirChamado={drill.abrirChamado}
            onAbrirLista={(filtros, titulo) => drill.abrirListaEmpilhada(filtros, titulo, fetcher)}
          />
```

por:

```jsx
          <DrillDownContent
            topo={drill.topo}
            onAbrirChamado={drill.abrirChamado}
            onAbrirLista={(filtros, titulo) => drill.abrirListaEmpilhada(filtros, titulo, fetcher)}
            onAbrirResumoCategoria={drill.abrirResumoCategoriaOrcamento}
            onAbrirResumoEquipamento={drill.abrirResumoEquipamentoOrcamento}
          />
```

Essa conexão é feita uma vez só, dentro de `MaximizableChart.jsx` — como esse componente é reaproveitado em várias telas (Manutenção, Engenharia, Orçamento, e o painel de região), as duas props novas ficam disponíveis em todo lugar, mas só são realmente chamadas quando `topo.tipo` vira `resumoLojaOrcamento`/`resumoCategoriaOrcamento` — o que só acontece a partir do clique numa loja dentro de `RegiaoOrcamentoPanel` (única tela cujos dados têm `entry.porEspecialidade`).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build limpo. Nesse ponto, clicar numa loja já abre uma tela vazia (o `DrillDownContent` ainda não sabe renderizar `resumoLojaOrcamento` — isso é esperado, a Task 4 completa a renderização). Não é preciso testar manualmente agora.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useDrillDown.js frontend/src/components/MaximizableChart.jsx
git commit -m "feat: useDrillDown ganha níveis de orçamento por loja/categoria/equipamento"
```

---

### Task 4: `DrillDownContent` renderiza os 3 níveis novos (completa a feature)

**Files:**
- Modify: `frontend/src/components/DrillDownContent.jsx`

**Interfaces:**
- Consumes: `topo.tipo === "resumoLojaOrcamento" | "resumoCategoriaOrcamento" | "resumoEquipamentoOrcamento"` (empilhados pela Task 3); props `onAbrirResumoCategoria`, `onAbrirResumoEquipamento` (conectadas na Task 3, dentro de `MaximizableChart.jsx`); `onAbrirLista` (já existia). Componente `RankingTable` de `frontend/src/components/RankingTable.jsx` (já existe, usado hoje em `EquipamentosPorIc.jsx` com o mesmo padrão de `colunasExtras` pra aprovado/pendente/reprovado).
- Produces: navegação completa e visível na tela.

- [ ] **Step 1: Importar `RankingTable` e declarar os helpers locais**

Em `frontend/src/components/DrillDownContent.jsx`, troque o bloco de imports:

```jsx
import { ChamadosList } from "./ChamadosList.jsx";
import { ChamadoDetalhe } from "./ChamadoDetalhe.jsx";
import { ClienteResumoTable } from "./ClienteResumoTable.jsx";
import { BacklogResumoTable } from "./BacklogResumoTable.jsx";
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { NivelDetalhePanel } from "./NivelDetalhePanel.jsx";

export function DrillDownContent({ topo, onAbrirChamado, onAbrirLista }) {
```

por:

```jsx
import { ChamadosList } from "./ChamadosList.jsx";
import { ChamadoDetalhe } from "./ChamadoDetalhe.jsx";
import { ClienteResumoTable } from "./ClienteResumoTable.jsx";
import { BacklogResumoTable } from "./BacklogResumoTable.jsx";
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { NivelDetalhePanel } from "./NivelDetalhePanel.jsx";
import { RankingTable } from "./RankingTable.jsx";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLUNAS_ORCAMENTO = [
  { header: "Aprovado", render: (d) => formatBRL(d.aprovadoValor), sortKeyName: "aprovadoValor" },
  { header: "Pendente", render: (d) => formatBRL(d.pendenteValor), sortKeyName: "pendenteValor" },
  { header: "Reprovado", render: (d) => (d.reprovadoValor > 0 ? formatBRL(d.reprovadoValor) : "—"), sortKeyName: "reprovadoValor" },
];

// Achata um nó {aprovado:{valor}, pendente:{valor}, reprovado:{valor}} do payload de
// buildPorLojaOrcamento pro formato flat que RankingTable/colunasExtras esperam.
function linhaOrcamento(no, label) {
  return {
    label,
    total: no.aprovado.valor + no.pendente.valor,
    aprovadoValor: no.aprovado.valor,
    pendenteValor: no.pendente.valor,
    reprovadoValor: no.reprovado.valor,
  };
}

export function DrillDownContent({ topo, onAbrirChamado, onAbrirLista, onAbrirResumoCategoria, onAbrirResumoEquipamento }) {
```

- [ ] **Step 2: Adicionar os 3 blocos de renderização**

No mesmo arquivo, logo depois do bloco `if (topo?.tipo === "subRanking") { ... }` (antes de `if (topo?.tipo === "nivelDetalhe")`), adicione:

```jsx
  // Orçamento por loja: 1º nível — Especialidade (Manutenção/Engenharia) de uma loja. Dado já
  // pronto no payload de /orcamento (ver buildPorLojaOrcamento), sem fetch.
  if (topo?.tipo === "resumoLojaOrcamento") {
    const linhas = topo.porEspecialidade.map((e) => ({ ...linhaOrcamento(e, e.especialidade), porCategoria: e.porCategoria }));
    return (
      <RankingTable
        data={linhas}
        nomeColuna="Especialidade"
        formatValue={formatBRL}
        colunasExtras={COLUNAS_ORCAMENTO}
        onSelecionar={(_label, _agregado, linha) =>
          onAbrirResumoCategoria(linha.porCategoria, `${topo.titulo} — ${linha.label}`, { ...topo.filtroBase, especialidade: linha.label })
        }
      />
    );
  }

  // Orçamento por loja: 2º nível — Categoria de custo dentro de uma especialidade. Se a
  // categoria tiver porEquipamento (só Manutenção), desce mais um nível; senão (Engenharia,
  // tipoAtividade já é o mais fino) vai direto pra lista de chamados.
  if (topo?.tipo === "resumoCategoriaOrcamento") {
    const linhas = topo.porCategoria.map((c) => ({ ...linhaOrcamento(c, c.categoria), porEquipamento: c.porEquipamento }));
    return (
      <RankingTable
        data={linhas}
        nomeColuna="Categoria de custo"
        formatValue={formatBRL}
        colunasExtras={COLUNAS_ORCAMENTO}
        onSelecionar={(_label, _agregado, linha) =>
          linha.porEquipamento
            ? onAbrirResumoEquipamento(linha.porEquipamento, `${topo.titulo} — ${linha.label}`, topo.filtroBase)
            : onAbrirLista({ ...topo.filtroBase, tipoAtividade: linha.label }, linha.label)
        }
      />
    );
  }

  // Orçamento por loja: 3º nível (só Manutenção) — Equipamento individual. Clicar abre a
  // lista de chamados de verdade (GET /api/chamados).
  if (topo?.tipo === "resumoEquipamentoOrcamento") {
    const linhas = topo.porEquipamento.map((e) => linhaOrcamento(e, e.equipamento));
    return (
      <RankingTable
        data={linhas}
        nomeColuna="Equipamento"
        formatValue={formatBRL}
        colunasExtras={COLUNAS_ORCAMENTO}
        onSelecionar={(label) => onAbrirLista({ ...topo.filtroBase, equipamento: label }, label)}
      />
    );
  }

```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 4: Verificação end-to-end com dado real (curl simulando a navegação completa)**

Com o backend rodando, simule os 3 cliques em sequência via curl, usando uma loja/UF reais do seu ambiente (troque `SEU_UF`/`SUA_LOJA` pelos valores que aparecerem no primeiro comando):

```bash
# 1. Pegar uma loja real com custo em Manutenção (pra testar o caminho com equipamento)
curl -s "http://localhost:3001/api/orcamento?dataInicio=2020-01-01&dataFim=2026-12-31" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  const loja = j.porLoja.find(l => l.porEspecialidade.some(e => e.especialidade === 'Manutenção' && e.porCategoria.some(c => c.porEquipamento?.length)));
  const esp = loja.porEspecialidade.find(e => e.especialidade === 'Manutenção');
  const cat = esp.porCategoria.find(c => c.porEquipamento?.length);
  const equip = cat.porEquipamento[0];
  console.log('loja:', loja.cliente, loja.uf);
  console.log('categoria:', cat.categoria);
  console.log('equipamento:', equip.equipamento);
});
"

# 2. Confirmar que /api/chamados aceita o filtro final (equipamento) e retorna algo coerente —
#    troque EQUIPAMENTO pelo valor impresso acima
curl -s "http://localhost:3001/api/chamados?dataInicio=2020-01-01&dataFim=2026-12-31&equipamento=EQUIPAMENTO" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  console.log('total chamados desse equipamento:', j.total);
});
"
```

Expected: o segundo `curl` retorna `total` maior que 0, confirmando que o filtro final (`equipamento`) — o mesmo que a tela vai usar no último clique — realmente funciona contra dados reais.

Como o modo automático deste ambiente evita clicar na sua janela real do navegador, essa verificação por API é o que garante que a cadeia de dados está certa; a navegação visual (cliques de verdade) fica pra você conferir com `npm run dev` quando quiser.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DrillDownContent.jsx
git commit -m "feat: DrillDownContent renderiza especialidade/categoria/equipamento do orçamento por loja"
```

---

## Verificação final (depois das 4 tasks)

- [ ] `cd backend && npm test` — todos os testes passam (os novos de `buildPorLojaOrcamento` + todos os que já existiam).
- [ ] `cd frontend && npm run build` — build limpo.
- [ ] Abrir a tela de Orçamento (`npm run dev`), ir em "Orçamento por região", clicar numa UF, clicar numa loja, confirmar que abre Especialidade → Categoria → (Equipamento, se Manutenção) → lista de chamados, com "Voltar" funcionando em cada nível.
