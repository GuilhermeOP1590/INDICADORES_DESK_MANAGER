# Orçamento por loja (navegação Loja → Especialidade → Categoria → Equipamento) — design

## Contexto

A tela de Orçamento já tem "Orçamento por região"
(`RegiaoOrcamentoPanel.jsx`): clica num card de UF, aparece um ranking de
lojas daquela UF (`porCliente`); clicar numa barra de loja abre direto a
lista de chamados daquela loja, sem nenhuma classificação a mais.

Pedido: ao chegar numa loja, poder abrir mais níveis — separar o custo por
**especialidade** (Manutenção/Engenharia), dentro dela por **categoria de
custo** (Refrigeração, Movimentação, Climatização, Portas etc para
Manutenção; Elétrica, Hidráulica, Civil etc para Engenharia — a taxonomia
de `tipoAtividade`) e, em Manutenção, mais um nível ainda: **equipamento
individual** dentro da categoria (ex: dentro de "Movimentação", ver
Empilhadeira, Carrinho de Compras, Paleteira...). Validado com um
protótipo clicável antes de fechar o desenho — ver decisões abaixo.

As categorias de Manutenção já existem e são configuráveis em
Configurações → Equipamentos (`configuracaoEquipamentos.js`, usadas hoje só
no painel "Por tipo de equipamento").

Decisões tomadas em conversa:

- **Navegação em pilha, uma tela por vez (breadcrumb)** — cada clique troca
  a tela inteira do modal, com "voltar" no topo. Mesmo padrão de pilha que
  o app já usa em todo lugar (`useDrillDown`/`Modal`/`DrillDownContent`).
  Alternativas descartadas: empilhar tudo na mesma tela (fica gigante) e
  tabela em árvore (componente novo, mais trabalho, sem ganho claro aqui).
- **3 valores em cada nível: aprovado / pendente / reprovado** — mesmo
  racional já aplicado em Equipamentos por Ic (`icsEquipamento.js`):
  reprovado fica visível mas fora da soma de custo real.
- **Entra dentro do painel "Orçamento por região" já existente** — não é
  um painel novo e separado. O que muda é só o que acontece ao clicar
  numa barra de loja: hoje abre a lista de chamados direto; passa a abrir
  a navegação Especialidade → Categoria → (Equipamento, só em Manutenção),
  chegando na lista de chamados só no fim.
- Categoria de Engenharia usa `tipoAtividade` diretamente (Elétrica,
  Hidráulica, Civil, Serralheria, Compras, Telhado) — Engenharia não tem
  conceito de "equipamento"/grupo, então a categoria já é o nível mais fino
  possível: **clicar numa categoria de Engenharia vai direto pros
  chamados**, sem nível de equipamento.
- Manutenção ganha um nível a mais: **categoria → equipamento → chamados**
  (equipamento individual, ex: "Empilhadeira" dentro de "Movimentação").
  Espelha exatamente o que a tela Equipamentos (Ic) já mostra por
  equipamento, só que agora alcançável a partir da loja.

Fora de escopo agora: comparação entre períodos nessa navegação (o
"Comparar com outro período" da tela de Orçamento não precisa cobrir essa
árvore).

## Arquitetura

### Backend

**`backend/src/services/orcamento.js`** ganha uma função nova,
`buildPorLojaOrcamento`, chamada de dentro de `buildOrcamento` e exposta
também para teste direto. Ela reclassifica os mesmos 3 grupos que
`buildOrcamento` já calcula (`aguardando` → renomeado `pendente` aqui,
`avaliados` → `aprovado`, `reprovados` → `reprovado`, mesma partição feita
por `foiReprovado`) e acumula em 3 ou 4 níveis aninhados (4º nível só pra
Manutenção) num único passe:

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

      // Só Manutenção tem "equipamento" — Engenharia para na categoria (tipoAtividade já é o
      // nível mais fino que existe pra ela).
      if (especialidade === "Manutenção") {
        const equipamento = c.equipamento || "Não informado";
        noCat.porEquipamento = noCat.porEquipamento ?? new Map();
        const noEquip = noCat.porEquipamento.get(equipamento) ?? novoNo({ equipamento });
        noCat.porEquipamento.set(equipamento, noEquip);
        acumular(noEquip, bucket, c, historicoMap);
      }
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
          porCategoria: [...esp.porCategoria.values()]
            .map((cat) => ({
              ...arredondarNo(cat),
              ...(cat.porEquipamento
                ? { porEquipamento: [...cat.porEquipamento.values()].map(arredondarNo).sort((a, b) => totalNo(b) - totalNo(a)) }
                : {}),
            }))
            .sort((a, b) => totalNo(b) - totalNo(a)),
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

**Nenhuma mudança nas rotas** (`/chamados` continua igual). O último clique
de cada ramo já é coberto pelos filtros que a rota `/chamados` já suporta:
`equipamento` (Manutenção, filtro que já existe) e `tipoAtividade`
(Engenharia, idem) — não precisa de filtro novo tipo `grupoEquipamento`,
porque a navegação nunca para na categoria pra Manutenção (sempre desce
até equipamento antes de listar chamados).

### Frontend

**`frontend/src/components/RegiaoOrcamentoPanel.jsx`**: troca a prop
`porCliente` por `porLoja` (o novo campo aninhado cobre o mesmo total que
`porCliente` dava, mais a árvore de especialidade/categoria/equipamento).
O `map` que monta `clientesDaRegiao` passa a incluir `porEspecialidade`:

```js
.map((l) => ({ label: l.cliente, total: l.aprovado.valor + l.pendente.valor, porEspecialidade: l.porEspecialidade }))
```

`Orcamento.jsx` passa `porLoja={payload.porLoja}` no lugar de
`porCliente={payload.porCliente}`.

**`frontend/src/components/MaximizableChart.jsx`**: a função `selecionar`
ganha mais um `else if`, antes do fallback genérico. Reaproveita
`filtroBase`/`dimensaoFiltro`, já disponíveis no escopo da função — é
assim que o filtro (cliente + uf + período + busca, herdados da tela de
Orçamento) começa a viajar pelos próximos níveis, sem precisar buscar de
novo em lugar nenhum:

```js
} else if (entry?.porEspecialidade) {
  drill.abrirResumoLojaOrcamento(entry.porEspecialidade, label, { ...filtroBase, [dimensaoFiltro]: label });
}
```

Mesmo estilo do `else if (entry?.itens)` que já existe ali — a decisão de
qual tela abrir é dirigida pelo formato dos dados, não por mais uma prop
booleana.

**`frontend/src/lib/useDrillDown.js`**: 3 funções novas, mesmo estilo de
`abrirSubRanking`/`abrirResumoBacklog` (dado já em mãos, sem fetch,
empilha sobre a pilha atual). Cada uma carrega `filtroBase` além dos dados
de exibição — é o que fecha o filtro final sem precisar reconstruí-lo do
zero na última tela:

```js
function abrirResumoLojaOrcamento(porEspecialidade, titulo, filtroBase) {
  setPilha((p) => [...(p ?? []), { tipo: "resumoLojaOrcamento", porEspecialidade, titulo, filtroBase }]);
}

function abrirResumoCategoriaOrcamento(porCategoria, titulo, filtroBase) {
  setPilha((p) => [...(p ?? []), { tipo: "resumoCategoriaOrcamento", porCategoria, titulo, filtroBase }]);
}

function abrirResumoEquipamentoOrcamento(porEquipamento, titulo, filtroBase) {
  setPilha((p) => [...(p ?? []), { tipo: "resumoEquipamentoOrcamento", porEquipamento, titulo, filtroBase }]);
}
```

**`frontend/src/components/DrillDownContent.jsx`**: 3 blocos novos,
reaproveitando `RankingTable` (o mesmo componente que já mostra
aprovado/pendente/reprovado como colunas extras em Equipamentos por Ic —
não precisa de tabela nova) e uma constante `formatBRL` local (mesmo
padrão ad-hoc já repetido em cada página do app — este arquivo ainda não
tinha precisado dela). Recebe 2 props opcionais a mais,
`onAbrirResumoCategoria` e `onAbrirResumoEquipamento`. Essas props são
conectadas **dentro de `MaximizableChart.jsx`**, que é quem instancia
`<DrillDownContent>` — como `MaximizableChart` é um componente único
reaproveitado em várias telas (Manutenção, Engenharia, Orçamento...), a
conexão é incondicional pra todo mundo, não só pra `RegiaoOrcamentoPanel`.
Isso é inofensivo: nas demais telas `topo.tipo` nunca vira
`resumoLojaOrcamento` (só acontece quando `entry.porEspecialidade` existe
no dado clicado, o que só ocorre no gráfico "Custo por unidade" dentro de
`RegiaoOrcamentoPanel`), então essas props simplesmente nunca são chamadas
ali.

```jsx
const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLUNAS_ORCAMENTO = [
  { header: "Aprovado", render: (d) => formatBRL(d.aprovadoValor), sortKeyName: "aprovadoValor" },
  { header: "Pendente", render: (d) => formatBRL(d.pendenteValor), sortKeyName: "pendenteValor" },
  { header: "Reprovado", render: (d) => (d.reprovadoValor > 0 ? formatBRL(d.reprovadoValor) : "—"), sortKeyName: "reprovadoValor" },
];

function linhaOrcamento(no, label) {
  return {
    label,
    total: no.aprovado.valor + no.pendente.valor,
    aprovadoValor: no.aprovado.valor,
    pendenteValor: no.pendente.valor,
    reprovadoValor: no.reprovado.valor,
  };
}

if (topo?.tipo === "resumoLojaOrcamento") {
  const linhas = topo.porEspecialidade.map((e) => ({ ...linhaOrcamento(e, e.especialidade), porCategoria: e.porCategoria }));
  return (
    <RankingTable
      data={linhas}
      nomeColuna="Especialidade"
      formatValue={formatBRL}
      colunasExtras={COLUNAS_ORCAMENTO}
      onSelecionar={(_label, _agregado, linha) =>
        onAbrirResumoCategoria(linha.porCategoria, `${topo.titulo} — ${linha.label}`, { ...topo.filtroBase, especialidade: linha.label })
      }
    />
  );
}

if (topo?.tipo === "resumoCategoriaOrcamento") {
  const linhas = topo.porCategoria.map((c) => ({ ...linhaOrcamento(c, c.categoria), porEquipamento: c.porEquipamento }));
  return (
    <RankingTable
      data={linhas}
      nomeColuna="Categoria de custo"
      formatValue={formatBRL}
      colunasExtras={COLUNAS_ORCAMENTO}
      onSelecionar={(_label, _agregado, linha) =>
        linha.porEquipamento
          ? onAbrirResumoEquipamento(linha.porEquipamento, `${topo.titulo} — ${linha.label}`, topo.filtroBase)
          : onAbrirLista({ ...topo.filtroBase, tipoAtividade: linha.label }, linha.label)
      }
    />
  );
}

if (topo?.tipo === "resumoEquipamentoOrcamento") {
  const linhas = topo.porEquipamento.map((e) => linhaOrcamento(e, e.equipamento));
  return (
    <RankingTable
      data={linhas}
      nomeColuna="Equipamento"
      formatValue={formatBRL}
      colunasExtras={COLUNAS_ORCAMENTO}
      onSelecionar={(label) => onAbrirLista({ ...topo.filtroBase, equipamento: label }, label)}
    />
  );
}
```

`statusAprovacao: "comOrcamento"` **não precisa ser adicionado de novo em
nenhum desses pontos** — já está dentro do `filtroBase` original, montado
lá em `RegiaoOrcamentoPanel` (`filtroBase={{ ...filtroBase, uf:
regiaoSelecionada, statusAprovacao: "comOrcamento" }}`) e propagado por
`{ ...topo.filtroBase, ... }` em cada nível. O mesmo vale pra `cliente` e
`uf`: entram no primeiro clique (na barra da loja) e chegam intactos até a
última tela, então a lista final nunca mistura chamados de outra loja.

## Testes

- `backend/src/services/orcamento.test.js`: `buildPorLojaOrcamento` —
  agrupa por loja → especialidade → categoria → equipamento (só
  Manutenção); separa aprovado/pendente/reprovado em cada nível; Manutenção
  usa `grupoDoEquipamento` (incluindo fallback "Não classificado");
  Engenharia usa `tipoAtividade` (incluindo fallback "Não classificado"
  pra tipoAtividade vazio) e **não** tem `porEquipamento` no nó da
  categoria; ordena cada nível por aprovado+pendente decrescente; reprovado
  não entra no total usado pra ordenar.
- Sem teste de rota novo — nenhum filtro novo foi adicionado a `/chamados`
  (ver Arquitetura/Backend acima).

## Fluxo de dados (resumo)

```
GET /api/orcamento
  → buildOrcamento(chamados, historicoMap)
      → ... (aguardando/avaliados/reprovados, como já existia)
      → porLoja: buildPorLojaOrcamento(chamados, historicoMap)
           loja → porEspecialidade → porCategoria → porEquipamento (só Manutenção)
           aprovado/pendente/reprovado em cada nível

Clique na barra de loja (RegiaoOrcamentoPanel, dentro do MaximizableChart "Custo por unidade")
  filtroBase de entrada já traz: uf, statusAprovacao: "comOrcamento", período, busca (herdados da tela de Orçamento)
  → drill.abrirResumoLojaOrcamento(loja.porEspecialidade, loja.cliente, { ...filtroBase, cliente: loja.cliente })
  → RankingTable (Especialidade) — sem fetch, dado já no payload
  → clique numa linha → drill.abrirResumoCategoriaOrcamento(especialidade.porCategoria, ..., { ...filtroBase, especialidade })
  → RankingTable (Categoria de custo) — sem fetch
  → clique numa linha:
      Manutenção (tem porEquipamento) → drill.abrirResumoEquipamentoOrcamento(..., filtroBase)
        → RankingTable (Equipamento) — sem fetch
        → clique numa linha → onAbrirLista({ ...filtroBase, equipamento })
      Engenharia (sem porEquipamento) → onAbrirLista({ ...filtroBase, tipoAtividade })
  → GET /api/chamados (fetch de verdade, tela final igual ao resto do app — já mostra
    Código/Assunto/Status/Prioridade/Datas/Cliente/Empresa/Solicitante/Operador/Valor)
```
