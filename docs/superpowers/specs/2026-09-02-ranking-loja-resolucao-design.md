# Ranking loja a loja no card "% de resolução médio" — design

## Contexto

O card "% de resolução médio", dentro de `ClientePerformancePanel.jsx`
(usado nas telas Dashboard e Performance), hoje abre a lista plana "Total
no período" ao ser clicado — todos os chamados do período, sem
agrupamento nenhum por loja. Pra entender qual loja está puxando a média
pra baixo (ou pra cima), o usuário precisa filtrar manualmente por
cliente na lista, chamado por chamado.

Pedido: ao clicar nesse card, ver primeiro um ranking loja a loja do %
de resolução, e só then clicar numa loja específica pra ver o detalhe dos
chamados dela.

Decisões tomadas em conversa:

- Vale nas duas telas (Dashboard e Performance) — mesmo componente, mesmo
  comportamento nas duas, evitando inconsistência.
- Ranking mostra **todas** as lojas com pelo menos 1 chamado no período,
  sem mínimo de amostra — a tabela já expõe Total/Abertos/Fechados ao
  lado do %, então uma loja com amostra baixa (ex: 100% de 1 chamado) fica
  visível pelo contexto, sem precisar escondê-la.
- **Sem mudança de backend** — `percentualResolucao` por cliente já vem
  pronto no payload de `/indicadores` (`buildPorCliente`,
  `backend/src/services/indicadores.js`), nenhum cálculo novo necessário.
- **Sem drill-type novo em `useDrillDown.js`/`DrillDownContent.jsx`** — o
  projeto já tem `ClientesTable.jsx`, usado hoje em Performance.jsx,
  fazendo exatamente "tabela ordenável com % de resolução, clique numa
  linha abre os chamados daquela loja" (com seu próprio `useDrillDown` e
  `Modal` internos). A solução reaproveita esse componente dentro de um
  modal simples aberto pelo próprio `ClientePerformancePanel`, em vez de
  estender o mecanismo genérico de drill-down compartilhado — menos
  código novo, e o componente reaproveitado já é testado em produção
  (Performance.jsx).
- Card "Clientes ativos no período" (outro StatTile do mesmo painel)
  **não muda** — continua abrindo a lista plana de todos os chamados via
  `onAbrirGeral`, que segue existindo pra esse caso.

**Ponto de correção descoberto durante a investigação**: o Dashboard usa
`fetchDashboardChamados` (`GET /api/dashboard/chamados`) pros seus outros
cards, que filtra só chamados de Manutenção/Engenharia e exclui o cliente
fictício interno "APROVADORES" — filtros que o endpoint genérico usado
por padrão em `ChamadosList` (`GET /api/chamados`, via
`fetchChamadosFiltrados`) não aplica. `ClientesTable` hoje não aceita um
fetcher customizado (nunca precisou, só é usada em Performance.jsx, que
já usa o endpoint genérico de propósito). Reaproveitá-la sem ajuste
dentro do Dashboard arriscaria mostrar chamados a mais ao clicar numa
loja (áreas fora de Manutenção/Engenharia, ou o cliente fictício). A
correção: `ClientesTable` ganha uma prop `fetcher` opcional, repassada
pro `drill.abrirLista` interno — no Dashboard ela recebe
`fetchDashboardChamados`; em Performance.jsx continua sem receber nada
(comportamento idêntico ao de hoje, já que hoje nenhuma chamada passa um
3º argumento pra esse `abrirLista`).

## Arquitetura

### `frontend/src/components/ClientesTable.jsx`

Ganha a prop `fetcher` (opcional, default `undefined` — mesmo
comportamento de hoje quando omitida), repassada pro `drill.abrirLista`:

```jsx
export function ClientesTable({ data, filtroBase, fetcher }) {
  const drill = useDrillDown();
  const { sorted, sortKey, sortDir, toggleSort } = useSort(data, "total", "desc");

  return (
    <>
      <table>
        {/* ...thead sem mudança... */}
        <tbody>
          {sorted.map((c) => (
            <tr
              key={c.cliente}
              className={filtroBase ? "clickable-row" : ""}
              onClick={filtroBase ? () => drill.abrirLista({ ...filtroBase, cliente: c.cliente }, c.cliente, fetcher) : undefined}
            >
              {/* ...células sem mudança... */}
            </tr>
          ))}
        </tbody>
      </table>

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}
    </>
  );
}
```

(Só a linha do `onClick` muda — acrescenta `fetcher` como 3º argumento de
`drill.abrirLista`. Resto do arquivo idêntico.)

### `frontend/src/components/ClientePerformancePanel.jsx`

Ganha 2 props novas (`filtroBase`, `fetcher`), estado local
`verRanking`, e o card "% de resolução médio" passa a abrir um modal com
`ClientesTable` em vez de chamar `onAbrirGeral`:

```jsx
import { useState } from "react";
import { StatTile } from "./StatTile.jsx";
import { Modal } from "./Modal.jsx";
import { ClientesTable } from "./ClientesTable.jsx";

export function ClientePerformancePanel({ porCliente, porUf, filtroBase, fetcher, onAbrirGeral, onAbrirCliente }) {
  const [verRanking, setVerRanking] = useState(false);
  const clientes = (porCliente ?? []).filter((c) => c.cliente !== "Não informado");
  if (clientes.length === 0) return null;

  // ...resumoPorUf, totalAvaliados, percentualMedio, destaqueVolume, comAmostra,
  // melhorResolucao, piorResolucao — tudo sem mudança...

  return (
    <div className="panel full-width">
      <h2>Performance por cliente</h2>
      <p className="subtitle">Resumo de demanda e resolução por cliente — clique num card pra ver os chamados</p>
      <section className="stat-grid">
        <StatTile label="Clientes ativos no período" value={clientes.length} onClick={onAbrirGeral} />
        <StatTile
          label="% de resolução médio"
          value={`${percentualMedio}%`}
          meta={/* ...sem mudança... */}
          statusClass={percentualMedio >= 80 ? "status-good" : undefined}
          onClick={() => setVerRanking(true)}
        />
        {/* ...Maior volume, Melhor %, Pior % — sem mudança... */}
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

`clientes` (já filtrado de "Não informado", já existente no componente)
é reaproveitado como `data` da tabela — inclui todas as lojas com
qualquer volume, sem mínimo de amostra, como decidido.

### `frontend/src/pages/Dashboard.jsx`

1 linha muda, acrescentando `filtroBase` e `fetcher`:

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

(`onAbrirCliente` já deveria receber `fetchDashboardChamados` por
consistência — hoje está sem o 3º argumento, mesmo tipo de risco descrito
acima pros cards "Maior volume"/"Melhor %"/"Pior %". Corrigido junto,
já que é a mesma linha.)

### `frontend/src/pages/Performance.jsx`

1 linha muda, acrescentando só `filtroBase` (sem `fetcher` — mantém o
endpoint genérico já usado por essa tela):

```jsx
<ClientePerformancePanel
  porCliente={porCliente}
  filtroBase={filtroBase}
  onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período")}
  onAbrirCliente={(cliente) => drill.abrirLista({ ...filtroBase, cliente }, cliente)}
/>
```

## Testes

- Sem teste automatizado de frontend (o projeto não usa framework de
  teste no frontend — mesmo padrão já usado em todas as features de UI
  anteriores). Verificação manual:
  - `npm run build` limpo.
  - Dashboard: clicar em "% de resolução médio" → abre modal com todas as
    lojas, % batendo com o que já aparecia nos rankings de melhor/pior;
    clicar numa loja → abre os chamados dela (conferir que a contagem
    bate com o que aparecia nos cards de melhor/pior % pra essa mesma
    loja, confirmando que o `fetcher` certo foi usado).
  - Performance: mesmo fluxo, conferir que o clique numa loja continua
    funcionando como já funcionava antes (via `ClientesTable`, endpoint
    genérico).
  - Card "Clientes ativos no período" continua abrindo a lista plana
    normalmente (comportamento não deve ter mudado).

## Fluxo de dados (resumo)

```
ClientePerformancePanel (já recebe porCliente pronto, sem fetch próprio)
  clique em "% de resolução médio" → setVerRanking(true)
  → Modal > ClientesTable(data=clientes, filtroBase, fetcher)
      clique numa linha → drill.abrirLista({...filtroBase, cliente}, cliente, fetcher)
      → Modal (interno da ClientesTable) > DrillDownContent > ChamadosList
          fetcher usado: fetchDashboardChamados (Dashboard) | fetchChamadosFiltrados padrão (Performance)
```
