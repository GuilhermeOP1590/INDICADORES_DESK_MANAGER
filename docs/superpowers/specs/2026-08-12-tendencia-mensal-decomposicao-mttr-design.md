# Tendência mensal (Manutenção) e decomposição do MTTR (Equipamentos) — design

## Contexto

Duas peças relacionadas, ambas sobre o mesmo tema — quanto a espera por peça
pesa nos indicadores de manutenção corretiva — mas em telas e granularidades
diferentes:

1. Dentro de **Manutenção** (aba Geral), o usuário quer um gráfico **mês a
   mês** de despesas Preventiva x Corretiva, e — separado disso, pra poder
   cobrar o time de suprimentos — quanto tempo (em dias) os chamados
   passaram parados aguardando peça, também mês a mês.
2. Dentro de **Equipamentos (Ic)**, no perfil de um equipamento específico,
   o usuário quer saber, do MTTR daquele equipamento, quanto é espera de
   peça e quanto é reparo de fato — pra identificar se aquele equipamento
   específico sofre mais com suprimentos ou com mão de obra.

## Decisões da conversa

**Parte 1 — Tendência mensal:**
- Universo: **todos os chamados de Manutenção do período**, não só os que
  têm Ic identificado (hoje só ~54 chamados têm Ic marcado manualmente — um
  recorte pequeno demais pra cobrar suprimentos com credibilidade).
- Janela de tempo: **período livre**, escolhido pelo usuário via
  `DateFilterBar` (mesmo padrão das outras abas), sem padrão fixo de N
  meses. O usuário está ciente de que é uma busca cara (histórico de
  interação por chamado, igual Orçamento/Equipamentos por Ic) e a
  responsabilidade de não pedir um período gigante é dele.
- O indicador de tempo aguardando peça também vira **gráfico mês a mês**
  (não só um número total do período) — mostra se está piorando ou
  melhorando mês a mês, argumento mais forte de cobrança do que um número
  estático.
- Local: nova seção dentro de `Manutencao.jsx`, só na aba Geral (mesmo
  critério de `EquipamentosPorIc`: a análise não é filtrada por tipo).

**Parte 2 — Decomposição do MTTR:**
- Só decompõe o MTTR (Corretiva finalizada) já existente — não cria um
  indicador novo do zero, só quebra o que já tem em 2 partes.
- Onde aparece: perfil do equipamento (`PerfilIc`), como um 2º `DonutChart`
  (Espera de peça x Reparo), ao lado do "Preventiva x Corretiva" que já
  existe — mais legível que só números, mesmo padrão visual já usado ali.

## Arquitetura

### Parte 1 — Backend

**`backend/src/services/tendenciaMensalManutencao.js`** (novo):

```js
export function buildTendenciaMensal(chamados, historicoMap) { ... }
```

Agrupa `chamados` por mês de `DataCriacao` (`"AAAA-MM"`, primeiros 7
caracteres da data ISO — mesmo formato usado em `agruparSerie` no
frontend). Por mês, soma:
- `valorPreventiva`: soma de `historico.valorAprovacao` dos chamados
  `tipo === "Preventiva"` daquele mês.
- `valorCorretiva`: idem pra `tipo === "Corretiva"`.
- `tempoAguardandoPecaDias`: soma de `historico.tempoAguardandoPecaDias` de
  **todos** os chamados daquele mês (qualquer tipo — mesmo critério já
  usado em `tempoAguardandoPecaDiasTotal` de `icsEquipamento.js`).

Retorna `[{ mes: "2026-01", valorPreventiva, valorCorretiva,
tempoAguardandoPecaDias }, ...]` ordenado por `mes` ascendente (cronológico
— faz sentido pra um gráfico de tendência, diferente do `buildPorIc` que
ordena por `total` desc).

**`backend/src/routes/indicadores.js`** — nova rota:

```
GET /manutencao/tendencia-mensal?dataInicio&dataFim
```

- Período obrigatório (`400` se ausente — mesmo padrão de
  `/configuracao/equipamentos/por-ic`).
- `carregarChamadosEnriquecidos` → filtra `especialidade === "Manutenção"` +
  período (`filtrarPorData`/`excluirCancelados`, igual sempre).
- `obterHistoricoEmLote` sobre **todos** esses chamados (não só os
  Ic-identificados) → `buildTendenciaMensal`.
- Resposta: `{ tendencia: [...], totalChamados }`.

### Parte 1 — Frontend

**`frontend/src/api.js`**: `fetchTendenciaMensalManutencao(opts)` →
`getJson("/api/manutencao/tendencia-mensal", opts)`.

**`frontend/src/components/MonthlyBarChart.jsx`** (novo, genérico —
reaproveitado pelos 2 gráficos desta feature, evita duplicar código de
gráfico de barra por mês):

```jsx
export function MonthlyBarChart({ data, series, formatValue, height = 260 }) { ... }
```

- `data`: array com campo `mes` (`"AAAA-MM"`) + os campos numéricos que
  `series` referencia.
- `series`: `[{ dataKey, name, color }]` — 1 item = gráfico de barra única
  (caso do tempo aguardando peça); 2+ itens = barras agrupadas por mês com
  legenda (caso do custo Preventiva x Corretiva).
- Eixo X formatado como `MM/AAAA` (mesmo padrão de `formatLabel` em
  `VolumeTrendChart.jsx`, mas sem a lógica de dia/semana — aqui a
  granularidade é sempre mês).
- Não reaproveita `VolumeTrendChart` diretamente porque esse componente é
  especializado em 1 métrica (volume) com 3 representações (área/barra/linha)
  conforme densidade de pontos; aqui o requisito é o oposto — sempre barra,
  mas com N séries lado a lado. Ficaria mais confuso forçar os dois casos
  num componente só do que ter dois componentes pequenos e focados.

**`frontend/src/components/TendenciaMensalManutencao.jsx`** (novo):

- `DateFilterBar` (período livre, sem padrão pré-calculado) + botão
  "Calcular". Estado inicial `status: "idle"` — não busca sozinho ao
  montar, mesmo racional de custo de `EquipamentosPorIc`.
- Enquanto calcula: aviso "pode levar um tempo, depende do período
  selecionado — quanto maior o período, mais chamados precisam ser
  buscados individualmente".
- Depois de calculado:
  - `MonthlyBarChart` com 2 séries: "Preventiva" (`valorPreventiva`) e
    "Corretiva" (`valorCorretiva`), cores `var(--series-3)` / `var(--series-2)`
    (mesmas já usadas pra Preventiva/Corretiva em `Manutencao.jsx`
    `COR_POR_TIPO`), `formatValue` em BRL.
  - `MonthlyBarChart` com 1 série: "Tempo aguardando peça"
    (`tempoAguardandoPecaDias`), `formatValue` em dias.
  - Se `tendencia` vier vazio (nenhum chamado no período): mensagem
    "Nenhum chamado de Manutenção nesse período.", mesmo padrão de estado
    vazio já usado em `EquipamentosPorIc`.

**`frontend/src/pages/Manutencao.jsx`**: importa
`TendenciaMensalManutencao` e renderiza
`{tipoAtivo === GERAL && <TendenciaMensalManutencao />}` no mesmo lugar
onde `EquipamentosPorIc` costumava ficar (antes de virar aba própria) — fim
do bloco `{detalhe && (<> ... </>)}`, dentro do `tipoAtivo === GERAL`.

### Parte 2 — Backend

**`backend/src/services/icsEquipamento.js`** — troca `calcularMttrHoras`
por `calcularDecomposicaoMttr`, que já existia calculando só a média do
tempo total; agora calcula a média das 3 partes de uma vez (1 loop só, em
vez de recalcular):

```js
function calcularDecomposicaoMttr(corretivas) {
  const partes = [];
  for (const c of corretivas) {
    if (!c.dataFinalizacao || c.dataFinalizacao === "0000-00-00") continue;
    const inicio = parseDateTime(c.dataCriacao, c.horaCriacao);
    const fim = parseDateTime(c.dataFinalizacao, c.horaFinalizacao);
    if (!inicio || !fim) continue;
    const totalHoras = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    if (totalHoras < 0) continue;
    // tempoAguardandoPecaDias é do CHAMADO inteiro (pode incluir tempo fora dessa janela
    // em teoria, mas na prática só ocorre enquanto o chamado está aberto) — o min() é uma
    // proteção defensiva pra nunca sobrar reparoHoras negativo por inconsistência de dados.
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

No corpo do `.map(({ ic, chamados: lista }) => { ... })`, calcula a
decomposição uma única vez numa variável (evita rodar o mesmo `.filter` +
loop 3 vezes) e espalha os 3 campos no retorno:

```js
const decomposicaoMttr = calcularDecomposicaoMttr(ordenados.filter((c) => c.tipo === "Corretiva"));
// ...
return {
  ic,
  total: ordenados.length,
  // ... campos já existentes ...
  mttrHoras: decomposicaoMttr?.mttrHoras ?? null,
  mttrAguardandoPecaHoras: decomposicaoMttr?.mttrAguardandoPecaHoras ?? null,
  mttrReparoHoras: decomposicaoMttr?.mttrReparoHoras ?? null,
  chamados: ordenados,
};
```

Rota `GET /configuracao/equipamentos/por-ic` não muda de assinatura — só
passa a devolver os 2 campos novos dentro de cada item de `ics`.

### Parte 2 — Frontend

**`frontend/src/pages/EquipamentosPorIc.jsx`** — `PerfilIc` ganha um 2º
`DonutChart`, ao lado do "Preventiva x Corretiva":

```jsx
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

## Testes

- `backend/src/services/tendenciaMensalManutencao.test.js` (novo):
  `buildTendenciaMensal` agrupa por mês corretamente, soma valor
  Preventiva/Corretiva separadamente, soma tempo aguardando peça de
  qualquer tipo, ordena por mês ascendente, ignora chamado com
  `DataCriacao` ausente.
- `backend/src/services/icsEquipamento.test.js`: atualiza os testes
  existentes de `mttrHoras` (que hoje chamam `calcularMttrHoras`
  indiretamente via `buildPorIc`) pra também checar `mttrAguardandoPecaHoras`
  e `mttrReparoHoras` na mesma leva de dados; adiciona teste específico de
  decomposição (ex: chamado com `tempoAguardandoPecaDias` conhecido,
  confirma que os 2 números somam o `mttrHoras` total).

## Fora de escopo (YAGNI por enquanto)

- Filtro de tipo (Preventiva/Corretiva) na tendência mensal — o gráfico já
  separa por série, não precisa de sub-abas adicionais.
- Granularidade semana/dia no gráfico de tendência — "mês a mês" foi o
  pedido explícito; dia/semana não fazem sentido pra tendência de custo.
- Indicador de indisponibilidade (% do período que o equipamento ficou
  fora do ar) — descartado nas perguntas de esclarecimento em favor só da
  decomposição do MTTR.
- Reaproveitar `VolumeTrendChart` pra isso — avaliado e descartado (ver
  arquitetura da Parte 1), fica um componente novo e menor.
