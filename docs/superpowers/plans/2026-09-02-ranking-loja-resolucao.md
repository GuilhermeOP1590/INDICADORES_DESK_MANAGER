# Ranking loja a loja no card "% de resolução médio" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao clicar no card "% de resolução médio" (Dashboard e Performance), abrir um ranking loja a loja em vez da lista plana de todos os chamados do período, com clique numa loja abrindo o detalhe dos chamados dela.

**Architecture:** Reaproveita `ClientesTable.jsx` (já usada hoje em Performance.jsx, já com tabela ordenável + % de resolução + clique-abre-chamados via seu próprio `useDrillDown`/`Modal` internos) dentro de um novo modal controlado por estado local em `ClientePerformancePanel.jsx`. Nenhum drill-type novo em `useDrillDown.js`/`DrillDownContent.jsx`, nenhuma mudança de backend — `percentualResolucao` por cliente já vem pronto no payload de `/indicadores`.

**Tech Stack:** React 18 + Vite (frontend only, essa feature não toca o backend). Sem framework de teste no frontend — verificação manual via `npm run build` + clique guiado (convenção já existente no projeto).

## Global Constraints

- **Sem mudança de backend** — `percentualResolucao` por cliente já existe pronto (`buildPorCliente`, `backend/src/services/indicadores.js`).
- **Sem drill-type novo** em `useDrillDown.js`/`DrillDownContent.jsx` — a solução usa um `Modal` local em `ClientePerformancePanel`, não o mecanismo genérico de drill-down compartilhado.
- Ranking inclui **todas** as lojas com pelo menos 1 chamado no período — sem mínimo de amostra.
- Comportamento igual nas **duas telas** que usam `ClientePerformancePanel` (Dashboard e Performance).
- Card **"Clientes ativos no período"** (outro StatTile do mesmo painel) não muda — continua abrindo a lista plana via `onAbrirGeral`.
- No Dashboard, o clique numa loja do ranking precisa usar `fetchDashboardChamados` (não o endpoint genérico) — esse endpoint filtra só Manutenção/Engenharia e exclui o cliente fictício "APROVADORES"; usar o padrão genérico arriscaria mostrar chamados a mais.

---

## File Structure

- Modify `frontend/src/components/ClientesTable.jsx` — ganha prop opcional `fetcher`, repassada pro `drill.abrirLista` interno.
- Modify `frontend/src/components/ClientePerformancePanel.jsx` — ganha props `filtroBase`/`fetcher`, estado local `verRanking`, e o card "% de resolução médio" abre um `Modal` com `ClientesTable` em vez de chamar `onAbrirGeral`.
- Modify `frontend/src/pages/Dashboard.jsx` — passa `filtroBase`/`fetcher={fetchDashboardChamados}` novos pro `ClientePerformancePanel`.
- Modify `frontend/src/pages/Performance.jsx` — passa `filtroBase` novo pro `ClientePerformancePanel` (sem `fetcher` — mantém o endpoint genérico já usado nessa tela).

---

### Task 1: `ClientesTable` aceita um fetcher customizado

**Files:**
- Modify: `frontend/src/components/ClientesTable.jsx`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `<ClientesTable data={...} filtroBase={...} fetcher={...} />` — prop `fetcher` nova, opcional, default `undefined` (comportamento idêntico ao de hoje quando omitida). Task 2 consome essa prop.

- [ ] **Step 1: Ler o arquivo atual pra confirmar que bate com o esperado**

Leia `frontend/src/components/ClientesTable.jsx` e confirme que a linha da assinatura do componente e a linha do `onClick` da `<tr>` são exatamente:

```jsx
export function ClientesTable({ data, filtroBase }) {
```

e

```jsx
              onClick={filtroBase ? () => drill.abrirLista({ ...filtroBase, cliente: c.cliente }, c.cliente) : undefined}
```

(Se o arquivo já tiver mudado e essas linhas não baterem exatamente, ajuste os steps seguintes pra mirar as linhas reais, mantendo a mesma mudança lógica: adicionar `fetcher` na assinatura e repassá-lo como 3º argumento de `drill.abrirLista`.)

- [ ] **Step 2: Adicionar a prop `fetcher`**

Troque:

```jsx
export function ClientesTable({ data, filtroBase }) {
```

por:

```jsx
export function ClientesTable({ data, filtroBase, fetcher }) {
```

E troque:

```jsx
              onClick={filtroBase ? () => drill.abrirLista({ ...filtroBase, cliente: c.cliente }, c.cliente) : undefined}
```

por:

```jsx
              onClick={filtroBase ? () => drill.abrirLista({ ...filtroBase, cliente: c.cliente }, c.cliente, fetcher) : undefined}
```

Nenhuma outra linha do arquivo muda.

- [ ] **Step 3: Build limpo**

```bash
cd frontend && npm run build
```
Esperado: build passa sem erro.

- [ ] **Step 4: Verificação manual — nenhuma regressão em Performance.jsx**

Suba o frontend (`npm run dev`) e o backend juntos, abra a tela Performance, role até "Ranking completo — clientes" e clique numa linha. Esperado: abre o modal de chamados daquela loja exatamente como já funcionava antes (`ClientesTable` é usada lá hoje sem passar `fetcher`, então o comportamento deve ser idêntico ao anterior a essa mudança — a prop nova, quando `undefined`, cai no mesmo fallback que `ChamadosList` já usa hoje).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ClientesTable.jsx
git commit -m "feat: ClientesTable aceita fetcher customizado pro clique em loja"
```

---

### Task 2: Modal de ranking no `ClientePerformancePanel`

**Files:**
- Modify: `frontend/src/components/ClientePerformancePanel.jsx`

**Interfaces:**
- Consumes: prop `fetcher` de `ClientesTable` (Task 1).
- Produces: `<ClientePerformancePanel porCliente={...} porUf={...} filtroBase={...} fetcher={...} onAbrirGeral={...} onAbrirCliente={...} />` — 2 props novas, `filtroBase` e `fetcher` (ambas opcionais na prática, mas devem ser passadas por quem usa o componente pra o ranking funcionar direito — Task 3 é quem passa). Card "% de resolução médio" não usa mais `onAbrirGeral`.

- [ ] **Step 1: Ler o arquivo atual pra confirmar as linhas**

Leia `frontend/src/components/ClientePerformancePanel.jsx` (76 linhas) e confirme que a linha 1 é `import { StatTile } from "./StatTile.jsx";`, a linha 6 é a assinatura do componente, e as linhas 35-51 são o bloco do `StatTile` de "% de resolução médio". Se algo não bater, ajuste os steps seguintes mirando as linhas reais, preservando a mesma mudança lógica.

- [ ] **Step 2: Imports e assinatura do componente**

Troque:

```jsx
import { StatTile } from "./StatTile.jsx";
```

por:

```jsx
import { useState } from "react";
import { StatTile } from "./StatTile.jsx";
import { Modal } from "./Modal.jsx";
import { ClientesTable } from "./ClientesTable.jsx";
```

Troque:

```jsx
export function ClientePerformancePanel({ porCliente, porUf, onAbrirGeral, onAbrirCliente }) {
  const clientes = (porCliente ?? []).filter((c) => c.cliente !== "Não informado");
  if (clientes.length === 0) return null;
```

por:

```jsx
export function ClientePerformancePanel({ porCliente, porUf, filtroBase, fetcher, onAbrirGeral, onAbrirCliente }) {
  const [verRanking, setVerRanking] = useState(false);
  const clientes = (porCliente ?? []).filter((c) => c.cliente !== "Não informado");
  if (clientes.length === 0) return null;
```

- [ ] **Step 3: Trocar o `onClick` do card "% de resolução médio"**

Troque:

```jsx
        <StatTile
          label="% de resolução médio"
          value={`${percentualMedio}%`}
          meta={
            resumoPorUf.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {resumoPorUf.map((u) => (
                  <span key={u.uf}>
                    {u.uf} {u.percentualResolucao}%
                  </span>
                ))}
              </div>
            ) : undefined
          }
          statusClass={percentualMedio >= 80 ? "status-good" : undefined}
          onClick={onAbrirGeral}
        />
```

por:

```jsx
        <StatTile
          label="% de resolução médio"
          value={`${percentualMedio}%`}
          meta={
            resumoPorUf.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {resumoPorUf.map((u) => (
                  <span key={u.uf}>
                    {u.uf} {u.percentualResolucao}%
                  </span>
                ))}
              </div>
            ) : undefined
          }
          statusClass={percentualMedio >= 80 ? "status-good" : undefined}
          onClick={() => setVerRanking(true)}
        />
```

(Note: o card "Clientes ativos no período", logo acima desse no JSX, continua com `onClick={onAbrirGeral}` sem nenhuma mudança — só o card de "% de resolução médio" troca.)

- [ ] **Step 4: Acrescentar o modal do ranking**

Troque o fechamento do componente:

```jsx
        <StatTile
          label="Pior % de resolução"
          value={piorResolucao ? piorResolucao.cliente : "—"}
          meta={piorResolucao ? `${piorResolucao.percentualResolucao}% (${piorResolucao.total} chamados)` : undefined}
          statusClass={piorResolucao && piorResolucao.percentualResolucao < 50 ? "status-warning" : undefined}
          onClick={piorResolucao && onAbrirCliente ? () => onAbrirCliente(piorResolucao.cliente) : undefined}
        />
      </section>
    </div>
  );
}
```

por:

```jsx
        <StatTile
          label="Pior % de resolução"
          value={piorResolucao ? piorResolucao.cliente : "—"}
          meta={piorResolucao ? `${piorResolucao.percentualResolucao}% (${piorResolucao.total} chamados)` : undefined}
          statusClass={piorResolucao && piorResolucao.percentualResolucao < 50 ? "status-warning" : undefined}
          onClick={piorResolucao && onAbrirCliente ? () => onAbrirCliente(piorResolucao.cliente) : undefined}
        />
      </section>

      {verRanking && (
        <Modal title="% de resolução por loja" onClose={() => setVerRanking(false)}>
          <ClientesTable data={clientes} filtroBase={filtroBase} fetcher={fetcher} />
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Build limpo**

```bash
cd frontend && npm run build
```
Esperado: build passa sem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ClientePerformancePanel.jsx
git commit -m "feat: card % de resolução médio abre ranking loja a loja em vez da lista plana"
```

---

### Task 3: Ligar nas duas telas (Dashboard e Performance)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/Performance.jsx`

**Interfaces:**
- Consumes: props `filtroBase`/`fetcher` de `ClientePerformancePanel` (Task 2).
- Produces: comportamento final visível nas duas telas — nenhuma outra task consome esta.

- [ ] **Step 1: Dashboard.jsx**

Em `frontend/src/pages/Dashboard.jsx`, localize o bloco (por volta da linha 250):

```jsx
          <ClientePerformancePanel
            porCliente={porCliente}
            porUf={porUf}
            onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período", fetchDashboardChamados)}
            onAbrirCliente={(cliente) => drill.abrirLista({ ...filtroBase, cliente }, cliente, fetchDashboardChamados)}
          />
```

Troque por (só acrescenta 2 linhas — `onAbrirGeral`/`onAbrirCliente` já passam `fetchDashboardChamados` hoje, não mexer nelas):

```jsx
          <ClientePerformancePanel
            porCliente={porCliente}
            porUf={porUf}
            filtroBase={filtroBase}
            fetcher={fetchDashboardChamados}
            onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período", fetchDashboardChamados)}
            onAbrirCliente={(cliente) => drill.abrirLista({ ...filtroBase, cliente }, cliente, fetchDashboardChamados)}
          />
```

- [ ] **Step 2: Performance.jsx**

Em `frontend/src/pages/Performance.jsx`, localize o bloco (por volta da linha 130):

```jsx
          <ClientePerformancePanel
            porCliente={porCliente}
            onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período")}
            onAbrirCliente={(cliente) => drill.abrirLista({ ...filtroBase, cliente }, cliente)}
          />
```

Troque por (só acrescenta `filtroBase` — sem `fetcher`, mantém o endpoint genérico já usado nessa tela):

```jsx
          <ClientePerformancePanel
            porCliente={porCliente}
            filtroBase={filtroBase}
            onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período")}
            onAbrirCliente={(cliente) => drill.abrirLista({ ...filtroBase, cliente }, cliente)}
          />
```

- [ ] **Step 3: Build limpo**

```bash
cd frontend && npm run build
```
Esperado: build passa sem erro.

- [ ] **Step 4: Verificação manual completa**

Suba backend (`cd backend && npm run dev`, porta padrão 3001 — confira `.env` se precisar) e frontend (`cd frontend && npm run dev`) juntos.

**Dashboard:**
1. Abra a tela, confirme que "Performance por cliente" aparece com os 5 cards de sempre.
2. Clique em "% de resolução médio" — esperado: abre um modal "% de resolução por loja" com uma tabela de TODAS as lojas do período (sem mínimo de 3 chamados), colunas Cliente/Total/Abertos/Fechados/% Resolução, ordenável e buscável.
3. Clique numa loja da tabela — esperado: abre outro modal com os chamados daquela loja (mesma lista/colunas de sempre — Código, Assunto, Status, etc). Confira que a contagem de chamados bate com o "Total" mostrado na linha da loja no passo anterior.
4. Feche tudo, clique em "Clientes ativos no período" — esperado: continua abrindo a lista plana "Total no período" de sempre, sem nenhuma mudança.

**Performance:**
5. Repita os passos 2-3 na tela Performance — mesmo comportamento (modal de ranking, depois modal de chamados da loja).
6. Role até "Ranking completo — clientes" (embaixo da página) e clique numa linha — esperado: continua funcionando exatamente como antes dessa mudança (mesma tabela, mesmo comportamento — essa tabela não faz parte do `ClientePerformancePanel`, é outra instância de `ClientesTable` já existente na página).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Performance.jsx
git commit -m "feat: liga o ranking loja a loja de % de resolução no Dashboard e Performance"
```

---

## Self-Review

**Cobertura da spec:**
- Reaproveitar `ClientesTable` em vez de criar drill-type novo → Tasks 1 e 2.
- Ranking com todas as lojas, sem mínimo de amostra → Task 2 (`clientes`, já sem filtro de `total >= 3`, reaproveitado como está).
- Funciona nas duas telas → Task 3.
- Correção do `fetcher` no Dashboard (evitar chamados de área errada / cliente fictício) → Task 1 (prop nova) + Task 3 (Dashboard recebe `fetchDashboardChamados`, Performance não).
- Card "Clientes ativos no período" sem mudança → explicitamente preservado no Step 3 da Task 2 (só o `onClick` do outro card muda).

**Correção em relação à spec:** a spec (`docs/superpowers/specs/2026-09-02-ranking-loja-resolucao-design.md`) menciona corrigir `onAbrirCliente` no Dashboard pra passar `fetchDashboardChamados` — ao reler o arquivo atual (Task 3, Step 1), essa linha **já** passa `fetchDashboardChamados` hoje (o parágrafo da spec estava desatualizado/impreciso nesse detalhe específico). O plano reflete o código real: Task 3 não mexe nas linhas de `onAbrirGeral`/`onAbrirCliente` do Dashboard, só acrescenta `filtroBase`/`fetcher`.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todos os steps têm código completo ou comando+resultado esperado.

**Consistência de tipos/nomes:** `fetcher` (Task 1) usado com o mesmo nome em `ClientePerformancePanel` (Task 2) e passado como `fetchDashboardChamados`/omitido em Task 3, igual nas 3 tasks. `filtroBase` idem. `verRanking`/`setVerRanking` só existem dentro da Task 2, sem uso externo — sem divergência.
