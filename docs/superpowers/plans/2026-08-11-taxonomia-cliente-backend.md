# Taxonomia e Cliente (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer cada chamado buscado da API do DeskManager com `especialidade`, `tipo` (Preventiva/Corretiva/Rotina), `equipamento`/`tipoAtividade` e `cliente`, restrito a Manutenção e Engenharia — a base de dados que todas as páginas futuras (Manutenção, Engenharia, Lista de Chamados) vão consumir.

**Architecture:** Dois novos serviços de cache (`SubCategorias/lista`, `Usuarios/lista`, TTL 1h — mudam pouco), um classificador puro que deriva a taxonomia a partir de `SequenciaSubCategoria` (nunca por parsing de texto do `Assunto`), e uma função de enriquecimento que junta tudo e filtra fora de escopo. Um endpoint novo expõe o resultado para verificação manual antes das páginas de frontend existirem.

**Tech Stack:** Node.js (ESM), Express, `node:test` + `node:assert` (test runner nativo do Node, sem dependência nova) — mesmo stack do backend já existente em `backend/src/`.

## Global Constraints

- Escopo: só chamados cuja especialidade resolvida é `Manutenção` ou `Engenharia` entram no resultado — todo o resto (Sesmt, TI, Pintura, Chatbot, categorias desconhecidas) é descartado silenciosamente pela função de classificação (retorna `null`), nunca lançado como erro.
- Taxonomia derivada exclusivamente de `SequenciaSubCategoria` cruzado com `SubCategorias/lista` — nunca por parsing de texto do campo `Assunto` (decisão em `Guilherme/Indicadores Desk/fontes-de-dados/taxonomia-manutencao-engenharia.md` do vault Obsidian).
- Cache em memória com TTL: `SubCategorias/lista` e `Usuarios/lista` — 1 hora (mudam raramente). `ChamadosSuporte/lista` já tem cache de 5min em `backend/src/services/chamados.js` — não mexer nele nesta fase.
- Funções puras (sem chamada de rede) são testadas com `node:test`. Wrappers que chamam `deskPost` (rede) não são testados nesta fase — mesmo padrão já usado em `chamados.js`/`deskApi.js`, que também não têm teste automatizado hoje.
- Todos os arquivos novos em `backend/src/services/`. Módulos ESM (`import`/`export`), sem `require`.
- Commit após cada task concluída.

---

### Task 1: Serviço de SubCategorias (fetch + cache + índice)

**Files:**
- Create: `backend/src/services/subcategorias.js`
- Test: `backend/src/services/subcategorias.test.js`
- Modify: `backend/package.json` (adiciona script `test`)

**Interfaces:**
- Consumes: `deskPost(path, body)` de `backend/src/services/deskApi.js` (já existe, assinatura `(path: string, body?: object) => Promise<any>`)
- Produces:
  - `buildSubCategoriaIndex(list: Array<{Sequencia, SubCategoria, Categoria}>) => Map<string, {Sequencia, SubCategoria, Categoria}>` (pura, chave = `Sequencia`)
  - `fetchSubCategorias(opts?: {forceRefresh?: boolean}) => Promise<Map<string, {Sequencia, SubCategoria, Categoria}>>`

- [ ] **Step 1: Adicionar script de teste ao `backend/package.json`**

Editar o campo `"scripts"` em `backend/package.json` para incluir:

```json
{
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test \"src/**/*.test.js\""
  }
}
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `backend/src/services/subcategorias.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubCategoriaIndex } from "./subcategorias.js";

const AMOSTRA_REAL = [
  { Chave: 8158, Sequencia: "005529", SubCategoria: "Disjuntor desarmando", Categoria: "Engenharia - Elétrica" },
  { Chave: 16744, Sequencia: "005705", SubCategoria: "Bebedouro", Categoria: "Manutenção - Equipamentos" },
  { Chave: 8609, Sequencia: "005651", SubCategoria: "Gerador - Quinzenal", Categoria: "Manutenção - Rotinas" },
];

test("buildSubCategoriaIndex indexa por Sequencia", () => {
  const index = buildSubCategoriaIndex(AMOSTRA_REAL);

  assert.equal(index.size, 3);
  assert.deepEqual(index.get("005705"), {
    Chave: 16744,
    Sequencia: "005705",
    SubCategoria: "Bebedouro",
    Categoria: "Manutenção - Equipamentos",
  });
});

test("buildSubCategoriaIndex retorna Map vazio para lista vazia", () => {
  const index = buildSubCategoriaIndex([]);
  assert.equal(index.size, 0);
});

test("buildSubCategoriaIndex ignora entradas sem Sequencia", () => {
  const index = buildSubCategoriaIndex([{ SubCategoria: "Lixo", Categoria: "X" }]);
  assert.equal(index.size, 0);
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run (a partir de `backend/`): `node --test src/services/subcategorias.test.js`
Expected: falha com erro de módulo não encontrado (`Cannot find module './subcategorias.js'` ou `buildSubCategoriaIndex is not a function`)

- [ ] **Step 4: Implementar `backend/src/services/subcategorias.js`**

```js
import { deskPost } from "./deskApi.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — árvore de categorias muda raramente

let cache = { index: null, fetchedAt: 0 };

export function buildSubCategoriaIndex(list) {
  const index = new Map();
  for (const item of list) {
    if (!item.Sequencia) continue;
    index.set(item.Sequencia, item);
  }
  return index;
}

export async function fetchSubCategorias({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

  if (!cache.index || isStale || forceRefresh) {
    const result = await deskPost("/SubCategorias/lista", {});
    cache = {
      index: buildSubCategoriaIndex(result.root ?? []),
      fetchedAt: Date.now(),
    };
  }

  return cache.index;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test src/services/subcategorias.test.js`
Expected: `pass 3`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/src/services/subcategorias.js backend/src/services/subcategorias.test.js
git commit -m "feat: adiciona serviço de SubCategorias com índice por Sequencia"
```

---

### Task 2: Serviço de Usuários (fetch + cache + mapa Cliente)

**Files:**
- Create: `backend/src/services/usuarios.js`
- Test: `backend/src/services/usuarios.test.js`

**Interfaces:**
- Consumes: `deskPost` (mesmo de Task 1)
- Produces:
  - `buildClientePorUsuario(list: Array<{Chave, Cliente}>) => Map<number, string>` (pura, chave = `Chave` do usuário)
  - `fetchUsuarios(opts?: {forceRefresh?: boolean}) => Promise<Map<number, string>>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/services/usuarios.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientePorUsuario } from "./usuarios.js";

const AMOSTRA_REAL = [
  { Chave: 20, CodigoCliente: 3, Cliente: "CD 300", Nome: "Leony", Sobrenome: "Silva" },
  { Chave: 586, CodigoCliente: 36, Cliente: "PORTO SEGURO", Nome: "Jose", Sobrenome: "Carlos" },
];

test("buildClientePorUsuario mapeia Chave do usuário para nome do Cliente", () => {
  const mapa = buildClientePorUsuario(AMOSTRA_REAL);

  assert.equal(mapa.size, 2);
  assert.equal(mapa.get(20), "CD 300");
  assert.equal(mapa.get(586), "PORTO SEGURO");
});

test("buildClientePorUsuario retorna Map vazio para lista vazia", () => {
  assert.equal(buildClientePorUsuario([]).size, 0);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test src/services/usuarios.test.js`
Expected: falha, `Cannot find module './usuarios.js'`

- [ ] **Step 3: Implementar `backend/src/services/usuarios.js`**

```js
import { deskPost } from "./deskApi.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — cadastro de usuários muda raramente

let cache = { clientePorUsuario: null, fetchedAt: 0 };

export function buildClientePorUsuario(list) {
  const mapa = new Map();
  for (const usuario of list) {
    if (usuario.Chave === undefined || usuario.Chave === null) continue;
    mapa.set(usuario.Chave, usuario.Cliente ?? null);
  }
  return mapa;
}

export async function fetchUsuarios({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

  if (!cache.clientePorUsuario || isStale || forceRefresh) {
    const result = await deskPost("/Usuarios/lista", {});
    cache = {
      clientePorUsuario: buildClientePorUsuario(result.root ?? []),
      fetchedAt: Date.now(),
    };
  }

  return cache.clientePorUsuario;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test src/services/usuarios.test.js`
Expected: `pass 2`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/usuarios.js backend/src/services/usuarios.test.js
git commit -m "feat: adiciona serviço de Usuarios com mapa Cliente por ChaveUsuario"
```

---

### Task 3: Classificador de taxonomia (Especialidade/Tipo/Equipamento)

**Files:**
- Create: `backend/src/services/taxonomia.js`
- Test: `backend/src/services/taxonomia.test.js`

**Interfaces:**
- Consumes: `Map<string, {Sequencia, SubCategoria, Categoria}>` produzido por `buildSubCategoriaIndex` (Task 1)
- Produces: `classificarChamado(chamado: {SequenciaSubCategoria: string}, subCategoriaIndex: Map) => ClassificacaoTaxonomia | null`

  onde `ClassificacaoTaxonomia = { especialidade: "Manutenção" | "Engenharia", tipo: "Preventiva" | "Corretiva" | "Rotina" | "Outros/Não classificado", tipoAtividade: string | null, equipamento: string | null }`

  Regras: `especialidade` = fora de escopo (não é "Manutenção" nem "Engenharia") → retorna `null`. Para "Engenharia", `tipo` é sempre `"Corretiva"`, `tipoAtividade` é o resto do nome da Categoria (ex: "Elétrica"), `equipamento` é sempre `null`. Para "Manutenção", `tipoAtividade` é sempre `null`; `tipo`/`equipamento` seguem as regras de prefixo descritas nos testes abaixo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/services/taxonomia.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubCategoriaIndex } from "./subcategorias.js";
import { classificarChamado } from "./taxonomia.js";

const SUBCATEGORIAS_REAIS = [
  { Sequencia: "005705", SubCategoria: "Bebedouro", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005653", SubCategoria: "Preventiva - Empilhadeira", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005898", SubCategoria: "Rotinas - Carrinho de compras", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005743", SubCategoria: "Sesmt - Documentação", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005646", SubCategoria: "TESTE-DUPLO", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005901", SubCategoria: "Outros", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005907", SubCategoria: "Demandas - Administrativas", Categoria: "Manutenção - Rotinas" },
  { Sequencia: "005529", SubCategoria: "Disjuntor desarmando", Categoria: "Engenharia - Elétrica" },
  { Sequencia: "005759", SubCategoria: "Acessiilidade", Categoria: "Sesmt - Solicitações" },
];

const INDEX = buildSubCategoriaIndex(SUBCATEGORIAS_REAIS);

test("equipamento sem prefixo é Corretiva", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005705" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Corretiva",
    tipoAtividade: null,
    equipamento: "Bebedouro",
  });
});

test('prefixo "Preventiva - " vira tipo Preventiva e extrai o equipamento', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005653" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Preventiva",
    tipoAtividade: null,
    equipamento: "Empilhadeira",
  });
});

test('prefixo "Rotinas - " vira tipo Rotina e extrai o equipamento', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005898" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Rotina",
    tipoAtividade: null,
    equipamento: "Carrinho de compras",
  });
});

test('Categoria "Manutenção - Rotinas" é sempre tipo Rotina, mesmo sem prefixo', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005907" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Rotina",
    tipoAtividade: null,
    equipamento: "Demandas - Administrativas",
  });
});

test('subcategoria "Sesmt - " dentro de Equipamentos cai em Outros/Não classificado', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005743" }, INDEX);
  assert.equal(resultado.tipo, "Outros/Não classificado");
  assert.equal(resultado.equipamento, "Sesmt - Documentação");
});

test('"TESTE-DUPLO" cai em Outros/Não classificado', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005646" }, INDEX);
  assert.equal(resultado.tipo, "Outros/Não classificado");
});

test('"Outros" cai em Outros/Não classificado', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005901" }, INDEX);
  assert.equal(resultado.tipo, "Outros/Não classificado");
});

test("Engenharia usa a Categoria como tipoAtividade, tipo sempre Corretiva", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005529" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Engenharia",
    tipo: "Corretiva",
    tipoAtividade: "Elétrica",
    equipamento: null,
  });
});

test("especialidade fora de escopo (Sesmt) retorna null", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005759" }, INDEX);
  assert.equal(resultado, null);
});

test("SequenciaSubCategoria desconhecida retorna null", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "999999" }, INDEX);
  assert.equal(resultado, null);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test src/services/taxonomia.test.js`
Expected: falha, `Cannot find module './taxonomia.js'`

- [ ] **Step 3: Implementar `backend/src/services/taxonomia.js`**

```js
const ESPECIALIDADES_EM_ESCOPO = new Set(["Manutenção", "Engenharia"]);

const PREFIXO_PREVENTIVA = "Preventiva - ";
const PREFIXO_ROTINA = "Rotinas - ";

const NAO_EQUIPAMENTO = [
  "Segurança - ",
  "Sesmt - ",
  "Transporte - ",
  "Tranporte - ",
  "TESTE-DUPLO",
  "Outros",
];

function primeiroSegmento(categoria) {
  return categoria.split(" - ")[0].trim();
}

function restoSegmentos(categoria) {
  return categoria.split(" - ").slice(1).join(" - ").trim();
}

function ehNaoEquipamento(nomeSubCategoria) {
  return NAO_EQUIPAMENTO.some(
    (prefixo) => nomeSubCategoria === prefixo || nomeSubCategoria.startsWith(prefixo)
  );
}

export function classificarChamado(chamado, subCategoriaIndex) {
  const sub = subCategoriaIndex.get(chamado.SequenciaSubCategoria);
  if (!sub) return null;

  const especialidade = primeiroSegmento(sub.Categoria);
  if (!ESPECIALIDADES_EM_ESCOPO.has(especialidade)) return null;

  if (especialidade === "Engenharia") {
    return {
      especialidade,
      tipo: "Corretiva",
      tipoAtividade: restoSegmentos(sub.Categoria),
      equipamento: null,
    };
  }

  // especialidade === "Manutenção"
  const nomeSub = sub.SubCategoria;

  if (sub.Categoria === "Manutenção - Rotinas") {
    return { especialidade, tipo: "Rotina", tipoAtividade: null, equipamento: nomeSub };
  }

  if (nomeSub.startsWith(PREFIXO_PREVENTIVA)) {
    return {
      especialidade,
      tipo: "Preventiva",
      tipoAtividade: null,
      equipamento: nomeSub.slice(PREFIXO_PREVENTIVA.length),
    };
  }

  if (nomeSub.startsWith(PREFIXO_ROTINA)) {
    return {
      especialidade,
      tipo: "Rotina",
      tipoAtividade: null,
      equipamento: nomeSub.slice(PREFIXO_ROTINA.length),
    };
  }

  if (ehNaoEquipamento(nomeSub)) {
    return { especialidade, tipo: "Outros/Não classificado", tipoAtividade: null, equipamento: nomeSub };
  }

  return { especialidade, tipo: "Corretiva", tipoAtividade: null, equipamento: nomeSub };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test src/services/taxonomia.test.js`
Expected: `pass 10`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/taxonomia.js backend/src/services/taxonomia.test.js
git commit -m "feat: adiciona classificador de taxonomia Manutenção/Engenharia"
```

---

### Task 4: Enriquecimento de chamados + endpoint de verificação

**Files:**
- Create: `backend/src/services/enriquecimento.js`
- Test: `backend/src/services/enriquecimento.test.js`
- Modify: `backend/src/routes/indicadores.js`

**Interfaces:**
- Consumes:
  - `classificarChamado` (Task 3)
  - `fetchSubCategorias`, `fetchUsuarios` (Tasks 1-2)
  - `fetchChamados` de `backend/src/services/chamados.js` (já existe, retorna `{data: Array, total: number, fetchedAt: number}`)
- Produces:
  - `enriquecerChamados(chamados: Array, {subCategoriaIndex: Map, clientePorUsuario: Map}) => Array<ChamadoEnriquecido>` (pura, filtra fora de escopo)

    onde `ChamadoEnriquecido = {...camposOriginaisDoChamado, especialidade, tipo, tipoAtividade, equipamento, cliente}` (todos os campos originais preservados via spread, mais os 5 campos novos; `cliente` é `string | null`)
  - `carregarChamadosEnriquecidos(opts?: {forceRefresh?: boolean}) => Promise<{chamados: Array<ChamadoEnriquecido>, totalOriginal: number}>`
  - Rota `GET /api/chamados-enriquecidos?refresh=true` no Express

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/services/enriquecimento.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubCategoriaIndex } from "./subcategorias.js";
import { buildClientePorUsuario } from "./usuarios.js";
import { enriquecerChamados } from "./enriquecimento.js";

const SUBCATEGORIA_INDEX = buildSubCategoriaIndex([
  { Sequencia: "005705", SubCategoria: "Bebedouro", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005759", SubCategoria: "Acessiilidade", Categoria: "Sesmt - Solicitações" },
]);

const CLIENTE_POR_USUARIO = buildClientePorUsuario([
  { Chave: 586, Cliente: "PORTO SEGURO" },
]);

test("enriquece chamado em escopo com taxonomia e cliente", () => {
  const chamados = [
    { Chave: 6544, SequenciaSubCategoria: "005705", ChaveUsuario: 586, Assunto: "Bebedouro quebrado" },
  ];

  const resultado = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
  });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].Chave, 6544);
  assert.equal(resultado[0].Assunto, "Bebedouro quebrado");
  assert.equal(resultado[0].especialidade, "Manutenção");
  assert.equal(resultado[0].tipo, "Corretiva");
  assert.equal(resultado[0].equipamento, "Bebedouro");
  assert.equal(resultado[0].cliente, "PORTO SEGURO");
});

test("descarta chamado fora de escopo (Sesmt)", () => {
  const chamados = [{ Chave: 1, SequenciaSubCategoria: "005759", ChaveUsuario: 586 }];

  const resultado = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
  });

  assert.equal(resultado.length, 0);
});

test("cliente fica null quando ChaveUsuario não está no mapa", () => {
  const chamados = [{ Chave: 2, SequenciaSubCategoria: "005705", ChaveUsuario: 9999 }];

  const resultado = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
  });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].cliente, null);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test src/services/enriquecimento.test.js`
Expected: falha, `Cannot find module './enriquecimento.js'`

- [ ] **Step 3: Implementar `backend/src/services/enriquecimento.js`**

```js
import { classificarChamado } from "./taxonomia.js";
import { fetchSubCategorias } from "./subcategorias.js";
import { fetchUsuarios } from "./usuarios.js";
import { fetchChamados } from "./chamados.js";

export function enriquecerChamados(chamados, { subCategoriaIndex, clientePorUsuario }) {
  const enriquecidos = [];

  for (const chamado of chamados) {
    const classificacao = classificarChamado(chamado, subCategoriaIndex);
    if (!classificacao) continue;

    enriquecidos.push({
      ...chamado,
      ...classificacao,
      cliente: clientePorUsuario.get(chamado.ChaveUsuario) ?? null,
    });
  }

  return enriquecidos;
}

export async function carregarChamadosEnriquecidos({ forceRefresh = false } = {}) {
  const [{ data: chamados, total: totalOriginal }, subCategoriaIndex, clientePorUsuario] = await Promise.all([
    fetchChamados({ forceRefresh }),
    fetchSubCategorias({ forceRefresh }),
    fetchUsuarios({ forceRefresh }),
  ]);

  const enriquecidos = enriquecerChamados(chamados, { subCategoriaIndex, clientePorUsuario });

  return { chamados: enriquecidos, totalOriginal };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test src/services/enriquecimento.test.js`
Expected: `pass 3`, `fail 0`

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `node --test "src/**/*.test.js"` (equivalente a `npm test`)

> Não usar `node --test src/` (diretório puro, sem glob) — nesta versão do Node ele também tenta carregar `src/index.js` como teste, o que sobe o servidor Express de verdade e falha com `EADDRINUSE`. Descoberto e corrigido durante a Task 1.

Expected: todos os testes de `subcategorias.test.js`, `usuarios.test.js`, `taxonomia.test.js` e `enriquecimento.test.js` passando (18 testes no total), `fail 0`

- [ ] **Step 6: Adicionar rota de verificação em `backend/src/routes/indicadores.js`**

Adicionar ao arquivo existente (após a rota `/indicadores` já implementada):

```js
import { carregarChamadosEnriquecidos } from "../services/enriquecimento.js";
```

(adicionar esse import junto aos outros imports no topo do arquivo)

```js
indicadoresRouter.get("/chamados-enriquecidos", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados, totalOriginal } = await carregarChamadosEnriquecidos({ forceRefresh });

    res.json({
      totalOriginal,
      totalEnriquecido: chamados.length,
      porEspecialidade: {
        Manutenção: chamados.filter((c) => c.especialidade === "Manutenção").length,
        Engenharia: chamados.filter((c) => c.especialidade === "Engenharia").length,
      },
      amostra: chamados.slice(0, 5),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

- [ ] **Step 7: Verificar manualmente contra a API real**

Com o backend rodando (`npm run dev` dentro de `backend/`, lembrando de exportar `NODE_EXTRA_CA_CERTS` nesta máquina — ver `backend/.env.example` e a nota sobre o certificado corporativo), rodar:

```bash
curl -s "http://localhost:3001/api/chamados-enriquecidos" | node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')), null, 2))"
```

Expected: JSON com `totalOriginal` (~3327), `totalEnriquecido` menor que `totalOriginal` (só Manutenção+Engenharia), `porEspecialidade.Manutenção` + `porEspecialidade.Engenharia` somando `totalEnriquecido`, e uma `amostra` de 5 chamados cada um com `especialidade`, `tipo`, `equipamento`/`tipoAtividade` e `cliente` preenchidos.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/enriquecimento.js backend/src/services/enriquecimento.test.js backend/src/routes/indicadores.js
git commit -m "feat: enriquece chamados com taxonomia e cliente, expõe endpoint de verificação"
```

---

## O que este plano NÃO cobre (fica para os próximos planos)

- Autenticação/RBAC/SQLite (`Guilherme/Indicadores Desk/decisoes/rbac-permissoes.md`)
- Páginas de frontend (navegação em abas, Manutenção, Engenharia, Lista de Chamados)
- Filtros de data (hoje/semana passada/mês fiscal 26→26/personalizado) e auto-refresh configurável
- Indicador de custo (endpoint de custos/interações ainda não investigado)

Esses viram planos separados, nessa ordem, depois que este for revisado e mesclado.
