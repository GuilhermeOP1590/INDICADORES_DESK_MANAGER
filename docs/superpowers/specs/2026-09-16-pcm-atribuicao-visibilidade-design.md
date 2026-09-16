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
- **Edição:** inline, direto nas células da tabela (dropdown de urgência,
  input de observação, date picker de data prevista) — salva ao trocar,
  sem botão "Salvar" separado. **Grupo não é editável por chamado** — é
  sempre derivado da pessoa (que pertence a um único grupo, definido na
  aba "Pessoas/Grupos"); editar o grupo de um chamado individualmente
  quebraria essa regra e poderia deixar o mesmo grupo com significados
  diferentes em telas diferentes. Editar qualquer um dos 3 campos acima
  já é suficiente pra marcar o chamado como "✋ Atribuído pelo PCM" —
  não é preciso reatribuir pessoa/grupo pra isso.
- Se a pessoa que está com o chamado (distribuição do sistema) ainda não
  tem grupo mapeado ("Sem grupo definido"), a edição inline é bloqueada
  com uma mensagem pedindo pra mapear essa pessoa primeiro na aba
  "Pessoas/Grupos" — evita salvar uma atribuição sem grupo válido.
- **Indicador em 2 níveis**, pra não virar uma lista ilegível quando um
  grupo tiver muita gente:
  - Nível 1 — cards por grupo (total de pessoas + breakdown por urgência).
  - Nível 2 — ao clicar num grupo, matriz **Pessoa × Urgência** só das
    pessoas daquele grupo, com linha de total. Clicar numa célula abre a
    lista de chamados daquele cruzamento (reaproveita `useDrillDown`/
    `Modal`/`DrillDownContent` já existentes).
- **Exportação Excel** faz parte do escopo (não é "fora de escopo"): botão
  disponível tanto na visão de um **grupo** quanto na de uma **pessoa**,
  sempre com os dados completos, inclusive o texto de abertura do
  solicitante (ver seção "Exportação Excel" abaixo — acabou sendo
  instantâneo, sem custo extra de API).
- **Filtro Aberto/Fechado/Todos**, compartilhado pela aba "Atribuições" e
  pela aba "Por grupo" (mesmo filtro, aplicado nas duas). Padrão: **Aberto**
  — o objetivo principal é ver a carga de trabalho atual, não acumular
  chamados já resolvidos pra sempre nos indicadores por pessoa.
- **Sistema não tem login** — mesmo padrão do resto do app (lista única e
  compartilhada, sem usuário/senha). Não faz parte deste projeto introduzir
  autenticação.

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
create table pcm_grupos (
  nome text primary key,
  criado_em timestamptz not null default now()
);

insert into pcm_grupos (nome) values ('Manutenção'), ('Engenharia'), ('SESMT');

create table pcm_pessoas_grupo (
  chave_pessoa text primary key,  -- nome completo do operador (NomeOperador+SobrenomeOperador) — o Desk não expõe um ID numérico na lista, e o resto do projeto já trata "operador" só pelo nome
  grupo text not null references pcm_grupos (nome),
  atualizado_em timestamptz not null default now()
);

create table pcm_atribuicoes_chamados (
  cod_chamado text primary key,
  grupo text not null references pcm_grupos (nome),
  pessoa text not null,           -- chave_pessoa de pcm_pessoas_grupo
  urgencia text not null check (urgencia in ('Crítica', 'Alta', 'Média', 'Baixa')),
  observacao text,
  data_prevista_solucao date,
  atualizado_em timestamptz not null default now()
);
```

`pcm_grupos` já nasce com os 3 grupos citados na conversa (Manutenção,
Engenharia, SESMT), mas **não é uma lista fixa** — é editável pela tela
"Pessoas/Grupos" (ver Frontend abaixo), exatamente como a lista `grupos` de
`configuracaoEquipamentos.js` já é hoje. A referência (`references
pcm_grupos (nome)`) garante que ningém consiga atribuir pessoa/chamado a um
grupo que não existe.

Só existe uma linha em `pcm_atribuicoes_chamados` **quando o PCM edita algo**
naquele chamado — chamados intocados não geram linha.

> **Confirmado inspecionando a API real do Desk (2026-09-16):** a coluna
> "Distribuição" do Desk não é um campo próprio — é a junção visual de dois
> campos que **já existem** no payload de `/ChamadosSuporte/lista` e já são
> usados em outras partes do projeto: `NomeOperador`+`SobrenomeOperador`
> (mesmo helper `nomeOperador()` já usado em `indicadores.js`/
> `indicadoresPorTaxonomia.js`) na primeira linha, e `NomeGrupo` (ex:
> "MANUTENÇÃO - GERAL", "CORRETIVAS BA" — fila interna do Desk por tipo/
> região) na segunda. **`NomeGrupo` não é o "grupo" que este projeto
> define** (Manutenção/Engenharia/SESMT como times de pessoas do PCM) — é
> ignorado. `distribuicaoSistema` é simplesmente `nomeOperador(chamado)`,
> sem nenhuma extração nova.
>
> Isso também resolve a identidade de "pessoa": o endpoint de lista não traz
> nenhum identificador numérico do operador (só nome+sobrenome). Seguindo a
> mesma convenção já usada em todo o projeto pra "operador" (agrupado só
> pelo nome, sem chave numérica), `chave_pessoa` em `pcm_pessoas_grupo` é o
> **nome completo do operador** (string), não um ID do Desk — não existe ID
> disponível na lista, e inventar uma busca por ID no endpoint de detalhe só
> pra isso seria complexidade sem ganho real (o resto do app já aceita o
> mesmo risco de homônimo pra "operador").

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
- `backend/src/services/pcmPessoas.js` — ler/upsert `pcm_pessoas_grupo` +
  ler/criar `pcm_grupos` (`listarGrupos()`, `criarGrupo(nome)` — insere
  ignorando duplicata, mesmo padrão de `adicionarGrupo` já usado na
  configuração de equipamentos, mas gravando em tabela em vez de array).
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
  - Filtro **Aberto/Fechado/Todos** no topo da página (acima das sub-abas,
    ao lado de "PCM"), compartilhado por "Atribuições" e "Por grupo" — só
    no cliente (mesmo dataset já carregado), padrão **Aberto**. Segue o
    mesmo binário `isFinalizado` já usado em Chamados Prioritários (não as
    4 categorias finas de situação).
  - **"Atribuições"** — 4 `StatTile` no topo (Atrasados · Vence esta semana
    · No prazo · Sem data) + tabela com coluna "Grupo" somente leitura
    (derivada da pessoa) e edição inline nas 3 colunas que o PCM controla
    (dropdown de urgência, input de observação, date picker de data
    prevista), badge colorido de status de prazo, ícone 🖥/✋ de origem.
    Clicar num `StatTile` filtra a tabela.
  - **"Por grupo"** — Nível 1: cards por grupo (contagem já respeitando o
    filtro Aberto/Fechado/Todos ativo). Nível 2 (ao clicar num card): matriz
    Pessoa × Urgência daquele grupo, com botão "Exportar Excel" (grupo
    inteiro) e, ao clicar numa linha de pessoa, abre a lista de chamados
    daquela pessoa com seu próprio botão "Exportar Excel".
  - **"Pessoas/Grupos"** — tela de configuração: lista de pessoas (busca
    puxando do Desk, mesmo dataset já usado pra `distribuicaoSistema`) +
    seletor de grupo pra cada uma. Mesmo padrão visual da configuração de
    equipamentos já existente. Pessoas detectadas na Distribuição do Desk
    que ainda não têm grupo definido aparecem destacadas no topo da lista
    (não é preciso caçar manualmente quem falta classificar).
    - **Criar novo grupo:** campo "Nome do novo grupo..." + botão "+ Novo
      grupo", reaproveitando exatamente a UX que já existe em
      `ConfiguracaoEquipamentos.jsx` (input + `adicionarGrupo()`) — só que
      aqui grava em `pcm_grupos` em vez de num array dentro de um blob.
      Assim que criado, o grupo já aparece no seletor de qualquer pessoa —
      e, a partir daí, qualquer chamado dessa pessoa passa a mostrar esse
      grupo (somente leitura) na aba "Atribuições".
- `frontend/src/api.js` — funções novas seguindo o padrão existente
  (`fetchPcmAtribuicoes`, `salvarPcmAtribuicao`, `fetchPcmPessoasGrupo`,
  `salvarPcmPessoaGrupo`, `fetchPcmIndicadorGrupo`, `fetchPcmExportar`).

## Exportação Excel

Reaproveita `frontend/src/lib/exportExcel.js` (já existe, criado na feature
de SLA por nível) — o frontend só chama `exportarLinhas(linhas, colunas,
nomeArquivo)` com o que o backend devolver, sem lógica de xlsx nova no
cliente.

**Correção importante em relação à primeira versão desta spec:** o texto
de abertura do solicitante **já vem no próprio endpoint de lista**
(`/ChamadosSuporte/lista` devolve `Descricao` — confirmado inspecionando a
API real em 2026-09-16), com o mesmo conteúdo do endpoint de detalhe
(só que já sem entidades HTML: a lista devolve `"...corredor de
funcionários..."`, o detalhe devolve `"...funcion&aacute;rios..."`). Ou
seja, **não há custo extra nenhum** — é só mais um campo no mesmo dataset
que `carregarChamadosEnriquecidos()` já carrega e cacheia (5 min) pra tudo
o resto do sistema. Não existe modo "rápido" vs "completo": é sempre
instantâneo, sem chamada adicional à API do Desk por chamado.

- `enriquecimento.js` passa a anexar `descricaoAbertura: chamado.Descricao`
  junto dos outros campos já anexados (`cliente`, `uf`, etc.) — nenhuma
  chamada de rede nova.
- `GET /api/pcm/exportar?grupo=X` (grupo inteiro) ou
  `GET /api/pcm/exportar?grupo=X&pessoa=Y` (uma pessoa) — resolve a lista
  de chamados no escopo pedido a partir do dataset já em memória e devolve
  as linhas prontas pro Excel.
- Colunas do Excel: Código · Assunto · Descrição de abertura · Solicitante
  · Loja/Cliente · UF · Data de criação · Status do chamado · Distribuição
  (origem + nome) · Grupo · Urgência · Observação do PCM · Data prevista de
  solução · Status de prazo.

## Testes

Seguindo a convenção já usada no projeto (`node:test`, um arquivo
`*.test.js` por serviço, cobrindo só a lógica pura — sem framework de teste
no frontend, verificação manual no navegador):

- `backend/src/services/prazo.test.js` — `classificarPrazo`: atrasado, vence
  esta semana (limites segunda/domingo), no prazo, sem data.
- `backend/src/services/pcmAtribuicoes.test.js` — upsert por `cod_chamado`
  (cria novo, atualiza existente), `buildIndicadorPorGrupo`/
  `buildIndicadorPorPessoa` (contagem por urgência, bucket "Sem urgência
  definida", respeita filtro aberto/fechado recebido).
- `backend/src/services/pcmPessoas.test.js` — upsert de grupo por pessoa,
  leitura com tabela vazia (retorna lista vazia, não erro).
- `backend/src/services/enriquecimento.test.js` (adiciona casos) — anexa
  `distribuicaoSistema` extraindo só o nome da pessoa, ignorando a
  fila/time do Desk (ver aviso na seção "Modelo de dados").

## Fora de escopo (YAGNI por agora)

- Sem notificação/alerta automático de vencimento.
- Sem histórico de mudanças de atribuição — só o estado atual (se o PCM
  reatribuir, o valor anterior não fica registrado em lugar nenhum).
- Sem atribuição em lote (uma linha por vez, edição inline).

## Pendências técnicas — resolvidas

As duas pendências da primeira versão desta spec (nome exato do campo
"Distribuição" e onde vive o texto de abertura) já foram resolvidas
inspecionando a API real do Desk Manager (`/ChamadosSuporte/lista`) em
2026-09-16 — ver os destaques nas seções "Modelo de dados" e "Exportação
Excel" acima. Resumo:

- "Distribuição" = `NomeOperador`+`SobrenomeOperador` (pessoa) + `NomeGrupo`
  (fila do Desk, não usada). Nenhum campo novo, nenhuma extração nova.
- Texto de abertura = `Descricao`, já presente no próprio endpoint de
  lista (mesmo dataset cacheado que todo o resto do sistema usa).
- Identidade de pessoa (`chave_pessoa`) = nome completo do operador
  (string), pela mesma razão que o resto do projeto já usa nome em vez de
  ID pra "operador": o endpoint de lista não expõe nenhum ID numérico.

Não há mais nenhuma descoberta pendente para o plano de implementação.
