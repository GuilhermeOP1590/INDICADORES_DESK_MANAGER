# Classificação de Equipamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar o campo livre `equipamento` (89 valores distintos hoje) em ~7 categorias configuráveis, simplificar o painel "Por equipamento" de Manutenção pra um ranking por grupo com drill-down em dois níveis (grupo → equipamento específico → chamados), e criar a tela de Configurações onde esses grupos são mantidos.

**Architecture:** Novo serviço de configuração (`configuracaoEquipamentos.js`, espelha `configuracaoIndicadores.js`) guarda `{grupos, atribuicoes}` num JSON em `backend/data/`. A agregação por grupo é calculada sob demanda a partir do `equipamento` já presente no chamado enriquecido — sem alterar o pipeline de enriquecimento nem o schema do chamado. O segundo nível do drill-down (equipamento específico → chamados) reaproveita 100% o fluxo `dimensaoFiltro="equipamento"` que já existe hoje; só o primeiro nível (grupo → lista de equipamentos do grupo) é novo, e usa dados que já vêm no payload — zero fetch extra.

**Tech Stack:** Node.js (Express, ESM) no backend; React + Vite + Recharts no frontend; `node:test` para testes backend; sem framework de teste no frontend (verificação manual pelo navegador).

## Global Constraints

- Backend é ESM puro (`"type": "module"` no `package.json`) — sempre `import`/`export`, nunca `require`.
- Testes backend usam `node:test` + `node:assert/strict`, em arquivo `*.test.js` ao lado do código testado — descoberto automaticamente por `npm test` (`node --test "src/**/*.test.js"`, rodado de dentro de `backend/`).
- Sem TypeScript em nenhuma parte do projeto.
- Toda string de interface, comentário e mensagem de erro em português.
- Frontend não tem framework de teste configurado — verificação de UI é manual: servidor dev do frontend já roda em `http://localhost:5173`, backend em `http://localhost:3001` (`node --watch`, recarrega sozinho a cada edição salva), proxy `/api` → backend configurado em `frontend/vite.config.js`.
- Seguir os padrões visuais e de componente já existentes (classes de `styles.css`, componentes `SubTabs`, `Modal`, `HorizontalBarChart`, `RankingTable`) em vez de introduzir um padrão novo.
- Sem validação de payload em rotas PUT de configuração — o código irmão (`configuracaoIndicadores.js`/`/configuracao/status`) não valida, e o plano segue a mesma convenção.

---

### Task 1: Serviço de configuração de equipamentos (backend)

**Files:**
- Create: `backend/src/services/configuracaoEquipamentos.js`
- Test: `backend/src/services/configuracaoEquipamentos.test.js`

**Interfaces:**
- Consumes: nada (módulo novo, só usa `node:fs` e `node:path`, iguais a `configuracaoIndicadores.js`).
- Produces (usado pelas Tasks 2 e 3):
  - `normalizarEquipamento(texto: string): string`
  - `grupoDoEquipamento(equipamento: string | null | undefined, config?: {grupos: string[], atribuicoes: Record<string,string>}): string | null`
  - `lerConfiguracaoEquipamentos(): {grupos: string[], atribuicoes: Record<string,string>}`
  - `salvarConfiguracaoEquipamentos(config: {grupos?: string[], atribuicoes?: Record<string,string>}): {grupos: string[], atribuicoes: Record<string,string>}`

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo ainda não existe)**

Criar `backend/src/services/configuracaoEquipamentos.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarEquipamento, grupoDoEquipamento } from "./configuracaoEquipamentos.js";

test("normalizarEquipamento remove espaços extras nas bordas e no meio, e usa minúsculo", () => {
  assert.equal(normalizarEquipamento("Ar  condicionado Central"), "ar condicionado central");
  assert.equal(normalizarEquipamento("  Empilhadeira  "), "empilhadeira");
});

test("grupoDoEquipamento retorna o grupo configurado pra uma chave conhecida", () => {
  const config = { grupos: ["Movimentação"], atribuicoes: { "empilhadeira": "Movimentação" } };
  assert.equal(grupoDoEquipamento("Empilhadeira", config), "Movimentação");
});

test("grupoDoEquipamento casa por chave normalizada (espaço duplo e maiúscula não importam)", () => {
  const config = { grupos: ["Climatização"], atribuicoes: { "ar condicionado central": "Climatização" } };
  assert.equal(grupoDoEquipamento("Ar  condicionado Central", config), "Climatização");
});

test("grupoDoEquipamento retorna 'Não classificado' quando a chave não está no mapeamento", () => {
  const config = { grupos: [], atribuicoes: {} };
  assert.equal(grupoDoEquipamento("Bebedouro", config), "Não classificado");
});

test("grupoDoEquipamento retorna null quando não há equipamento", () => {
  const config = { grupos: [], atribuicoes: {} };
  assert.equal(grupoDoEquipamento(null, config), null);
  assert.equal(grupoDoEquipamento(undefined, config), null);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (de dentro de `backend/`): `npm test`
Expected: FAIL — `Cannot find module './configuracaoEquipamentos.js'` (ou erro equivalente de import), porque o arquivo ainda não existe.

- [ ] **Step 3: Criar o serviço com o mapeamento inicial completo**

Criar `backend/src/services/configuracaoEquipamentos.js`:

```js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const PASTA_DADOS = path.join(process.cwd(), "data");
const ARQUIVO = path.join(PASTA_DADOS, "configuracao-equipamentos.json");

// Semente construída em 2026-08-12 revisando a distribuição real dos 89 valores de
// `equipamento` observados no período completo (ver
// docs/superpowers/specs/2026-08-12-classificacao-equipamentos-design.md pro racional de
// cada grupo). Chaves já normalizadas (trim + minúsculo + espaços colapsados) — ver
// normalizarEquipamento abaixo.
const PADRAO = {
  grupos: ["Movimentação", "Refrigeração", "Energia", "Climatização", "Portas", "Limpeza e Operação", "Estruturas"],
  atribuicoes: {
    // Movimentação
    "empilhadeira": "Movimentação",
    "carrinho de compras": "Movimentação",
    "agua de bateria de empilhadeira": "Movimentação",
    "funcionamento de carregador de baterias": "Movimentação",
    "berço de bateria e carrinho de troca": "Movimentação",
    "paleteira": "Movimentação",
    "transpaleteira": "Movimentação",
    "suporte de bateria": "Movimentação",
    "rampas das docas": "Movimentação",
    // Estruturas
    "porta pallets": "Estruturas",
    "bases dos porta palets": "Estruturas",
    // Refrigeração
    "funcionamento portas de camara de congelado": "Refrigeração",
    "funcionamento portas de camara de resfriado": "Refrigeração",
    "funcionamento balcoes de acougue": "Refrigeração",
    "funcionamento ilhas de congelados": "Refrigeração",
    "iluminação de balcao de resfriado vertical": "Refrigeração",
    "iluminação de ilha de congelado": "Refrigeração",
    "iluminação do balcao de acougue": "Refrigeração",
    "balcao de acougue": "Refrigeração",
    "balcao de refrigeraçao": "Refrigeração",
    "camara de congelado": "Refrigeração",
    "camara de resfriado": "Refrigeração",
    "açougue/deposito açougue": "Refrigeração",
    "balcão de açougue": "Refrigeração",
    "ilhas de congelado e resfriado": "Refrigeração",
    "ilhas de congelados - reparos": "Refrigeração",
    "freezer horizontal": "Refrigeração",
    "funcionamento casa de maquinas": "Refrigeração",
    "casa de maquinas": "Refrigeração",
    "casa de máquinas": "Refrigeração",
    "bebedouro": "Refrigeração",
    "porta de anti-camara": "Refrigeração",
    "porta de resfriado - vedação ruim": "Refrigeração",
    "porta de resfriado - suporte danificado": "Refrigeração",
    "porta de resfriado - não fecha": "Refrigeração",
    "porta de resfriado - correia danificada": "Refrigeração",
    "porta de congelados - suporte danificado": "Refrigeração",
    "porta de congelados - não fecha": "Refrigeração",
    "porta de congelados - guia danificada": "Refrigeração",
    "porta de congelados - vedação ruim": "Refrigeração",
    // Energia
    "funcionamento gerador": "Energia",
    "tensão de bateria gerador": "Energia",
    "banco de capacitores (substação)": "Energia",
    "gerador": "Energia",
    "gerador - quinzenal": "Energia",
    // Climatização
    "ar condicionado central": "Climatização",
    "climatizadores": "Climatização",
    "ar condicionado de salas": "Climatização",
    "climatizador": "Climatização",
    "climatizador - vazamento de água": "Climatização",
    "ventilador": "Climatização",
    "exaustor": "Climatização",
    "ar condicionado sala do cftv": "Climatização",
    "ar condicionado sala do cpd": "Climatização",
    "ar condicionado transportadora barcelona": "Climatização",
    "ar condicionado cozinha do predio": "Climatização",
    "ar condicionado recepção": "Climatização",
    "ar condicionado sala do transporte rm": "Climatização",
    "ar condicionado sala da logistica (gerencia de projetos)": "Climatização",
    "ar condicionado sala da logistica": "Climatização",
    "ar condicionado sala do transporte": "Climatização",
    "ar condicionado sala da fiscalização": "Climatização",
    "ar condicionado sala de reunião bahia": "Climatização",
    "ar condicionado sala de descanço dos motoristas": "Climatização",
    "ar condicionado portaria (externa)": "Climatização",
    "ar condicionado sala do televendas": "Climatização",
    "ar condicionado sala do ti": "Climatização",
    "ar condicionado rh e sesmt": "Climatização",
    "ar condicionado guarita dos seguranças (externo)": "Climatização",
    // Portas
    "portas rm": "Portas",
    "portões de entrada - quebrado": "Portas",
    "portões de entrada - não funciona": "Portas",
    // Limpeza e Operação
    "funcionamento lavadora de piso": "Limpeza e Operação",
    "lavadora de piso": "Limpeza e Operação",
    "prensa de papelão": "Limpeza e Operação",
    // Sem entrada aqui: chamados administrativos/genéricos (Outros, Demandas -
    // Administrativas, Lojas, Armário de Colaboradores, Administrativas, Geral, Sesmt -
    // Adequação de NR's, Loja Nova, Fiscal - Atividade, Sesmt - Notificação) caem no
    // fallback "Não classificado" de propósito — não são falha de equipamento físico.
  },
};

export function lerConfiguracaoEquipamentos() {
  if (!existsSync(ARQUIVO)) return PADRAO;
  try {
    const salvo = JSON.parse(readFileSync(ARQUIVO, "utf-8"));
    return { ...PADRAO, ...salvo };
  } catch {
    return PADRAO;
  }
}

export function salvarConfiguracaoEquipamentos(config) {
  if (!existsSync(PASTA_DADOS)) mkdirSync(PASTA_DADOS, { recursive: true });
  const novaConfig = {
    grupos: config.grupos ?? PADRAO.grupos,
    atribuicoes: config.atribuicoes ?? PADRAO.atribuicoes,
  };
  writeFileSync(ARQUIVO, JSON.stringify(novaConfig, null, 2));
  return novaConfig;
}

export function normalizarEquipamento(texto) {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

export function grupoDoEquipamento(equipamento, config = lerConfiguracaoEquipamentos()) {
  if (!equipamento) return null;
  return config.atribuicoes[normalizarEquipamento(equipamento)] ?? "Não classificado";
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — todos os 5 testes de `configuracaoEquipamentos.test.js`, mais os testes já existentes continuam passando (20 testes antigos + 5 novos = 25).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/configuracaoEquipamentos.js backend/src/services/configuracaoEquipamentos.test.js
git commit -m "feat: adiciona serviço de configuração de grupos de equipamento"
```

---

### Task 2: Agregação por grupo de equipamento (backend)

**Files:**
- Modify: `backend/src/services/indicadoresPorTaxonomia.js`
- Test: `backend/src/services/indicadoresPorTaxonomia.test.js`

**Interfaces:**
- Consumes (da Task 1): `grupoDoEquipamento(equipamento, config?)`, `lerConfiguracaoEquipamentos()` de `./configuracaoEquipamentos.js`.
- Produces (usado pela Task 4 no frontend, via JSON de `/api/manutencao`):
  - `agruparEquipamentos(chamados: Array<{equipamento?: string|null}>, config?): Array<{label: string, total: number, itens: Array<{label: string, total: number}>}>` — exportado.
  - `detalheDoGrupo(...)` (interno) passa a incluir `porGrupoEquipamento` no objeto retornado, com esse mesmo formato — presente em `buildIndicadoresManutencao(...).geral.porGrupoEquipamento` e em `.porTipoDetalhe[tipo].porGrupoEquipamento`. **Ausente** em `buildIndicadoresEngenharia(...)` (Engenharia não tem campo `equipamento`).

- [ ] **Step 1: Escrever os testes (vão falhar — `agruparEquipamentos` ainda não existe)**

Criar `backend/src/services/indicadoresPorTaxonomia.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparEquipamentos, buildIndicadoresManutencao, buildIndicadoresEngenharia } from "./indicadoresPorTaxonomia.js";

const CONFIG_TESTE = {
  grupos: ["Movimentação", "Refrigeração"],
  atribuicoes: { "empilhadeira": "Movimentação", "camara de resfriado": "Refrigeração" },
};

test("agruparEquipamentos agrupa pelo grupo configurado e aninha o ranking por equipamento", () => {
  const chamados = [
    { equipamento: "Empilhadeira" },
    { equipamento: "Empilhadeira" },
    { equipamento: "Camara de Resfriado" },
    { equipamento: "Bebedouro" },
  ];

  const resultado = agruparEquipamentos(chamados, CONFIG_TESTE);

  assert.deepEqual(resultado, [
    { label: "Movimentação", total: 2, itens: [{ label: "Empilhadeira", total: 2 }] },
    { label: "Refrigeração", total: 1, itens: [{ label: "Camara de Resfriado", total: 1 }] },
    { label: "Não classificado", total: 1, itens: [{ label: "Bebedouro", total: 1 }] },
  ]);
});

test("agruparEquipamentos ignora chamados sem equipamento (caso Engenharia)", () => {
  const chamados = [{ equipamento: null }, { equipamento: "Empilhadeira" }];
  const resultado = agruparEquipamentos(chamados, CONFIG_TESTE);
  assert.deepEqual(resultado, [{ label: "Movimentação", total: 1, itens: [{ label: "Empilhadeira", total: 1 }] }]);
});

test("buildIndicadoresManutencao inclui porGrupoEquipamento em geral e em cada tipo", () => {
  const chamados = [{ tipo: "Corretiva", equipamento: "Empilhadeira", NomeStatus: "Resolvido" }];
  const resultado = buildIndicadoresManutencao(chamados);
  assert.ok(Array.isArray(resultado.geral.porGrupoEquipamento));
  assert.ok(Array.isArray(resultado.porTipoDetalhe["Corretiva"].porGrupoEquipamento));
});

test("buildIndicadoresEngenharia não inclui porGrupoEquipamento (Engenharia não tem equipamento)", () => {
  const chamados = [{ tipoAtividade: "Elétrica", equipamento: null, NomeStatus: "Resolvido" }];
  const resultado = buildIndicadoresEngenharia(chamados);
  assert.equal(resultado.geral.porGrupoEquipamento, undefined);
  assert.equal(resultado.porAtividadeDetalhe["Elétrica"].porGrupoEquipamento, undefined);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — `agruparEquipamentos is not a function` (ou erro de import), e as duas asserções de `porGrupoEquipamento` também falhariam (`undefined` não é array).

- [ ] **Step 3: Implementar `agruparEquipamentos` e ligar ao `detalheDoGrupo`**

Em `backend/src/services/indicadoresPorTaxonomia.js`, modificar a linha 1 (import) de:

```js
import { classificarStatus, lerConfiguracao } from "./configuracaoIndicadores.js";
```

para:

```js
import { classificarStatus, lerConfiguracao } from "./configuracaoIndicadores.js";
import { grupoDoEquipamento, lerConfiguracaoEquipamentos } from "./configuracaoEquipamentos.js";
```

Logo depois da função `contarPor` (antes de `listarOperadores`), adicionar:

```js
export function agruparEquipamentos(chamados, config = lerConfiguracaoEquipamentos()) {
  const porGrupo = new Map();

  for (const chamado of chamados) {
    if (!chamado.equipamento) continue;
    const grupo = grupoDoEquipamento(chamado.equipamento, config);
    const atual = porGrupo.get(grupo) || { label: grupo, total: 0, itensMap: new Map() };
    atual.total += 1;
    atual.itensMap.set(chamado.equipamento, (atual.itensMap.get(chamado.equipamento) || 0) + 1);
    porGrupo.set(grupo, atual);
  }

  return [...porGrupo.values()]
    .map(({ label, total, itensMap }) => ({
      label,
      total,
      itens: [...itensMap.entries()]
        .map(([itemLabel, itemTotal]) => ({ label: itemLabel, total: itemTotal }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}
```

Na função `detalheDoGrupo`, adicionar `porGrupoEquipamento` logo depois de `porEquipamento`:

```js
  return {
    total: chamados.length,
    porEquipamento: contarPor(chamados, (chamado) => chamado.equipamento),
    porGrupoEquipamento: agruparEquipamentos(chamados),
    porCliente: contarPor(chamados, (chamado) => chamado.cliente),
```

Em `buildIndicadoresEngenharia`, remover `porGrupoEquipamento` junto com `porEquipamento` nos dois lugares onde isso já acontece:

```js
  const porAtividadeDetalhe = {};
  for (const tipo of tipos) {
    const doTipo = chamadosEngenharia.filter((chamado) => chamado.tipoAtividade === tipo);
    // Engenharia não tem dimensão "equipamento" — remove os campos pra não confundir o consumidor.
    const { porEquipamento, porGrupoEquipamento, ...resto } = detalheDoGrupo(doTipo);
    porAtividadeDetalhe[tipo] = resto;
  }

  const { porEquipamento, porGrupoEquipamento, ...geral } = detalheDoGrupo(chamadosEngenharia);
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — todos os testes, incluindo os 4 novos de `indicadoresPorTaxonomia.test.js` (25 + 4 = 29 no total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/indicadoresPorTaxonomia.js backend/src/services/indicadoresPorTaxonomia.test.js
git commit -m "feat: agrega chamados de Manutenção por grupo de equipamento"
```

---

### Task 3: Endpoints REST de configuração de equipamentos (backend)

**Files:**
- Modify: `backend/src/routes/indicadores.js`

**Interfaces:**
- Consumes (da Task 1): `lerConfiguracaoEquipamentos`, `salvarConfiguracaoEquipamentos`, `grupoDoEquipamento`, `normalizarEquipamento` de `../services/configuracaoEquipamentos.js`. `carregarChamadosEnriquecidos` já está importado no arquivo.
- Produces (usado pela Task 6 no frontend):
  - `GET /api/configuracao/equipamentos` → `{ config: {grupos, atribuicoes}, equipamentosDisponiveis: Array<{label: string, total: number}> }`.
  - `PUT /api/configuracao/equipamentos` (body `{grupos, atribuicoes}`) → `{ config }`.

Não há framework de teste de rota nesse projeto (só os services têm `*.test.js`) — a verificação desta task é manual, via `curl` contra o backend já rodando em `http://localhost:3001`.

- [ ] **Step 1: Adicionar o import**

No topo de `backend/src/routes/indicadores.js`, logo depois da linha do import de `configuracaoIndicadores.js` (linha 10):

```js
import { lerConfiguracao, salvarConfiguracao, classificarStatus } from "../services/configuracaoIndicadores.js";
import {
  lerConfiguracaoEquipamentos,
  salvarConfiguracaoEquipamentos,
  grupoDoEquipamento,
  normalizarEquipamento,
} from "../services/configuracaoEquipamentos.js";
```

- [ ] **Step 2: Adicionar o caso `grupoEquipamento` em `valorDaDimensao`**

Necessário pro clique em "Outros (agregado)" funcionar corretamente se um dia existirem mais de 10 grupos (o painel de grupos vira uma barra "Outros (agregado)" nesse caso, igual qualquer outro gráfico). Modificar a função (por volta da linha 28-47):

```js
function valorDaDimensao(chamado, dimensao) {
  switch (dimensao) {
    case "tipo":
      return chamado.tipo;
    case "tipoAtividade":
      return chamado.tipoAtividade;
    case "atividade":
      return chamado.especialidade === "Engenharia" ? chamado.tipoAtividade : chamado.tipo;
    case "equipamento":
      return chamado.equipamento;
    case "grupoEquipamento":
      return grupoDoEquipamento(chamado.equipamento);
    case "cliente":
      return chamado.cliente;
    case "operador":
      return nomeOperador(chamado);
    default:
      return undefined;
  }
}
```

- [ ] **Step 3: Adicionar as duas rotas**

No final de `backend/src/routes/indicadores.js`, depois da rota `PUT /configuracao/status` já existente:

```js
indicadoresRouter.get("/configuracao/equipamentos", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });

    const porChaveNormalizada = new Map();
    for (const c of chamados) {
      if (!c.equipamento) continue;
      const chave = normalizarEquipamento(c.equipamento);
      const atual = porChaveNormalizada.get(chave) || { label: c.equipamento, total: 0 };
      atual.total += 1;
      porChaveNormalizada.set(chave, atual);
    }

    const equipamentosDisponiveis = [...porChaveNormalizada.values()].sort((a, b) => b.total - a.total);

    res.json({ config: lerConfiguracaoEquipamentos(), equipamentosDisponiveis });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.put("/configuracao/equipamentos", (req, res) => {
  try {
    const config = salvarConfiguracaoEquipamentos(req.body);
    res.json({ config });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});
```

- [ ] **Step 4: Rodar a suíte de testes do backend (garantir que nada quebrou)**

Run (de dentro de `backend/`): `npm test`
Expected: PASS — os mesmos 29 testes da Task 2, sem nenhum novo (rotas não têm teste automatizado neste projeto).

- [ ] **Step 5: Verificar manualmente com curl**

Com o backend já rodando em `http://localhost:3001` (`node --watch` recarrega sozinho):

```bash
curl -s "http://localhost:3001/api/configuracao/equipamentos" | node -e "
let data=''; process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const json = JSON.parse(data);
  console.log('grupos:', json.config.grupos);
  console.log('equipamentos distintos:', json.equipamentosDisponiveis.length);
  console.log('top 3:', json.equipamentosDisponiveis.slice(0, 3));
});
"
```

Expected: `grupos` lista os 7 grupos da semente; `equipamentosDisponiveis` tem 85 itens (89 valores brutos menos as 4 fusões por normalização: "Ar condicionado Central"/"central", "Ar condicionado de Salas"/"salas", "Lavadora de Piso"/"piso", "Prensa de Papelão"/"papelão"); o item de topo é "Empilhadeira" com total 147.

Depois, confirmar que o `PUT` funciona sem alterar o conteúdo (round-trip do próprio config lido — não sobrescreve nada de verdade):

```bash
CONFIG_ATUAL=$(curl -s "http://localhost:3001/api/configuracao/equipamentos" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d).config)))")

curl -s -X PUT "http://localhost:3001/api/configuracao/equipamentos" \
  -H "Content-Type: application/json" \
  -d "$CONFIG_ATUAL" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log('grupos salvos:', JSON.parse(d).config.grupos))"
```

Expected: imprime a mesma lista de 7 grupos — confirma que salvar e ler funcionam de ponta a ponta, e que `backend/data/configuracao-equipamentos.json` foi criado.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/indicadores.js
git commit -m "feat: adiciona endpoints de configuração de grupos de equipamento"
```

---

### Task 4: Drill-down de dois níveis no painel "Por equipamento" (frontend)

**Files:**
- Modify: `frontend/src/components/HorizontalBarChart.jsx`
- Modify: `frontend/src/lib/useDrillDown.js`
- Modify: `frontend/src/components/DrillDownContent.jsx`
- Modify: `frontend/src/components/MaximizableChart.jsx`
- Modify: `frontend/src/pages/Manutencao.jsx`

**Interfaces:**
- Consumes (da Task 2, via JSON de `/api/manutencao`): `detalhe.porGrupoEquipamento: Array<{label, total, itens: Array<{label, total}>}>`.
- Produces: nenhuma interface nova consumida por outras tasks — esta task fecha um fluxo de ponta a ponta, verificado no navegador.

Sem testes automatizados (frontend não tem framework de teste configurado) — a verificação é manual, no navegador, ao final da task.

- [ ] **Step 1: Repassar o data-point inteiro no clique da barra**

Em `frontend/src/components/HorizontalBarChart.jsx`, trocar:

```js
          onClick={(entry) => {
            if (onBarClick) onBarClick(entry.label, Boolean(entry.agregado));
          }}
```

por:

```js
          onClick={(entry) => {
            if (onBarClick) onBarClick(entry.label, Boolean(entry.agregado), entry);
          }}
```

- [ ] **Step 2: Adicionar `abrirSubRanking` na pilha de drill-down**

Em `frontend/src/lib/useDrillDown.js`, logo depois da função `abrirListaEmpilhada` (antes de `abrirChamado`):

```js
  // Ranking de um subconjunto (ex: equipamentos de um grupo) — os dados já vêm prontos no
  // payload (sem fetch); ao clicar numa barra o consumidor decide o que abrir a seguir
  // (normalmente abrirListaEmpilhada com o filtro certo).
  function abrirSubRanking(dados, titulo, opts = {}) {
    setPilha((p) => [...(p ?? []), { tipo: "subRanking", dados, titulo, ...opts }]);
  }
```

E adicionar `abrirSubRanking` no objeto retornado no final do hook — trocar:

```js
  return {
    pilha,
    topo,
    abrir,
    abrirLista,
    abrirResumoCliente,
    abrirResumoBacklog,
    abrirListaEmpilhada,
    abrirChamado,
    voltar,
    fechar,
  };
```

por:

```js
  return {
    pilha,
    topo,
    abrir,
    abrirLista,
    abrirResumoCliente,
    abrirResumoBacklog,
    abrirListaEmpilhada,
    abrirSubRanking,
    abrirChamado,
    voltar,
    fechar,
  };
```

- [ ] **Step 3: Renderizar o sub-ranking no `DrillDownContent`**

Em `frontend/src/components/DrillDownContent.jsx`, adicionar o import de `HorizontalBarChart` no topo:

```js
import { ChamadosList } from "./ChamadosList.jsx";
import { ChamadoDetalhe } from "./ChamadoDetalhe.jsx";
import { ClienteResumoTable } from "./ClienteResumoTable.jsx";
import { BacklogResumoTable } from "./BacklogResumoTable.jsx";
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
```

E adicionar o branch `subRanking`, logo depois do branch `resumoBacklog` (antes do branch `lista`):

```js
  // Ranking de um subconjunto (ex: equipamentos de um grupo) — dados já prontos, sem fetch;
  // clicar numa barra abre a lista de chamados filtrada por aquele item específico.
  if (topo?.tipo === "subRanking") {
    const altura = Math.max(220, Math.min(topo.dados.length, 30) * 26);
    return (
      <HorizontalBarChart
        data={topo.dados}
        color={topo.color}
        limit={topo.dados.length}
        height={altura}
        formatValue={topo.formatValue}
        agregarOutros={false}
        onBarClick={(label) => onAbrirLista({ ...topo.filtroBase, equipamento: label }, label, topo.fetcher)}
      />
    );
  }
```

- [ ] **Step 4: Disparar o sub-ranking a partir do `MaximizableChart`**

Em `frontend/src/components/MaximizableChart.jsx`, dentro do IIFE que define `selecionar`, trocar:

```js
              const selecionar = (label, agregado) => {
                if (agregado) {
                  const foraDoTopo = data.slice(0, 30).map((d) => d.label);
                  drill.abrirLista(
                    { ...filtroBase, dimensao: dimensaoFiltro, foraDoTopo: foraDoTopo.join("|") },
                    "Outros (agregado)",
                    fetcher
                  );
                } else if (resumoPorCliente) {
                  drill.abrirResumoCliente({ ...filtroBase, cliente: label }, label);
                } else {
                  drill.abrirLista({ ...filtroBase, [dimensaoFiltro]: label }, label, fetcher);
                }
              };
```

por:

```js
              const selecionar = (label, agregado, entry) => {
                if (agregado) {
                  const foraDoTopo = data.slice(0, 30).map((d) => d.label);
                  drill.abrirLista(
                    { ...filtroBase, dimensao: dimensaoFiltro, foraDoTopo: foraDoTopo.join("|") },
                    "Outros (agregado)",
                    fetcher
                  );
                } else if (entry?.itens) {
                  drill.abrirSubRanking(entry.itens, label, { filtroBase, fetcher, color, formatValue });
                } else if (resumoPorCliente) {
                  drill.abrirResumoCliente({ ...filtroBase, cliente: label }, label);
                } else {
                  drill.abrirLista({ ...filtroBase, [dimensaoFiltro]: label }, label, fetcher);
                }
              };
```

(`entry.itens` só existe nos data-points de `porGrupoEquipamento` — os outros gráficos que usam `MaximizableChart` continuam se comportando exatamente como antes, já que seus data-points nunca têm `itens`.)

- [ ] **Step 5: Trocar o painel "Por equipamento" por "Por tipo de equipamento" em Manutenção**

Em `frontend/src/pages/Manutencao.jsx`, trocar:

```jsx
                <MaximizableChart
                  title="Por equipamento"
                  subtitle={`Ranking de equipamentos${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} — clique numa barra`}
                  data={detalhe.porEquipamento}
                  color={COR_POR_TIPO[tipoAtivo]}
                  limit={10}
                  filtroBase={filtroBase}
                  dimensaoFiltro="equipamento"
                />
```

por:

```jsx
                <MaximizableChart
                  title="Por tipo de equipamento"
                  subtitle={`Agrupado por categoria${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} — clique numa barra pra ver os equipamentos do grupo`}
                  data={detalhe.porGrupoEquipamento}
                  color={COR_POR_TIPO[tipoAtivo]}
                  limit={10}
                  filtroBase={filtroBase}
                  dimensaoFiltro="grupoEquipamento"
                />
```

- [ ] **Step 6: Verificar no navegador**

Com o frontend rodando em `http://localhost:5173` (Vite recarrega sozinho ao salvar):

1. Abrir `http://localhost:5173/manutencao`.
2. Confirmar que o painel antes chamado "Por equipamento" agora se chama "Por tipo de equipamento" e mostra no máximo ~8 barras (os 7 grupos + "Não classificado", se houver volume).
3. Clicar numa barra de grupo (ex: "Refrigeração") — deve abrir um modal mostrando o ranking dos equipamentos específicos daquele grupo (ex: "Funcionamento Portas de Camara de Congelado", "Camara de Resfriado", etc), carregado instantaneamente (sem spinner de loading, já que não há fetch nesse passo).
4. Clicar numa barra desse sub-ranking (ex: "Camara de Resfriado") — deve abrir a lista de chamados filtrada por esse equipamento específico, igual já funcionava antes pro gráfico "Por equipamento".
5. Clicar em "← Voltar" duas vezes — deve voltar pro sub-ranking do grupo, depois fechar o modal (ou voltar pro estado inicial do gráfico).
6. Confirmar que os outros gráficos que usam `MaximizableChart` ("Por tipo", "Por cliente", "Por causa" em outras páginas) continuam funcionando exatamente como antes — clicar numa barra deles ainda vai direto pra lista de chamados, sem o passo intermediário.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/HorizontalBarChart.jsx frontend/src/lib/useDrillDown.js frontend/src/components/DrillDownContent.jsx frontend/src/components/MaximizableChart.jsx frontend/src/pages/Manutencao.jsx
git commit -m "feat: painel 'Por tipo de equipamento' com drill-down em dois níveis"
```

---

### Task 5: Extrai `ConfiguracaoStatus.jsx` de `Configuracoes.jsx` (frontend)

Refatoração pura — prepara o terreno pra Task 6 adicionar a segunda aba. Nenhum comportamento muda nesta task.

**Files:**
- Create: `frontend/src/pages/ConfiguracaoStatus.jsx`
- Modify: `frontend/src/pages/Configuracoes.jsx`

**Interfaces:**
- Consumes: nada novo (usa `fetchConfiguracaoStatus`/`salvarConfiguracaoStatus`, já existentes em `api.js`).
- Produces (usado pela Task 6): componente default-exportado `ConfiguracaoStatus` em `frontend/src/pages/ConfiguracaoStatus.jsx`, sem props.

- [ ] **Step 1: Criar `ConfiguracaoStatus.jsx` com o conteúdo atual de `Configuracoes.jsx`**

Criar `frontend/src/pages/ConfiguracaoStatus.jsx` com exatamente o conteúdo abaixo (é o `Configuracoes.jsx` atual, só com o nome do componente trocado de `Configuracoes` pra `ConfiguracaoStatus`):

```jsx
import { useEffect, useState } from "react";
import { fetchConfiguracaoStatus, salvarConfiguracaoStatus } from "../api.js";

const BUCKETS = [
  { value: "concluido", label: "Concluído" },
  { value: "aguardandoAprovacao", label: "Aguardando Aprovação (não conta como aberto)" },
  { value: "aberto", label: "Em aberto" },
  { value: "outro", label: "Ignorar (não entra nos indicadores de status)" },
];

function classificarStatus(status, config) {
  if (config.statusConcluido.includes(status)) return "concluido";
  if (config.statusAguardandoAprovacao.includes(status)) return "aguardandoAprovacao";
  if (config.statusAberto.includes(status)) return "aberto";
  return "outro";
}

function moverStatus(config, status, novoBucket) {
  const limpo = {
    statusConcluido: config.statusConcluido.filter((s) => s !== status),
    statusAguardandoAprovacao: config.statusAguardandoAprovacao.filter((s) => s !== status),
    statusAberto: config.statusAberto.filter((s) => s !== status),
  };

  if (novoBucket === "concluido") limpo.statusConcluido.push(status);
  if (novoBucket === "aguardandoAprovacao") limpo.statusAguardandoAprovacao.push(status);
  if (novoBucket === "aberto") limpo.statusAberto.push(status);

  return limpo;
}

export default function ConfiguracaoStatus() {
  const [state, setState] = useState({ status: "loading", config: null, statusDisponiveis: [], error: null });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetchConfiguracaoStatus()
      .then(({ config, statusDisponiveis }) => setState({ status: "ready", config, statusDisponiveis, error: null }))
      .catch((error) => setState({ status: "error", config: null, statusDisponiveis: [], error: error.message }));
  }, []);

  function handleMudarStatus(status, novoBucket) {
    setState((s) => ({ ...s, config: moverStatus(s.config, status, novoBucket) }));
    setSalvo(false);
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const { config } = await salvarConfiguracaoStatus(state.config);
      setState((s) => ({ ...s, config }));
      setSalvo(true);
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    } finally {
      setSalvando(false);
    }
  }

  if (state.status === "loading") return <p className="subtitle">Carregando configuração...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar configuração: {state.error}</div>;

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Classificação de status</h2>
          <p className="subtitle">
            Define quais status contam como concluído, em aberto ou aguardando aprovação nos indicadores (% de resolução, contagem de
            abertos, etc). Chamados "Aguardando Aprovação" ficam separados de propósito — não contam negativamente enquanto o
            orçamento não é avaliado.
          </p>
        </div>
        <button className="refresh-btn" onClick={handleSalvar} disabled={salvando}>
          {salvando ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar alterações"}
        </button>
      </div>

      <div className="panel full-width">
        {state.statusDisponiveis.map((status) => (
          <div key={status} className="config-status-row">
            <span>{status}</span>
            <select value={classificarStatus(status, state.config)} onChange={(e) => handleMudarStatus(status, e.target.value)}>
              {BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reduzir `Configuracoes.jsx` a um wrapper que renderiza `ConfiguracaoStatus`**

Substituir todo o conteúdo de `frontend/src/pages/Configuracoes.jsx` por:

```jsx
import ConfiguracaoStatus from "./ConfiguracaoStatus.jsx";

export default function Configuracoes() {
  return <ConfiguracaoStatus />;
}
```

- [ ] **Step 3: Verificar no navegador**

1. Abrir `http://localhost:5173/configuracoes`.
2. Confirmar que a tela aparece exatamente igual a antes (título "Classificação de status", lista de status com dropdown).
3. Mudar o bucket de um status qualquer e clicar em "Salvar alterações" — confirmar que ainda funciona (mostra "Salvo ✓").

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ConfiguracaoStatus.jsx frontend/src/pages/Configuracoes.jsx
git commit -m "refactor: extrai ConfiguracaoStatus de Configuracoes"
```

---

### Task 6: Tela de Configuração de Equipamentos + abas em Configurações (frontend)

**Files:**
- Modify: `frontend/src/api.js`
- Create: `frontend/src/pages/ConfiguracaoEquipamentos.jsx`
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes (da Task 3): `GET /api/configuracao/equipamentos` → `{config: {grupos, atribuicoes}, equipamentosDisponiveis: [{label, total}]}`; `PUT /api/configuracao/equipamentos`. Consumes (da Task 5): componente default `ConfiguracaoStatus` de `./ConfiguracaoStatus.jsx`. Consumes componente já existente `SubTabs` de `../components/SubTabs.jsx` (props `{options: [{value, label, count?}], active, onChange}`).
- Produces: nada consumido por outra task — fecha o fluxo de configuração, verificado manualmente no navegador.

Sem testes automatizados (frontend não tem framework de teste configurado) — verificação manual no navegador ao final da task.

- [ ] **Step 1: Adicionar as funções de API**

Em `frontend/src/api.js`, logo depois de `salvarConfiguracaoStatus` (fim do arquivo), adicionar:

```js
export function fetchConfiguracaoEquipamentos() {
  return getJson("/api/configuracao/equipamentos", {});
}

export async function salvarConfiguracaoEquipamentos(config) {
  const response = await fetch("/api/configuracao/equipamentos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao salvar configuração de equipamentos");
  return data;
}
```

- [ ] **Step 2: Criar a tela `ConfiguracaoEquipamentos.jsx`**

Criar `frontend/src/pages/ConfiguracaoEquipamentos.jsx`:

```jsx
import { useEffect, useMemo, useState } from "react";
import { fetchConfiguracaoEquipamentos, salvarConfiguracaoEquipamentos } from "../api.js";

function normalizarChave(texto) {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function ConfiguracaoEquipamentos() {
  const [state, setState] = useState({ status: "loading", config: null, equipamentosDisponiveis: [], error: null });
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [grupoParaAplicar, setGrupoParaAplicar] = useState("");
  const [novoGrupo, setNovoGrupo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetchConfiguracaoEquipamentos()
      .then(({ config, equipamentosDisponiveis }) => setState({ status: "ready", config, equipamentosDisponiveis, error: null }))
      .catch((error) => setState({ status: "error", config: null, equipamentosDisponiveis: [], error: error.message }));
  }, []);

  const equipamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return state.equipamentosDisponiveis;
    return state.equipamentosDisponiveis.filter((e) => e.label.toLowerCase().includes(termo));
  }, [state.equipamentosDisponiveis, busca]);

  const resumoPorGrupo = useMemo(() => {
    if (!state.config) return [];
    const contagem = new Map();
    for (const e of state.equipamentosDisponiveis) {
      const grupo = state.config.atribuicoes[normalizarChave(e.label)] ?? "Não classificado";
      contagem.set(grupo, (contagem.get(grupo) || 0) + e.total);
    }
    return [...contagem.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  }, [state.config, state.equipamentosDisponiveis]);

  function toggleSelecionado(label) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(label)) novo.delete(label);
      else novo.add(label);
      return novo;
    });
  }

  function aplicarGrupo() {
    if (!grupoParaAplicar || selecionados.size === 0) return;
    setState((s) => {
      const atribuicoes = { ...s.config.atribuicoes };
      for (const label of selecionados) {
        atribuicoes[normalizarChave(label)] = grupoParaAplicar;
      }
      return { ...s, config: { ...s.config, atribuicoes } };
    });
    setSelecionados(new Set());
    setGrupoParaAplicar("");
    setSalvo(false);
  }

  function adicionarGrupo() {
    const nome = novoGrupo.trim();
    if (!nome || state.config.grupos.includes(nome)) return;
    setState((s) => ({ ...s, config: { ...s.config, grupos: [...s.config.grupos, nome] } }));
    setNovoGrupo("");
    setSalvo(false);
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const { config } = await salvarConfiguracaoEquipamentos(state.config);
      setState((s) => ({ ...s, config }));
      setSalvo(true);
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    } finally {
      setSalvando(false);
    }
  }

  if (state.status === "loading") return <p className="subtitle">Carregando configuração...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar configuração: {state.error}</div>;

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Classificação de equipamentos</h2>
          <p className="subtitle">
            Agrupa os valores de equipamento em categorias (Movimentação, Refrigeração, etc) usadas no painel "Por tipo de
            equipamento" de Manutenção. Marque um ou mais itens e atribua um grupo em lote.
          </p>
        </div>
        <button className="refresh-btn" onClick={handleSalvar} disabled={salvando}>
          {salvando ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar alterações"}
        </button>
      </div>

      <div className="equip-summary">
        {resumoPorGrupo.map((g) => (
          <span key={g.label} className="equip-summary-chip">
            {g.label}: <strong>{g.total}</strong>
          </span>
        ))}
      </div>

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar equipamento..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <input
          type="text"
          className="search-input"
          style={{ maxWidth: 220 }}
          placeholder="Nome do novo grupo..."
          value={novoGrupo}
          onChange={(e) => setNovoGrupo(e.target.value)}
        />
        <button className="refresh-btn" onClick={adicionarGrupo} disabled={!novoGrupo.trim()}>
          + Novo grupo
        </button>
      </div>

      <div className="equip-bulk-bar">
        <span className="meta">{selecionados.size} selecionado(s)</span>
        <select value={grupoParaAplicar} onChange={(e) => setGrupoParaAplicar(e.target.value)}>
          <option value="">Atribuir grupo...</option>
          {state.config.grupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="Não classificado">Não classificado</option>
        </select>
        <button className="refresh-btn" onClick={aplicarGrupo} disabled={!grupoParaAplicar || selecionados.size === 0}>
          Aplicar
        </button>
      </div>

      <div className="panel full-width equip-list">
        {equipamentosFiltrados.map((e) => {
          const grupoAtual = state.config.atribuicoes[normalizarChave(e.label)] ?? "Não classificado";
          return (
            <label key={e.label} className="equip-row">
              <input type="checkbox" checked={selecionados.has(e.label)} onChange={() => toggleSelecionado(e.label)} />
              <span>{e.label}</span>
              <span className="meta">{e.total} chamados</span>
              <span className={`equip-grupo-badge ${grupoAtual === "Não classificado" ? "sem-grupo" : ""}`}>{grupoAtual}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar as abas em `Configuracoes.jsx`**

Substituir todo o conteúdo de `frontend/src/pages/Configuracoes.jsx` (o wrapper simples criado na Task 5) por:

```jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import ConfiguracaoStatus from "./ConfiguracaoStatus.jsx";
import ConfiguracaoEquipamentos from "./ConfiguracaoEquipamentos.jsx";

const ABAS = [
  { value: "status", label: "Status" },
  { value: "equipamentos", label: "Equipamentos" },
];

export default function Configuracoes() {
  const [aba, setAba] = useState("status");

  return (
    <div>
      <SubTabs options={ABAS} active={aba} onChange={setAba} />
      {aba === "status" && <ConfiguracaoStatus />}
      {aba === "equipamentos" && <ConfiguracaoEquipamentos />}
    </div>
  );
}
```

- [ ] **Step 4: Adicionar as classes CSS novas**

Em `frontend/src/styles.css`, adicionar ao final do arquivo:

```css
.equip-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.equip-summary-chip {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.equip-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.equip-bulk-bar select {
  background: var(--surface-1);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
}

.equip-list {
  display: flex;
  flex-direction: column;
  max-height: 520px;
  overflow-y: auto;
}

.equip-row {
  display: grid;
  grid-template-columns: 24px 1fr 100px 200px;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--gridline);
  cursor: pointer;
}

.equip-row:hover {
  background: var(--gridline);
}

.equip-grupo-badge {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.equip-grupo-badge.sem-grupo {
  color: var(--status-warning);
}
```

- [ ] **Step 5: Verificar no navegador**

1. Abrir `http://localhost:5173/configuracoes`.
2. Confirmar que aparecem duas abas: "Status" e "Equipamentos".
3. Clicar em "Status" — confirmar que a tela de sempre continua funcionando.
4. Clicar em "Equipamentos" — confirmar que aparece: resumo por grupo no topo (chips com contagem), busca, campo de novo grupo, barra de seleção em lote, e a lista de ~85 equipamentos com checkbox + contagem + grupo atual.
5. Digitar "ar condicionado" na busca — confirmar que a lista filtra pra só os itens de climatização.
6. Marcar 2-3 checkboxes, escolher um grupo no select "Atribuir grupo...", clicar "Aplicar" — confirmar que o badge de grupo dos itens marcados muda na hora, e o resumo no topo atualiza os totais.
7. Clicar "Salvar alterações" — confirmar "Salvo ✓".
8. Recarregar a página (F5), voltar na aba "Equipamentos" — confirmar que a classificação feita no passo 6 persistiu.
9. Digitar um nome novo em "Nome do novo grupo..." e clicar "+ Novo grupo" — confirmar que ele aparece como opção no select "Atribuir grupo...".
10. Ir em `http://localhost:5173/manutencao` e conferir que o painel "Por tipo de equipamento" (Task 4) reflete a reclassificação feita — o equipamento movido no passo 6 agora conta pro novo grupo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.js frontend/src/pages/ConfiguracaoEquipamentos.jsx frontend/src/pages/Configuracoes.jsx frontend/src/styles.css
git commit -m "feat: tela de configuração de grupos de equipamento com abas em Configurações"
```
