# Equipamentos por Ic — design

## Contexto

O usuário quer identificar, dentro de Manutenção, **um equipamento físico
específico** (não a categoria — isso já existe via "grupo de equipamento") e
acompanhar seus custos e a recorrência de manutenções preventivas/corretivas
daquele item exato. Nem todo chamado tem essa identificação — só os que o
técnico marcou manualmente ao atender.

## Descoberta técnica

Investigação feita ao vivo contra a API real do DeskManager (chamado
`0826-000056`, que tem essa marcação):

- **"ICs" é um módulo próprio do DeskManager**, não um campo solto — um
  catálogo com **7.098 ativos cadastrados** (`lista_de_ics`), cada um com
  nome no formato `"<código do cliente> - <sigla> - <equipamento> <número>"`
  (ex: `"300 - MTZ - Empilhadeira 06"`), tipo de ativo, área alocada, etc.
- O vínculo **chamado ↔ Ic acontece na interação** ("Interação Avançada"
  preenchida pelo técnico), não no cabeçalho do chamado. Descoberto via
  `dados_da_interacao_do_chamados` (mesma tool MCP já usada em
  `historicoChamado.js` pra Causa/Valor/Orçamento), pedindo a coluna nativa
  `ICs` no parâmetro `Colunas`:
  ```json
  { "ICs": "300 - MTZ - Empilhadeira 06", "_9293": "1001", "CodCausa": [...] }
  ```
- `_9293` é o campo extra **"Horímetro"** (descoberto via
  `lista_de_campos_extras`, `Tipo: "Interações"`). A mesma interação também
  expõe `_15058` (Número de série) e `_15060` (Marca/modelo), mas esses dois
  **não entram no escopo desta feature** (só Horímetro foi pedido).
- Existe uma tool `dados_do_mapa_de_relacionamento_de_ics` que, em teoria,
  daria o caminho inverso (todos os chamados de um Ic, sem precisar varrer
  todo mundo) — mas a chave de API atual **não tem permissão** pra ela
  (`"Você não possui permissão para Visualizar o Mapa de Relacionamento"`).
  Fica registrado como otimização futura, caso a permissão seja liberada.

**Implicação de custo**: sem o mapa de relacionamento, o único caminho é o
mesmo N+1 já usado pelo Orçamento — uma chamada por chamado. Por isso esta
feature **reaproveita exatamente o mesmo cache/pipeline de
`historicoChamado.js`** em vez de criar um segundo caminho caro em paralelo
— se o Orçamento já foi calculado no período (cache de 15min quente), "Por
Ic" carrega na hora.

Decisões da conversa:

- Escopo: só Manutenção (Engenharia não usa Ic).
- Carregamento: sob demanda, período obrigatório (como o Orçamento) — não
  carrega sozinho ao abrir a aba.
- Métricas por Ic: total de chamados, custo total, Preventiva x Corretiva,
  recorrência média (dias entre chamados), histórico de horímetro.
- Local: 3ª sub-aba em **Configurações → Equipamentos** (junto de "Status" e
  "Equipamentos" que já existem lá).

## Arquitetura

### Backend

**`backend/src/services/historicoChamado.js`** — estender (não duplicar) o
pipeline existente:

- Novas constantes: `CAMPO_EXTRA_HORIMETRO = "_9293"` e `CAMPO_ICS = "ICs"`
  (esta última é coluna nativa, não um campo extra numérico — só marca
  `Colunas: { ICs: "on" }`).
- `fetchInteracoes` passa a pedir essas duas colunas também, junto das que
  já pedia (Valor, Orçamento/Custo).
- Nova `extrairIcs(interacoes)`: junta os Ics de **todas** as interações da
  chamada (não só a mais recente — o mesmo chamado pode referenciar o
  equipamento em ações diferentes), separando por vírgula/ponto-e-vírgula
  (o formato observado é um valor só; separadores múltiplos ficam como
  proteção defensiva caso apareça), remove duplicatas. Retorna `string[]`.
- Nova `extrairHorimetro(interacoes)`: mesmo padrão de `extrairValorAprovacao`
  — pega o valor da interação mais recente que tiver `_9293` preenchido.
  Retorna `string | null`.
- `obterHistoricoChamado` passa a incluir `ics: string[]` e
  `horimetro: string | null` no objeto retornado (e cacheado — mesma chave,
  mesmo TTL de 15min, sem mudança de comportamento de cache).
- Fallback de erro em `obterHistoricoEmLote` ganha os mesmos dois campos
  vazios (`ics: [], horimetro: null`).

**`backend/src/services/icsEquipamento.js`** (novo):

```js
export function buildPorIc(chamados, historicoMap) { ... }
```

Para cada chamado com `ics.length > 0` no histórico, monta uma linha
`{ chave, codChamado, dataCriacao, tipo, causa, valorAprovacao, horimetro }`
e agrupa por nome de Ic (um chamado com múltiplos Ics conta pra cada um).
Por grupo, calcula:
- `total`, `preventiva`, `corretiva` (contagem por `chamado.tipo`, campo já
  existente — não precisa reclassificar nada)
- `custoTotal` (soma de `valorAprovacao`, arredondado a 2 casas)
- `recorrenciaDias`: intervalo médio, em dias, entre datas de criação
  consecutivas (ordenadas); `null` se houver menos de 2 chamados
- `chamados`: a lista completa, ordenada por data — é dela que o frontend
  tira tanto a tabela cronológica quanto o histórico de horímetro (não
  precisa de uma estrutura paralela só pra horímetro)

Resultado ordenado por `total` desc.

**`backend/src/routes/indicadores.js`** — nova rota:

```
GET /configuracao/equipamentos/por-ic?dataInicio&dataFim
```

- Período obrigatório (`400` se `dataInicio`/`dataFim` ausentes).
- `carregarChamadosEnriquecidos` → filtra `especialidade === "Manutenção"` +
  período (mesmo `filtrarPorData`/`excluirCancelados` de sempre).
- `obterHistoricoEmLote` (mesma função, já teria dados de cache se o
  Orçamento tiver rodado antes) → `buildPorIc`.
- Resposta: `{ ics: [...], totalChamados, totalComIc, totalSemIc }`.
  `totalComIc` conta **chamados distintos** com pelo menos 1 Ic (não soma os
  totais por Ic, que dupla-contariam um chamado com 2+ Ics).

### Frontend

**`frontend/src/api.js`**: `fetchEquipamentosPorIc(opts)` →
`getJson("/api/configuracao/equipamentos/por-ic", opts)`.

**`frontend/src/pages/Configuracoes.jsx`**: `ABAS` ganha um 3º item
`{ value: "por-ic", label: "Por Ic" }` → `<EquipamentosPorIc />`.

**`frontend/src/pages/EquipamentosPorIc.jsx`** (novo):

- `DateFilterBar` (sem período padrão pré-calculado) + botão "Calcular".
  Estado inicial `status: "idle"` — **não** busca sozinho ao montar (só ao
  clicar), diferente do Orçamento, justamente pelo custo.
- Enquanto calcula: aviso "pode levar até 1 minuto" (mesmo texto/racional do
  Orçamento).
- Depois de calculado: linha de meta ("N chamados de Manutenção no período —
  M com Ic identificado, K sem"), depois:
  - `HorizontalBarChart` (top 15, `agregarOutros={false}` — nesta tela
    "Outros (agregado)" não faz sentido, o objetivo é identificar o item
    exato, não somar o resto)
  - `RankingTable` completa abaixo (busca/ordenação, todos os Ics)
  - Ambos com clique abrindo o **perfil do Ic** (state local
    `icSelecionado`, não é um dos tipos que `useDrillDown`/
    `DrillDownContent` já conhece — mais simples manter separado)
- **Modal de perfil do Ic** (título = nome do Ic):
  - `StatTile` × 3: Total de chamados, Custo total (BRL), Recorrência média
    (`"a cada Xd"` ou `"poucos dados"` se `recorrenciaDias === null`)
  - `DonutChart` Preventiva x Corretiva (já robusto a total zero, ver fix
    desta sessão)
  - Tabela cronológica: Código · Data · Tipo · Causa · Valor · Horímetro.
    Clique numa linha abre o detalhe do chamado — **um `useDrillDown()`
    próprio, aninhado dentro deste componente**, com seu próprio `<Modal>`
    por cima do modal de perfil (mesmo padrão já usado em
    `OperadoresTable.jsx`, que também mantém seu drill-down independente do
    resto da tela — não precisa estender `DrillDownContent.jsx` com um tipo
    novo).

## Testes

- `backend/src/services/historicoChamado.test.js` (novo, hoje esse arquivo
  não existe): `extrairIcs` (um valor, múltiplos separados por vírgula,
  vazio/ausente, duplicata entre interações diferentes), `extrairHorimetro`
  (pega o mais recente preenchido, ignora vazio).
- `backend/src/services/icsEquipamento.test.js` (novo): `buildPorIc` agrupa
  corretamente por Ic, soma custo, calcula `preventiva`/`corretiva` por
  `tipo`, calcula `recorrenciaDias` (incluindo o caso `null` com 1 chamado
  só), e conta um chamado com 2 Ics nos dois grupos.

## Fora de escopo (YAGNI por enquanto)

- Número de série / Marca-modelo (`_15058`/`_15060`) — descobertos junto,
  mas não pedidos; não entram no payload nem na tela.
- Gráfico de linha do horímetro ao longo do tempo — a tabela cronológica já
  mostra a evolução; um gráfico dedicado fica pra depois se fizer falta.
- Uso do `dados_do_mapa_de_relacionamento_de_ics` — bloqueado por permissão
  hoje; se for liberado depois, dá pra trocar o cálculo por-chamado por uma
  consulta direta por Ic (mais barata), sem mudar o formato da resposta da
  rota.
- Engenharia não entra (Ic é conceito de equipamento físico de Manutenção).
- Sem edição/gestão do catálogo de Ics pelo Indicadores Desk — é só leitura
  do que já existe no DeskManager.
