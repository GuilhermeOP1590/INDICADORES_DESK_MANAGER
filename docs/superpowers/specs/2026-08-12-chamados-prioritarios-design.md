# Chamados prioritários — design

## Contexto

O usuário quer marcar manualmente alguns chamados (pelo código, ex:
`0726-001231`) como "prioritários" — uma criticidade própria, definida por ele,
independente do campo `NomePrioridade` que já vem do Desk (esse é definido
no momento da abertura do chamado e nem sempre reflete o que realmente
importa acompanhar de perto depois). O objetivo é ter um lugar só pra ver e
controlar esse grupo pequeno e escolhido a dedo, sem se perder no volume geral
do sistema.

Decisões tomadas em conversa:

- Marcação = flag (está ou não na lista) + nota livre opcional (motivo, ex:
  "aguardando fornecedor").
- Adiciona colando o código do chamado num campo dedicado na aba nova — não
  via botão espalhado pelas outras telas.
- Chamado marcado continua na lista depois de resolvido (histórico), com
  filtro Aberto/Fechado/Todos pra focar no que ainda pede atenção.
- Conteúdo da aba: tabela detalhada (uma linha por chamado, com nota e ação de
  remover) + resumo simples no topo — não é um mini-dashboard com vários
  gráficos, é uma ferramenta de controle individual.
- Sistema não tem login — lista única, compartilhada, igual às outras
  configurações existentes (`configuracao-status.json`,
  `configuracao-equipamentos.json`).

## Arquitetura

### Backend

**`backend/src/services/prioridades.js`** (novo, mesmo padrão de
`configuracaoEquipamentos.js`):

- Persiste `{ chamados: [{ codChamado, nota, adicionadoEm }] }` em
  `backend/data/chamados-prioritarios.json`. Padrão vazio: `{ chamados: [] }`.
- `lerPrioridades()` / `salvarPrioridades(config)` — mesmo formato
  ler/salvar já usado nos outros serviços de configuração.
- `adicionarOuAtualizarPrioridade(codChamado, nota)` — *upsert* por
  `codChamado` (trim): se já existe, só atualiza a nota; se não existe,
  adiciona com `adicionadoEm: new Date().toISOString()`. Não precisamos de um
  endpoint separado só pra editar nota — adicionar de novo com nota diferente
  já resolve (YAGNI).
- `removerPrioridade(codChamado)` — filtra fora da lista.

**`backend/src/routes/indicadores.js`** — três rotas novas, todas devolvendo
o mesmo formato de payload (ver abaixo), pra o frontend nunca precisar de um
segundo fetch depois de escrever:

- `GET /api/prioritarios`
- `POST /api/prioritarios` — body `{ codChamado, nota }`. Antes de salvar,
  valida o código contra `carregarChamadosEnriquecidos()` (mesmo dataset
  enriquecido — Manutenção + Engenharia — usado por quase todo o resto do
  app); se não encontrar, `400 { erro: "Chamado <código> não encontrado" }`
  sem tocar no arquivo.
- `DELETE /api/prioritarios/:codChamado`

**Montagem do payload** (função `buildPrioritarios`, usada pelas 3 rotas):

1. `lerPrioridades().chamados` + `carregarChamadosEnriquecidos()` (join por
   `CodChamado`).
2. Para cada item: `codChamado`, `chave`, `assunto`, `status`, `situacao`
   (`classificarStatus`, mesmo critério do resto do app), `cliente`, `uf`,
   `area` (especialidade), `nota`, `adicionadoEm`, e:
   - se **aberto** (`!isFinalizado`): `diasEmAberto` = `(agora -
     parseDateTime(DataCriacao, HoraCriacao)) / 86400000`, arredondado;
     `tempoResolucaoHoras: null`.
   - se **finalizado**: `tempoResolucaoHoras` (mesmo cálculo já usado em
     `/dashboard/chamados`); `diasEmAberto: null`.
   - Se o código estiver na lista salva mas não for encontrado no dataset
     enriquecido (ex: chamado saiu do escopo Manutenção/Engenharia depois de
     marcado), a linha ainda aparece — com os campos que temos (código, nota,
     data) e `status: "não encontrado"` — em vez de sumir ou quebrar a rota.
3. Ordena: abertos primeiro (do `diasEmAberto` maior pro menor — parado há
   mais tempo primeiro), depois finalizados (por `adicionadoEm` desc).
4. `resumo`: `{ total, abertos, fechados, tempoMedioAbertoDias }` (média
   simples de `diasEmAberto` entre os abertos; `null` se não houver nenhum
   aberto).

Resposta: `{ resumo, chamados: [...] }`.

Filtro Aberto/Fechado/Todos é **só no frontend** (lista pequena, sem motivo
pra ir ao servidor de novo a cada clique de aba).

### Frontend

**`frontend/src/api.js`** — três funções novas, mesmo padrão das existentes:

```js
export function fetchPrioritarios() { return getJson("/api/prioritarios", {}); }
export async function adicionarPrioridade(codChamado, nota) { /* POST, mesmo padrão de salvarConfiguracaoStatus */ }
export async function removerPrioridade(codChamado) { /* DELETE */ }
```

**`frontend/src/pages/ChamadosPrioritarios.jsx`** (novo):

- `useState({status, payload, error})` + `useEffect` carregando no mount
  (sem depender de período/UF/busca global — é uma lista própria, à parte do
  resto do app).
- Formulário no topo: input texto (código do chamado) + input texto (nota,
  opcional) + botão "Adicionar". Erro de validação (código não encontrado)
  aparece **junto do formulário**, não como banner de página inteira — o
  resto da lista continua visível. Limpa os campos só em caso de sucesso.
- `StatTile` × 4: Total · Em aberto · Fechados · Tempo médio parado (dias).
- `SubTabs`: Abertos / Fechados / Todos — filtra `payload.chamados` no
  cliente pelo mesmo binário `isFinalizado` usado no resumo (não pelas 4
  categorias finas de `situacao` — "Aguardando Aprovação" conta como
  "Aberto" aqui), sem refetch.
- Tabela: Código · Assunto · Cliente · Status · Área · Tempo (`X dias em
  aberto` ou `Resolvido em Xh`, usando `formatHoras`/lógica já existente) ·
  Nota · botão "Remover" (chama `removerPrioridade`, sem modal de
  confirmação — é só tirar da lista de acompanhamento, não afeta o chamado
  real no Desk).
- Clique na linha (fora do botão remover) abre o detalhe do chamado —
  reaproveita `useDrillDown().abrirChamado({chave, codChamado})` +
  `Modal` + `DrillDownContent`, exatamente como as outras telas já fazem.

**`frontend/src/App.jsx`**: novo `NavLink` "Prioritários" (entre
"Performance" e "Configurações") + `<Route path="/prioritarios">`.

## Testes

- `backend/src/services/prioridades.test.js` (novo): upsert (adiciona novo,
  atualiza nota de existente), remoção, leitura com arquivo ausente
  (retorna padrão vazio).

## Fora de escopo (YAGNI por enquanto)

- Sem edição de nota como endpoint separado (upsert via POST resolve).
- Sem confirmação ao remover da lista (ação reversível e de baixo risco —
  só tira do acompanhamento, não mexe no chamado).
- Sem notificação/alerta automático (ex: e-mail se um prioritário passar N
  dias aberto) — só visualização e controle manual por enquanto.
- Sem limite de quantos chamados podem ser marcados.
- Não valida contra chamados fora do escopo Manutenção/Engenharia (mesmo
  escopo que o resto do sistema já usa).
