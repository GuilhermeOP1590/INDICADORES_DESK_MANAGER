# Classificação de equipamentos — design

## Contexto

O campo `equipamento` de cada chamado de Manutenção vem de texto livre (nome da
subcategoria no desk, ver `taxonomia.js`). Hoje existem 89 valores distintos
(alguns duplicados por diferença de maiúscula/espaço, ex. "Ar condicionado
Central" vs "Ar condicionado central"). O painel "Por equipamento" do módulo
Manutenção mostra esse ranking achatado — dezenas de barras, difícil de ler.

Objetivo: agrupar esses 89 valores em categorias mais altas ("tipo de
equipamento"), configuráveis pela tela de Configurações, e usar isso para:

1. Simplificar o painel principal de Manutenção (mostrar ~7 grupos em vez de
   89 itens).
2. Permitir drill-down em dois níveis: grupo → equipamentos específicos do
   grupo → chamados daquele equipamento.

## Grupos definidos

Definidos em conversa, revisando a distribuição real de `equipamento` no
período completo (todos os 89 valores, com contagem de chamados):

- **Movimentação** — Empilhadeira, Paleteira, Transpaleteira, Carrinho de
  compras, e itens ligados (baterias, rampas das docas).
- **Refrigeração** — balcões, ilhas de congelado, câmaras, portas de
  congelados/resfriados, casa de máquinas, bebedouro.
- **Energia** — Gerador, Substação.
- **Climatização** — Ar-condicionado, climatizadores, ventilador, exaustor.
- **Portas** — portões/portas de acesso não ligadas à refrigeração.
- **Limpeza e Operação** (novo, proposto na conversa) — Lavadora de piso,
  Prensa de papelão. Volume relevante (142 chamados) que não cabia em
  nenhuma das 5 categorias originais.
- **Estruturas** (novo, proposto na conversa) — Porta Pallets / Bases dos
  porta palets (rack de armazenagem — apesar do nome, não é uma porta).

Grupos são **configuráveis na tela** (criar/renomear/excluir), não fixos no
código. A lista acima é só o valor inicial (seed).

### Mapeamento inicial (seed) — chave normalizada (trim + minúsculo) → grupo

**Movimentação**: empilhadeira; carrinho de compras; agua de bateria de
empilhadeira; funcionamento de carregador de baterias; berço de bateria e
carrinho de troca; paleteira; transpaleteira; suporte de bateria; rampas das
docas.

**Estruturas**: porta pallets; bases dos porta palets.

**Refrigeração**: funcionamento portas de camara de congelado; funcionamento
portas de camara de resfriado; funcionamento balcoes de acougue; funcionamento
ilhas de congelados; iluminação de balcao de resfriado vertical; iluminação de
ilha de congelado; iluminação do balcao de acougue; balcao de acougue; balcao
de refrigeraçao; camara de congelado; camara de resfriado; açougue/deposito
açougue; balcão de açougue; ilhas de congelado e resfriado; ilhas de
congelados - reparos; freezer horizontal; funcionamento casa de maquinas; casa
de maquinas; casa de máquinas; bebedouro; porta de anti-camara; porta de
resfriado - vedação ruim; porta de resfriado - suporte danificado; porta de
resfriado - não fecha; porta de resfriado - correia danificada; porta de
congelados - suporte danificado; porta de congelados - não fecha; porta de
congelados - guia danificada; porta de congelados - vedação ruim.

**Energia**: funcionamento gerador; tensão de bateria gerador; banco de
capacitores (substação); gerador; gerador - quinzenal.

**Climatização**: ar condicionado central; climatizadores; ar condicionado de
salas; climatizador; climatizador - vazamento de água; ventilador; exaustor;
mais as ~17 variações "ar  condicionado sala [departamento]" (CFTV, CPD,
transportadora barcelona, cozinha do predio, recepção, sala do transporte rm,
sala da logistica (gerencia de projetos), sala da logistica, sala do
transporte, sala da fiscalização, sala de reunião bahia, sala de descanço dos
motoristas, portaria (externa), sala do televendas, sala do ti, rh e sesmt,
guarita dos seguranças (externo)).

**Portas**: portas rm; portões de entrada - quebrado; portões de entrada -
não funciona.

**Limpeza e Operação**: funcionamento lavadora de piso; lavadora de piso;
prensa de papelão.

**Não classificado** (fallback — não precisa estar no mapeamento, é o
default para qualquer chave ausente): outros; demandas - administrativas;
lojas; armário de colaboradores; administrativas; geral; sesmt - adequação de
nr's; loja nova; fiscal - atividade; sesmt - notificação.

## Arquitetura

### Backend

**`backend/src/services/configuracaoEquipamentos.js`** (novo, espelha
`configuracaoIndicadores.js`):

- Persiste `{ grupos: string[], atribuicoes: { [chaveNormalizada]: grupo } }`
  em `backend/data/configuracao-equipamentos.json`.
- `lerConfiguracaoEquipamentos()` / `salvarConfiguracaoEquipamentos(config)`.
- `normalizar(texto)` — trim + minúsculo + colapsa espaços múltiplos.
- `grupoDoEquipamento(equipamento, config)` — retorna o grupo atribuído ou
  `"Não classificado"` se a chave normalizada não estiver no mapeamento.
- `PADRAO` já populado com o mapeamento acima.

**`backend/src/services/indicadoresPorTaxonomia.js`**:

- Nova função `agruparEquipamentos(chamados)`: agrupa por
  `grupoDoEquipamento(chamado.equipamento)`, e para cada grupo já aninha o
  ranking dos equipamentos específicos (`itens: [{label, total}]`,
  ordenado desc). Retorna `[{label: grupo, total, itens}]`, ordenado desc por
  `total`.
- `detalheDoGrupo` passa a incluir `porGrupoEquipamento: agruparEquipamentos(chamados)`,
  mantendo o `porEquipamento` existente (achatado) intacto — ele continua
  sendo a fonte usada pela tela de Configurações e por buscas.

**`backend/src/routes/indicadores.js`**:

- `GET /configuracao/equipamentos` → `{ config, equipamentosDisponiveis }`.
  `equipamentosDisponiveis` é a lista de todo `equipamento` distinto já
  observado (todos os chamados de Manutenção, sem filtro de período — mesmo
  critério do endpoint de status), deduplicada por chave normalizada (soma as
  contagens de variações de maiúscula/espaço), ordenada por contagem desc.
- `PUT /configuracao/equipamentos` → salva `{ grupos, atribuicoes }`.

Não é necessário alterar `enriquecimento.js`, `taxonomia.js` nem o filtro de
`/chamados` — o segundo nível do drill-down (equipamento específico → lista de
chamados) já funciona hoje via `dimensaoFiltro="equipamento"` existente; o
grupo é só uma camada de agregação/exibição, calculada sob demanda a partir do
`equipamento` já presente no chamado.

### Frontend

**`frontend/src/pages/Configuracoes.jsx`**: passa a usar `SubTabs` (já usado
em Manutenção) com duas abas — "Status" (conteúdo atual, extraído para
`ConfiguracaoStatus.jsx` sem mudança de comportamento) e "Equipamentos" (novo).

**`frontend/src/pages/ConfiguracaoEquipamentos.jsx`** (novo):

- Busca `{config, equipamentosDisponiveis}` via novo `fetchConfiguracaoEquipamentos()`.
- Campo de busca por texto (filtra a lista por substring, case-insensitive).
- Lista: checkbox + nome do equipamento + contagem de chamados + grupo atual
  (texto, não editável linha-a-linha).
- Barra de ação em lote: "N selecionados" + select de grupo + botão
  "Aplicar" — atribui o grupo escolhido a todos os itens marcados,
  limpa seleção.
- "+ Novo grupo" — input de texto + botão, adiciona à lista de grupos
  disponíveis no select de atribuição.
- Resumo no topo: total de chamados por grupo (barra ou lista simples),
  incluindo "Não classificado" em destaque — visibilidade de quanto ainda
  falta classificar.
- Botão "Salvar alterações" (PUT), mesmo padrão visual de
  `ConfiguracaoStatus.jsx` (Salvando.../Salvo ✓).

**`frontend/src/pages/Manutencao.jsx`**: o painel "Por equipamento"
(`MaximizableChart` com `dimensaoFiltro="equipamento"`, `data={detalhe.porEquipamento}`)
é substituído por "Por tipo de equipamento" (`data={detalhe.porGrupoEquipamento}`).

**Drill-down em dois níveis** — extensões mínimas e retrocompatíveis:

- `HorizontalBarChart.jsx`: o `onClick` da barra passa a repassar o
  data-point inteiro como terceiro argumento (`onBarClick(entry.label,
  agregado, entry)`), não só o label. Chamadores existentes que ignoram o
  3º argumento continuam funcionando sem alteração.
- `MaximizableChart.jsx`: em `selecionar`, se o data-point clicado tiver um
  array `itens` (presente só nos dados de `porGrupoEquipamento`), chama
  `drill.abrirSubRanking(entry.itens, label, {...})` em vez de
  `drill.abrirLista(...)`. Comportamento de todo o resto do componente
  (agregado "Outros", `resumoPorCliente`) não muda.
- `useDrillDown.js`: novo `abrirSubRanking(dados, titulo, opts)`, empilha um
  item `{ tipo: "subRanking", dados, titulo, ...opts }`.
- `DrillDownContent.jsx`: novo branch para `tipo === "subRanking"` — renderiza
  um `HorizontalBarChart` com os `dados` (equipamentos específicos daquele
  grupo, já vêm prontos do payload, sem fetch extra), e ao clicar numa barra
  chama `onAbrirLista({...filtroBase, equipamento: label}, label, fetcher)`
  (empilha — "voltar" retorna pro sub-ranking, e de novo pro gráfico de
  grupos).

Resultado: clicar numa barra de grupo → abre modal com ranking dos
equipamentos daquele grupo (dado já carregado, resposta instantânea) → clicar
num equipamento específico → lista de chamados (reaproveita 100% o fluxo que
já existe hoje).

## Testes

- `backend/src/services/configuracaoEquipamentos.test.js` (novo): normalização
  de chave (trim/case/espaços), fallback "Não classificado" para chave
  ausente, leitura/gravação do arquivo de config.
- `backend/src/services/indicadoresPorTaxonomia.test.js` (novo ou adicionado
  a um existente): `agruparEquipamentos` agrupa corretamente e aninha `itens`
  ordenado por contagem desc.

## Fora de escopo (YAGNI por enquanto)

- Não altera o `equipamento` bruto exibido em buscas/listas de chamados.
- Não aplica agrupamento em Engenharia (equipamento sempre `null` lá) nem em
  Orçamento (não tem painel de equipamento hoje).
- Não normaliza a grafia exibida do `equipamento` em nenhum outro lugar do
  sistema — a normalização de chave é só para o lookup de grupo e para
  deduplicar a lista de `equipamentosDisponiveis` na tela de configuração.
