# Orçamento por loja (navegação Loja → Especialidade → Categoria) — design

## Contexto

A tela de Orçamento já tem "Orçamento por região"
(`RegiaoOrcamentoPanel.jsx`): clica num card de UF, aparece um ranking de
lojas daquela UF (`porCliente`); clicar numa barra de loja abre direto a
lista de chamados daquela loja, sem nenhuma classificação a mais.

Pedido: ao chegar numa loja, poder abrir mais um nível — separar o custo
por **especialidade** (Manutenção/Engenharia) e, dentro dela, por
**categoria de custo** (Refrigeração, Movimentação, Climatização, Portas
etc para Manutenção; Elétrica, Hidráulica, Civil etc para Engenharia — a
taxonomia de `tipoAtividade`). As categorias de Manutenção já existem e são
configuráveis em Configurações → Equipamentos (`configuracaoEquipamentos.js`,
usadas hoje só no painel "Por tipo de equipamento").

Decisões tomadas em conversa:

- **Navegação em pilha, uma tela por vez (breadcrumb)** — cada clique troca
  a tela inteira do modal (Loja → Especialidade → Categoria → chamados),
  com "voltar" no topo. Mesmo padrão de pilha que o app já usa em todo
  lugar (`useDrillDown`/`Modal`/`DrillDownContent`), só que com dois níveis
  novos empilhados antes de chegar na lista de chamados. Alternativas
  descartadas: empilhar tudo na mesma tela (fica gigante com 3 níveis) e
  tabela em árvore (componente novo, mais trabalho, sem ganho claro aqui).
- **3 valores em cada nível: aprovado / pendente / reprovado** — mesmo
  racional já aplicado em Equipamentos por Ic (`icsEquipamento.js`):
  reprovado fica visível mas fora da soma de custo real.
- **Entra dentro do painel "Orçamento por região" já existente** — não é
  um painel novo e separado. O que muda é só o que acontece ao clicar
  numa barra de loja: hoje abre a lista de chamados direto; passa a abrir
  a navegação Especialidade → Categoria, chegando na lista de chamados só
  no fim.
- Categoria de Engenharia usa `tipoAtividade` diretamente (Elétrica,
  Hidráulica, Civil, Serralheria, Compras, Telhado) — Engenharia não tem
  conceito de "equipamento"/grupo, então não há mapeamento a fazer, é a
  taxonomia que já existe.

Fora de escopo agora: ir um nível além de categoria (ex: por equipamento
individual dentro da categoria) — quem quiser esse detalhe já pode usar a
tela Equipamentos (Ic); comparação entre períodos nessa navegação (o
"Comparar com outro período" da tela de Orçamento não precisa cobrir essa
árvore).

## Arquitetura

### Backend

**`backend/src/services/orcamento.js`** ganha uma função nova,
`buildPorLojaOrcamento`, chamada de dentro de `buildOrcamento` e exposta
também para teste direto. Ela reclassifica os mesmos 3 grupos que
`buildOrcamento` já calcula (`aguardando` → renomeado `pendente` aqui,
`avaliados` → `aprovado`, `reprovados` → `reprovado`, mesma partição feita
por `foiReprovado`) e acumula em 3 níveis aninhados num único passe:

```js
import { grupoDoEquipamento, lerConfiguracaoEquipamentos } from "./configuracaoEquipamentos.js";

function chaveCategoria(chamado, equipConfig) {
  if (chamado.especialidade === "Engenharia") return chamado.tipoAtividade || "Não classificado";
  return grupoDoEquipamento(chamado.equipamento, equipConfig); // já cai em "Não classificado" sozinho
}

function bucketVazio() {
  return { total: 0, valor: 0 };
}

function novoNo(camposExtra) {
  return { ...camposExtra, aprovado: bucketVazio(), pendente: bucketVazio(), reprovado: bucketVazio() };
}

function acumular(no, bucket, chamado, historicoMap) {
  no[bucket].total += 1;
  no[bucket].valor += valorDe(historicoMap, chamado); // valorDe já existe no arquivo
}

// Some do custo "real": aprovado + pendente. Reprovado fica de fora do ranking (mesmo
// racional de buildOrcamento/icsEquipamento — visível, mas não conta como comprometido).
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
      acumular(noLoja, bucket, c, historicoMap);

      const noEsp = noLoja.porEspecialidade.get(especialidade) ?? novoNo({ especialidade, porCategoria: new Map() });
      noLoja.porEspecialidade.set(especialidade, noEsp);
      acumular(noEsp, bucket, c, historicoMap);

      const noCat = noEsp.porCategoria.get(categoria) ?? novoNo({ categoria });
      noEsp.porCategoria.set(categoria, noCat);
      acumular(noCat, bucket, c, historicoMap);
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
          porCategoria: [...esp.porCategoria.values()].map(arredondarNo).sort((a, b) => totalNo(b) - totalNo(a)),
        }))
        .sort((a, b) => totalNo(b) - totalNo(a)),
    }))
    .sort((a, b) => totalNo(b) - totalNo(a));
}
```

`buildOrcamento` ganha uma linha a mais no objeto retornado:
`porLoja: buildPorLojaOrcamento(chamados, historicoMap)`. O `porCliente`
que já existe **não muda e não sai do payload** — só deixa de ser o que
`RegiaoOrcamentoPanel` usa pro ranking de loja (ver frontend abaixo).

**`backend/src/routes/indicadores.js`**, rota `/chamados`: ganha o filtro
`grupoEquipamento` (mesmo nível dos já existentes `tipo`/`tipoAtividade`),
necessário pro último clique (categoria → lista de chamados) em Manutenção:

```js
if (grupoEquipamento) filtrados = filtrados.filter((c) => grupoDoEquipamento(c.equipamento) === grupoEquipamento);
```

(precisa importar `grupoDoEquipamento` de `../services/configuracaoEquipamentos.js`
nesse arquivo). Em Engenharia o último clique já é coberto pelo filtro
`tipoAtividade`, que a rota já suporta.

### Frontend

**`frontend/src/components/RegiaoOrcamentoPanel.jsx`**: troca a prop
`porCliente` por `porLoja` (o novo campo aninhado cobre o mesmo total que
`porCliente` dava, mais a árvore de especialidade/categoria). O `map` que
monta `clientesDaRegiao` passa a incluir `porEspecialidade`:

```js
.map((l) => ({ label: l.cliente, total: l.aprovado.valor + l.pendente.valor, porEspecialidade: l.porEspecialidade }))
```

`Orcamento.jsx` passa `porLoja={payload.porLoja}` no lugar de
`porCliente={payload.porCliente}`.

**`frontend/src/components/MaximizableChart.jsx`**: a função `selecionar`
(dispara ao clicar numa barra/linha do ranking maximizado) ganha mais um
`else if`, antes do fallback genérico:

```js
} else if (entry?.porEspecialidade) {
  drill.abrirResumoLojaOrcamento(entry.porEspecialidade, label);
}
```

Mesmo estilo do `else if (entry?.itens)` que já existe ali (ranking de
equipamentos dentro de um grupo) — a decisão de qual tela abrir é dirigida
pelo formato dos dados, não por mais uma prop booleana.

**`frontend/src/lib/useDrillDown.js`**: 2 funções novas, mesmo estilo de
`abrirSubRanking`/`abrirResumoBacklog` (dado já em mãos, sem fetch,
empilha sobre a pilha atual):

```js
function abrirResumoLojaOrcamento(porEspecialidade, titulo) {
  setPilha((p) => [...(p ?? []), { tipo: "resumoLojaOrcamento", porEspecialidade, titulo }]);
}

function abrirResumoCategoriaOrcamento(porCategoria, titulo) {
  setPilha((p) => [...(p ?? []), { tipo: "resumoCategoriaOrcamento", porCategoria, titulo }]);
}
```

**`frontend/src/components/DrillDownContent.jsx`**: 2 blocos novos,
reaproveitando `RankingTable` (o mesmo componente que já mostra
aprovado/pendente/reprovado como colunas extras em Equipamentos por Ic —
não precisa de tabela nova). Recebe uma prop opcional a mais,
`onAbrirResumoCategoria` (só o chamador que efetivamente abre telas de
orçamento por loja — `MaximizableChart.jsx` dentro de
`RegiaoOrcamentoPanel` — passa essa prop; os demais usos de
`DrillDownContent` no app continuam sem ela, sem quebrar nada, porque
`topo.tipo` nunca vira `resumoLojaOrcamento` fora desse fluxo):

```jsx
if (topo?.tipo === "resumoLojaOrcamento") {
  const linhas = topo.porEspecialidade.map((e) => ({
    label: e.especialidade,
    total: e.aprovado.valor + e.pendente.valor,
    aprovadoValor: e.aprovado.valor,
    pendenteValor: e.pendente.valor,
    reprovadoValor: e.reprovado.valor,
    porCategoria: e.porCategoria,
  }));
  return (
    <RankingTable
      data={linhas}
      nomeColuna="Especialidade"
      formatValue={formatBRL}
      colunasExtras={COLUNAS_ORCAMENTO}
      onSelecionar={(_label, _agregado, linha) =>
        onAbrirResumoCategoria(linha.porCategoria, `${topo.titulo} — ${linha.label}`)
      }
    />
  );
}

if (topo?.tipo === "resumoCategoriaOrcamento") {
  const linhas = topo.porCategoria.map((c) => ({
    label: c.categoria,
    total: c.aprovado.valor + c.pendente.valor,
    aprovadoValor: c.aprovado.valor,
    pendenteValor: c.pendente.valor,
    reprovadoValor: c.reprovado.valor,
  }));
  return (
    <RankingTable
      data={linhas}
      nomeColuna="Categoria de custo"
      formatValue={formatBRL}
      colunasExtras={COLUNAS_ORCAMENTO}
      onSelecionar={(label) => onAbrirLista({ ...filtroChamadoFinal(topo, label) }, label)}
    />
  );
}
```

`COLUNAS_ORCAMENTO` é o array `[{header:"Aprovado",...}, {header:"Pendente",...}, {header:"Reprovado",...}]`
— mesmo padrão de `colunasExtras` já usado em `EquipamentosPorIc.jsx`.

O ponto que falta amarrar no plano de implementação: o filtro final
(categoria → chamados) precisa saber loja + especialidade + se o campo é
`grupoEquipamento` (Manutenção) ou `tipoAtividade` (Engenharia) — por isso
`abrirResumoLojaOrcamento`/`abrirResumoCategoriaOrcamento` carregam esse
contexto junto (loja/UF na primeira chamada, especialidade na segunda),
não só os dados de exibição. O plano detalha os campos exatos de cada
frame da pilha.

## Testes

- `backend/src/services/orcamento.test.js`: `buildPorLojaOrcamento` —
  agrupa por loja → especialidade → categoria; separa aprovado/pendente/
  reprovado; Manutenção usa `grupoDoEquipamento` (incluindo fallback "Não
  classificado"); Engenharia usa `tipoAtividade` (incluindo fallback "Não
  classificado" pra tipoAtividade vazio); ordena cada nível por
  aprovado+pendente decrescente; reprovado não entra no total usado pra
  ordenar.
- Rota `/chamados`: sem teste próprio (padrão do projeto), mas o filtro
  `grupoEquipamento` deve ser verificado manualmente via curl antes de dar
  a implementação por concluída (mesmo processo usado nas features
  anteriores desta sessão).

## Fluxo de dados (resumo)

```
GET /api/orcamento
  → buildOrcamento(chamados, historicoMap)
      → ... (aguardando/avaliados/reprovados, como já existia)
      → porLoja: buildPorLojaOrcamento(chamados, historicoMap)
           loja → porEspecialidade → porCategoria (aprovado/pendente/reprovado em cada nível)

Clique na barra de loja (RegiaoOrcamentoPanel, dentro do MaximizableChart "Custo por unidade")
  → drill.abrirResumoLojaOrcamento(loja.porEspecialidade, loja.cliente)
  → RankingTable (Especialidade) — sem fetch, dado já no payload
  → clique numa linha → drill.abrirResumoCategoriaOrcamento(especialidade.porCategoria, ...)
  → RankingTable (Categoria de custo) — sem fetch
  → clique numa linha → onAbrirLista({ cliente, especialidade, uf, [grupoEquipamento|tipoAtividade]: categoria, statusAprovacao: "comOrcamento" })
  → GET /api/chamados (fetch de verdade, tela final igual ao resto do app)
```
