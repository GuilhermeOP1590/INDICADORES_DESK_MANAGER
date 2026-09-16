# Painel PCM — atribuição e visibilidade de chamados — design

## Contexto

Hoje o Desk Manager distribui automaticamente cada chamado de Manutenção/Engenharia
pra uma pessoa (coluna "Distribuição" no Desk), mas o PCM não tem visibilidade
consolidada disso dentro do Indicadores Desk, nem uma forma de:

- Sobrepor essa distribuição automática com uma atribuição própria (grupo,
  pessoa, nível de urgência de manutenção, observação, data prevista de
  solução).
- Ver rapidamente quantos chamados cada pessoa tem, por nível de urgência,
  organizados por grupo (Manutenção, Engenharia, SESMT, ...).
- Ver o que está atrasado, no prazo, ou vence essa semana.
- Extrair pra Excel os dados completos de um grupo ou de uma pessoa,
  inclusive o texto que o solicitante escreveu na abertura do chamado.

Este documento cobre só essa funcionalidade nova (painel "PCM"). Não altera
nada do que já existe (SLA nível 1-5, chamados prioritários, indicadores do
Dashboard/Manutenção/Engenharia/Performance).

## Decisões tomadas em conversa

- **Urgência de manutenção** é um campo novo e independente — não substitui
  nem deriva do nível de SLA (1-5, vindo de `NomePrioridade`) nem do flag
  "chamado prioritário". As três coisas convivem. Rótulos: **Crítica / Alta /
  Média / Baixa**.
- **Pessoas não são cadastradas do zero.** Elas vêm do próprio Desk Manager —
  são as mesmas pessoas que aparecem na coluna "Distribuição" do Desk. O PCM
  só define o **grupo** de cada uma (Manutenção, Engenharia, SESMT, ...),
  exatamente como já funciona o mapeamento equipamento→grupo em
  Configurações. Cada pessoa pertence a **um único grupo**.
- **Escopo:** só chamados de Manutenção e Engenharia (mesmo escopo que o
  resto do sistema já usa) — não abrange chamados de outras áreas do Desk.
- Atribuição manual do PCM só aceita **pessoas já mapeadas** num grupo (via
  seletor) — não é texto livre, pra manter os indicadores por pessoa
  consistentes.
- **"Vence essa semana"** = semana de calendário (segunda a domingo), não
  janela móvel de 7 dias.
- Observação do PCM é **texto livre**.
- **Onde vive:** página nova e dedicada **"PCM"** na navegação (não dentro
  de Manutenção/Engenharia) — reúne as duas áreas numa visão só.
- **Edição:** inline, direto nas células da tabela (dropdown de grupo/
  urgência, input de observação, date picker de data prevista) — salva ao
  trocar, sem botão "Salvar" separado.
- **Indicador em 2 níveis**, pra não virar uma lista ilegível quando um
  grupo tiver muita gente:
  - Nível 1 — cards por grupo (total de pessoas + breakdown por urgência).
  - Nível 2 — ao clicar num grupo, matriz **Pessoa × Urgência** só das
    pessoas daquele grupo, com linha de total. Clicar numa célula abre a
    lista de chamados daquele cruzamento (reaproveita `useDrillDown`/
    `Modal`/`DrillDownContent` já existentes).
- **Exportação Excel** faz parte do escopo (não é "fora de escopo"): botão
  disponível tanto na visão de um **grupo** quanto na de uma **pessoa**,
  sempre com os dados completos — mesmo que isso demore mais (ver seção
  "Exportação Excel" abaixo). Usuário confirmou que aceita a espera.

## Modelo de dados (Supabase)

Nova migration `supabase/migrations/0002_pcm_atribuicoes.sql`, seguindo a
convenção já usada em `0001_init.sql` (comentário de tabela explicando dono/
propósito dos dados, RLS desligado de propósito — só o backend acessa via
`service_role`).

Diferente do padrão atual de "um blob JSON por funcionalidade" em
`app_config` (usado por `chamados-prioritarios` e config. de equipamentos):
aqui a escolha é por **tabelas relacionais tipadas**, porque essa
funcionalidade vai ter muito mais linhas (potencialmente todo chamado de
Manutenção/Engenharia que o PCM tocar) e precisa de upsert unitário por
chamado, não reescrita do documento inteiro a cada edição — evita
race conditions e é o padrão correto pra esse volume/formato de escrita
(confirmado com a skill de boas práticas de Postgres do Supabase).

```sql
create table pcm_pessoas_grupo (
  chave_pessoa text primary key,  -- identificador estável vindo do Desk (não o nome puro — evita colisão de homônimos; nome exato do campo é descoberto na implementação, ver Pendências Técnicas)
  nome text not null,             -- cache de exibição
  grupo text not null,
  atualizado_em timestamptz not null default now()
);

create table pcm_atribuicoes_chamados (
  cod_chamado text primary key,
  grupo text not null,
  pessoa text not null,           -- chave_pessoa de pcm_pessoas_grupo
  urgencia text not null check (urgencia in ('Crítica', 'Alta', 'Média', 'Baixa')),
  observacao text,
  data_prevista_solucao date,
  atualizado_em timestamptz not null default now()
);
```

Só existe uma linha em `pcm_atribuicoes_chamados` **quando o PCM edita algo**
naquele chamado — chamados intocados não geram linha.

**Regra de exibição/agregação** (usada tanto na tabela principal quanto nos
indicadores):

- Se existe linha em `pcm_atribuicoes_chamados` pro `codChamado` → mostra
  "✋ Atribuído pelo PCM" com os dados dessa linha (grupo, pessoa, urgência).
- Senão → mostra "🖥 Distribuído pelo sistema" com o nome vindo do campo
  Distribuição do Desk; o grupo é resolvido via `pcm_pessoas_grupo` (ou
  "Sem grupo definido" se essa pessoa ainda não foi mapeada — aparece como
  um grupo à parte no Nível 1, sinalizando pro PCM que existe gente atuando
  que ele ainda não classificou).
- Urgência de um chamado nunca tocado pelo PCM cai no bucket "Sem urgência
  definida" nos indicadores (não herda nada do SLA nível).

## Backend

**Novo:**
- `backend/src/services/pcmPessoas.js` — ler/upsert `pcm_pessoas_grupo`
  (mesmo padrão de client Supabase já usado em `prioridades.js`).
- `backend/src/services/pcmAtribuicoes.js` — ler/upsert
  `pcm_atribuicoes_chamados` (upsert unitário por `cod_chamado`,
  `insert ... on conflict`) + `buildIndicadorPorGrupo(chamados)` /
  `buildIndicadorPorPessoa(chamados, grupo)`.
- `backend/src/services/prazo.js` — `classificarPrazo(dataPrevistaSolucao)`
  → `"atrasado" | "vence-semana" | "no-prazo" | "sem-data"` (semana de
  calendário, segunda a domingo).
- `backend/src/routes/pcm.js` (novo router, montado em `backend/src/index.js`
  junto dos outros): rotas de leitura/escrita de pessoas-grupo, de
  atribuição por chamado, de indicadores (por grupo, por pessoa dentro de um
  grupo) e de exportação (ver seção seguinte).

**Modificado:**
- `backend/src/services/enriquecimento.js` — anexa `distribuicaoSistema`
  (nome vindo do Desk) a cada chamado no pipeline Manutenção/Engenharia.

## Frontend

**Novo:**
- `frontend/src/pages/Pcm.jsx` + `NavLink`/`<Route path="/pcm">` em
  `App.jsx` (nova aba na navegação principal, ao lado de Performance).
- Sub-abas dentro da página:
  - **"Atribuições"** — 4 `StatTile` no topo (Atrasados · Vence esta semana
    · No prazo · Sem data) + tabela com edição inline (dropdown de grupo,
    dropdown de urgência, input de observação, date picker de data
    prevista, badge colorido de status de prazo, ícone 🖥/✋ de origem).
    Clicar num `StatTile` filtra a tabela.
  - **"Por grupo"** — Nível 1: cards por grupo. Nível 2 (ao clicar num
    card): matriz Pessoa × Urgência daquele grupo, com botão "Exportar
    Excel" (grupo inteiro) e, ao clicar numa linha de pessoa, abre a lista
    de chamados daquela pessoa com seu próprio botão "Exportar Excel".
  - **"Pessoas/Grupos"** — tela de configuração: lista de pessoas (busca
    puxando do Desk, mesmo dataset já usado pra `distribuicaoSistema`) +
    seletor de grupo pra cada uma. Mesmo padrão visual da configuração de
    equipamentos já existente.
- `frontend/src/api.js` — funções novas seguindo o padrão existente
  (`fetchPcmAtribuicoes`, `salvarPcmAtribuicao`, `fetchPcmPessoasGrupo`,
  `salvarPcmPessoaGrupo`, `fetchPcmIndicadorGrupo`, `fetchPcmExportar`).

## Exportação Excel

Reaproveita `frontend/src/lib/exportExcel.js` (já existe, criado na feature
de SLA por nível) — o frontend só chama `exportarLinhas(linhas, colunas,
nomeArquivo)` com o que o backend devolver, sem lógica de xlsx nova no
cliente.

O texto de abertura do solicitante **não vem na listagem em lote do Desk**
— só existe no endpoint de detalhe por chamado (o mesmo que já alimenta o
modal de detalhe hoje, `fetchDetalheChamado`). Por isso a exportação
completa precisa que o **backend** busque o detalhe de cada chamado
individualmente:

- `GET /api/pcm/exportar?grupo=X` (grupo inteiro) ou
  `GET /api/pcm/exportar?grupo=X&pessoa=Y` (uma pessoa).
- Backend resolve a lista de `codChamado` no escopo pedido, depois busca o
  detalhe de cada um via `fetchDetalheChamado` **em lotes com concorrência
  limitada** (ex: 5 por vez) — evita disparar centenas de chamadas
  simultâneas pra API do Desk e ficar sujeito a rate limit/erro.
- Usuário já confirmou que aceita a espera extra (pode levar alguns
  segundos a mais em grupos grandes) em troca de sempre ter o dado
  completo — não há modo "rápido/parcial".
- Colunas do Excel: Código · Assunto · Descrição de abertura (texto
  completo) · Solicitante · Loja/Cliente · UF · Data de criação · Status
  do chamado · Distribuição (origem + nome) · Grupo · Urgência ·
  Observação do PCM · Data prevista de solução · Status de prazo.

## Fora de escopo (YAGNI por agora)

- Sem notificação/alerta automático de vencimento.
- Sem histórico de mudanças de atribuição — só o estado atual (se o PCM
  reatribuir, o valor anterior não fica registrado em lugar nenhum).
- Sem atribuição em lote (uma linha por vez, edição inline).
- Sem exportação "rápida/parcial" sem o texto de abertura — sempre completa.

## Pendências técnicas para a implementação

Estas duas coisas não são decisões de produto — são descobertas que só dá
pra confirmar inspecionando a resposta real da API do Desk Manager (mesmo
processo já documentado no projeto pra outros campos, ex: `_8575`/`_9637`):

1. **Nome exato do campo "Distribuição"** no payload de
   `/ChamadosSuporte/lista` (provavelmente algo como `NomeDistribuicao` ou
   um par de campos pessoa+grupo/fila) e se ele já traz um identificador
   estável da pessoa (não só o nome) — necessário pra popular
   `chave_pessoa` em `pcm_pessoas_grupo` sem colidir homônimos.
2. **Onde vive o texto de abertura do solicitante**: se é
   `TChamado.Descricao` (retornado por `POST /ChamadosSuporte`, chamado
   único) ou a primeira interação (`Descricao` da interação mais antiga,
   vinda de `dados_da_interacao_do_chamados`, o mesmo endpoint que
   `chamadoDetalhe.js` já usa pra buscar interações).

A primeira task do plano de implementação deve resolver essas duas
perguntas antes de qualquer código de schema/enriquecimento ser escrito.
