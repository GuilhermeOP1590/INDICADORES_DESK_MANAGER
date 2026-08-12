# MTTF, MTTR e Tempo Aguardando Peça por Ic — design

## Contexto

Dentro do perfil de um equipamento específico (aba **Equipamentos (Ic)**,
`frontend/src/pages/EquipamentosPorIc.jsx`), o usuário já vê Total de
chamados, Cliente, Custo total e Recorrência média (dias entre chamados de
qualquer tipo). Ele quer 3 indicadores novos, mais específicos de
confiabilidade do equipamento:

1. **MTTF** — quantas horas o equipamento roda, em média, entre falhas.
2. **MTTR** — quanto tempo, em média, leva pra reparar uma falha.
3. **Tempo aguardando peça** — quanto tempo, no total, o equipamento ficou
   parado esperando peça no período.

## Decisões da conversa

- **O que conta como "falha"**: só chamados **Corretiva**. Preventiva e
  Rotina são manutenção programada, não falha.
- **MTTF não substitui a Recorrência média existente** — são indicadores
  diferentes (Recorrência = dias entre qualquer chamado; MTTF = horas
  rodadas, via horímetro, só entre Corretivas) e convivem lado a lado.
- **MTTR não desconta tempo em "Aguardando Aprovação"** — usa
  abertura→finalização direto, mesmo padrão já usado em
  `tempoResolucaoHoras` no resto do sistema (`backend/src/routes/indicadores.js`).
  Só considera chamados **Corretiva já finalizados** (`DataFinalizacao`
  preenchida).
- **Tempo aguardando peça** soma os status **"Aguardando Peça do Estoque"**
  e **"Peça Enviada para Loja"** como um único período parado (do ponto de
  vista do equipamento, a peça só resolve o problema quando instalada, não
  quando sai do estoque). Conta em **qualquer tipo de chamado** (peça em
  falta pode travar uma preventiva também, não só corretiva). Mostrado como
  **total acumulado no período**, não média.
- **Onde aparece**: só no modal de perfil do equipamento (3 novos
  `StatTile`s), não na lista "Todos os equipamentos" nem no gráfico.

## Descoberta técnica: tempo aguardando peça só tem granularidade de dia

O log de interações do chamado (`dados_da_interacao_do_chamados`, já usado
por `historicoChamado.js` pra Causa/Valor/Ics/Horímetro) registra `Status` e
`DataAcao` por interação — mas `DataAcao` é só data (`"11-08-2026"`), **sem
hora**. Isso já é uma limitação conhecida do parsing existente (ver
comentário em `extrairDataAprovacao`).

Consequência: dá pra saber em que **dia** um chamado entrou e saiu de
"Aguardando Peça do Estoque" / "Peça Enviada para Loja", mas não a que
horas. Por isso este indicador é medido em **dias**, não em horas — diferente
do MTTR, que usa `DataCriacao`+`HoraCriacao` / `DataFinalizacao`+`HoraFinalizacao`
do chamado (esses sim têm hora) e por isso sai em horas.

Chamados ainda parados nesse status no momento do cálculo (não saíram ainda)
contam até a data/hora atual — o indicador deve refletir travas em
andamento, não só as já resolvidas.

## Arquitetura

### Backend

**`backend/src/services/historicoChamado.js`** — estender o pipeline
existente (mesmo padrão de `extrairPassouPorAguardandoAprovacao`, que já
varre `interacao.Status?.[0]?.text` em todo o histórico):

```js
const STATUS_AGUARDANDO_PECA = new Set(["Aguardando Peça do Estoque", "Peça Enviada para Loja"]);

// Interações vêm mais recente -> mais antiga; inverte pra varrer em ordem cronológica.
// Funde entradas consecutivas nos 2 status como um único período parado (troca de um pro
// outro não fecha o período). Se o período mais recente ainda não fechou (chamado ainda
// parado), conta até agora.
export function extrairTempoAguardandoPecaDias(interacoes) { ... }
```

- `obterHistoricoChamado` passa a incluir `tempoAguardandoPecaDias: number`
  (dias, arredondado a 1 casa) no objeto retornado e cacheado (mesma chave,
  mesmo TTL de 15min — sem mudança de comportamento de cache).
- Fallback de erro em `obterHistoricoEmLote` ganha `tempoAguardandoPecaDias: 0`.

**`backend/src/services/icsEquipamento.js`** — estender `buildPorIc`:

- A `linha` por chamado ganha 4 campos novos:
  - `dataFinalizacao`, `horaCriacao`, `horaFinalizacao` (de
    `chamado.DataFinalizacao`/`chamado.HoraCriacao`/`chamado.HoraFinalizacao`
    — campos nativos já usados em `routes/indicadores.js`, não precisam de
    enriquecimento) — necessários pro MTTR.
  - `tempoAguardandoPecaDias: historico?.tempoAguardandoPecaDias ?? 0`.
- Por grupo de Ic, 3 cálculos novos (usando só as `linha`s com
  `tipo === "Corretiva"` pros dois primeiros; todas as `linha`s pro
  terceiro):
  - `mttfHoras`: pega o `horimetro` (string) de cada Corretiva ordenada por
    data, converte pra número, **descarta leituras não estritamente
    crescentes** (horímetro é cumulativo — uma leitura menor que a anterior
    é erro de cadastro, não o equipamento "voltando no tempo"; descarta a
    leitura inteira, não só o delta, senão o próximo delta também sai
    errado), calcula a diferença entre leituras crescentes consecutivas e
    tira a média. `null` se sobrarem menos de 2 leituras válidas.
  - `mttrHoras`: pega as Corretivas com `dataFinalizacao` preenchida, calcula
    `parseDateTime(dataFinalizacao, horaFinalizacao) - parseDateTime(dataCriacao, horaCriacao)`
    em horas (reusa `parseDateTime` de `./indicadores.js`, mesmo import que
    o resto do backend já usa), tira a média. `null` se não houver nenhuma.
  - `tempoAguardandoPecaDiasTotal`: soma simples de `tempoAguardandoPecaDias`
    de todas as `linha`s do grupo (qualquer tipo). `0` se nenhuma tiver.
- Todos arredondados a 1 casa decimal, mesmo padrão de `recorrenciaDias`.

**`backend/src/routes/indicadores.js`** — a rota
`GET /configuracao/equipamentos/por-ic` não muda de assinatura; só passa a
devolver os 3 campos novos dentro de cada item de `ics` (via `buildPorIc`).

### Frontend

**`frontend/src/pages/EquipamentosPorIc.jsx`** — `PerfilIc` ganha 3
`StatTile`s novos, junto dos 4 que já existem (Total, Cliente, Custo,
Recorrência):

- "MTTF" → `${ic.mttfHoras}h` ou `"poucos dados"` se `null`.
- "MTTR" → `${ic.mttrHoras}h` ou `"poucos dados"` se `null`.
- "Tempo aguardando peça" → `${ic.tempoAguardandoPecaDiasTotal} dias` (sempre
  tem valor, mesmo que `0`).

## Testes

- `backend/src/services/historicoChamado.test.js` — `extrairTempoAguardandoPecaDias`:
  um período fechado (entra e sai), dois status diferentes seguidos contam
  como um período só, período ainda aberto conta até agora, sem nenhuma
  ocorrência retorna `0`, dois períodos separados no mesmo histórico somam.
- `backend/src/services/icsEquipamento.test.js` — `buildPorIc`:
  - `mttfHoras`: calcula a média corretamente com leituras crescentes,
    descarta leitura decrescente sem quebrar o cálculo do delta seguinte,
    retorna `null` com menos de 2 leituras válidas, ignora chamados que não
    são Corretiva.
  - `mttrHoras`: calcula a média corretamente, ignora Corretiva não
    finalizada, retorna `null` sem nenhuma Corretiva finalizada.
  - `tempoAguardandoPecaDiasTotal`: soma entre chamados de tipos diferentes,
    retorna `0` sem nenhuma ocorrência.

## Fora de escopo (YAGNI por enquanto)

- MTTF/MTTR/Tempo aguardando peça na lista "Todos os equipamentos" ou no
  gráfico "Top equipamentos" — só no perfil individual, por ora.
- Alertas ou destaque visual quando um indicador está "ruim" (ex: MTTR muito
  alto) — é só exibição, sem julgamento de valor.
- Configuração dos status considerados "aguardando peça" — usa a lista fixa
  (`"Aguardando Peça do Estoque"`, `"Peça Enviada para Loja"`), não a
  configuração editável de `configuracaoIndicadores.js` (essa é sobre
  aberto/concluído/aguardando aprovação, um conceito diferente).
