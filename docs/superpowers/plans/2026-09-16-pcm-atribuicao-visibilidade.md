# Painel PCM — Atribuição e Visibilidade de Chamados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a página "PCM" onde o PCM sobrepõe a distribuição automática do Desk Manager com sua própria atribuição por chamado (urgência de manutenção, observação, data prevista de solução), agrupa pessoas em grupos (Manutenção/Engenharia/SESMT/...), acompanha a carga por grupo → pessoa → urgência, visualiza status de prazo (atrasado/vence esta semana/no prazo/sem data) e exporta tudo isso pra Excel com os dados completos (inclusive o texto de abertura do solicitante).

**Architecture:** Duas tabelas relacionais novas no Supabase (`pcm_grupos`, `pcm_pessoas_grupo`, `pcm_atribuicoes_chamados`) guardadas em cache de memória e populadas via `inicializar()` na subida do backend — mesmo padrão de `prioridades.js`/`configuracaoEquipamentos.js`, só que com upsert unitário por linha (não reescrita de blob inteiro). "Distribuição" do Desk não é um campo novo: é `NomeOperador`+`SobrenomeOperador` (já usado em todo o projeto), anexado ao chamado enriquecido como `distribuicaoSistema`; o texto de abertura do solicitante (`descricaoAbertura`) já vem no próprio endpoint de lista do Desk (`Descricao`), sem custo de chamada extra. Uma função pura (`resolverAtribuicaoEfetiva`) decide, por chamado, se mostra a atribuição manual do PCM ou a distribuição do sistema — usada tanto na tabela principal quanto nos dois níveis de indicador (por grupo, por pessoa dentro de um grupo). Todo o front mora numa página nova (`Pcm.jsx`) com 3 sub-abas, reaproveitando 100% os componentes/padrões já existentes (`StatTile`, `SubTabs`, `Modal`, `exportarLinhas`) — nenhum CSS novo é necessário.

**Tech Stack:** Node.js (Express, ESM) no backend; React 18 + Vite no frontend; `@supabase/supabase-js` (já instalado); `node:test` + `node:assert/strict` para testes de backend; sem framework de teste no frontend (verificação manual no navegador via `npm run dev`).

## Global Constraints

- Backend é ESM puro (`"type": "module"`) — sempre `import`/`export`, nunca `require`.
- Testes de backend em `*.test.js` ao lado do código testado, descobertos por `npm test` (`node --test "src/**/*.test.js"`, de dentro de `backend/`) — só cobrem funções puras, nunca chamadas reais ao Supabase/Desk.
- Sem TypeScript em nenhuma parte do projeto.
- Toda string de interface, comentário e mensagem de erro em português.
- Frontend não tem framework de teste — toda task de frontend termina com um passo de verificação manual no navegador (`npm run dev` no frontend, backend já rodando com `npm run dev` também).
- Sistema não tem login — mesmo padrão do resto do app (lista única, compartilhada). Não introduzir autenticação.
- Escopo é só chamados de Manutenção e Engenharia — mesmo escopo que `carregarChamadosEnriquecidos()` já aplica (chamados de outras áreas do Desk já saem descartados por `classificarChamado`, então nenhum filtro extra de área é necessário nas rotas novas).
- Migrations do Supabase não são aplicadas por nenhum script automático neste projeto — o SQL é colado manualmente no SQL Editor do painel do Supabase (mesmo processo usado em `0001_init.sql`). Cada task que precisar disso deixa isso explícito.
- Seguir os padrões visuais já existentes (`page-toolbar`, `filter-bar`, `panel full-width`, `stat-grid`/`StatTile`, `SubTabs`, `Modal`, `clickable-row`, `.num`) — nenhuma classe CSS nova é necessária neste plano.

---

## File Structure

**Backend — novo:**
- `supabase/migrations/0002_pcm_atribuicoes.sql` — schema (`pcm_grupos`, `pcm_pessoas_grupo`, `pcm_atribuicoes_chamados`).
- `backend/src/services/pcmPessoas.js` — grupos + mapeamento pessoa→grupo.
- `backend/src/services/pcmPessoas.test.js`
- `backend/src/services/pcmAtribuicoes.js` — atribuição do PCM por chamado + regra de exibição efetiva + indicadores por grupo/pessoa.
- `backend/src/services/pcmAtribuicoes.test.js`
- `backend/src/services/prazo.js` — `classificarPrazo`.
- `backend/src/services/prazo.test.js`
- `backend/src/routes/pcm.js` — todas as rotas `/pcm/*`.

**Backend — modificado:**
- `backend/src/services/enriquecimento.js` — anexa `distribuicaoSistema` e `descricaoAbertura`.
- `backend/src/services/enriquecimento.test.js`
- `backend/src/index.js` — monta `pcmRouter` + `inicializar()` dos 2 novos serviços.

**Frontend — novo:**
- `frontend/src/pages/Pcm.jsx` — shell da página (abas + filtro Aberto/Fechado/Todos).
- `frontend/src/components/PcmPessoasTab.jsx`
- `frontend/src/components/PcmAtribuicoesTab.jsx`
- `frontend/src/components/PcmPorGrupoTab.jsx`
- `frontend/src/components/PcmListaSimples.jsx`
- `frontend/src/lib/pcmColunasExport.js`

**Frontend — modificado:**
- `frontend/src/api.js` — funções novas (`fetchPcmPessoas`, `criarPcmGrupo`, `salvarPcmPessoaGrupo`, `fetchPcmAtribuicoes`, `salvarPcmAtribuicao`, `fetchPcmIndicadorGrupo`, `fetchPcmIndicadorPessoa`).
- `frontend/src/App.jsx` — `NavLink`/`<Route path="/pcm">`.

---

## Task 1: Migration `pcm_grupos` / `pcm_pessoas_grupo` / `pcm_atribuicoes_chamados`

**Files:**
- Create: `supabase/migrations/0002_pcm_atribuicoes.sql`

**Interfaces:**
- Produces (usado por todas as tasks seguintes): tabelas `pcm_grupos(nome, criado_em)`, `pcm_pessoas_grupo(chave_pessoa, grupo, atualizado_em)`, `pcm_atribuicoes_chamados(cod_chamado, grupo, pessoa, urgencia, observacao, data_prevista_solucao, atualizado_em)`.

Task 100% backend/infra, sem nenhuma mudança visível ainda.

- [ ] **Step 1: Criar o arquivo da migration**

```sql
-- supabase/migrations/0002_pcm_atribuicoes.sql

-- RLS desligado de propósito, mesmo racional de 0001_init.sql: só o backend acessa via
-- service_role key, nunca exposta ao navegador — não há caminho de acesso do cliente.

create table pcm_grupos (
  nome text primary key,
  criado_em timestamptz not null default now()
);

comment on table pcm_grupos is
  'Grupos de pessoas usados no painel PCM (ex: Manutenção, Engenharia, SESMT). Editável pela aba "Pessoas/Grupos" — não é uma lista fixa, o PCM pode criar novos grupos a qualquer momento.';

insert into pcm_grupos (nome) values ('Manutenção'), ('Engenharia'), ('SESMT');

create table pcm_pessoas_grupo (
  chave_pessoa text primary key,
  grupo text not null references pcm_grupos (nome),
  atualizado_em timestamptz not null default now()
);

comment on table pcm_pessoas_grupo is
  'Mapeia cada pessoa (nome completo do operador, como vem de NomeOperador+SobrenomeOperador no Desk Manager — não há ID numérico disponível no endpoint de lista) para um único grupo. Editável pela aba "Pessoas/Grupos" do painel PCM.';

create table pcm_atribuicoes_chamados (
  cod_chamado text primary key,
  grupo text not null references pcm_grupos (nome),
  pessoa text not null,
  urgencia text not null check (urgencia in ('Crítica', 'Alta', 'Média', 'Baixa')),
  observacao text,
  data_prevista_solucao date,
  atualizado_em timestamptz not null default now()
);

comment on table pcm_atribuicoes_chamados is
  'Só existe uma linha aqui quando o PCM edita algo (urgência/observação/data prevista) num chamado — chamados intocados não geram linha e continuam mostrando a distribuição automática do Desk. pessoa/grupo são sempre a pessoa/grupo efetivos no momento da edição (snapshot, sem histórico).';
```

- [ ] **Step 2: Aplicar a migration no Supabase (ação manual, fora do código)**

Abrir o painel do Supabase → SQL Editor → colar o conteúdo do arquivo acima → Run. (Mesmo processo usado pra aplicar `0001_init.sql` — este projeto não tem CLI/script de migração automático.)

- [ ] **Step 3: Verificar que as tabelas existem e os 3 grupos foram semeados**

Run (de dentro de `backend/`):

```bash
node --input-type=module -e "
import 'dotenv/config';
import { getSupabaseClient } from './src/services/supabaseClient.js';
const sb = getSupabaseClient();
const { data, error } = await sb.from('pcm_grupos').select('nome').order('nome');
if (error) throw error;
console.log(data);
"
```

Expected: `[ { nome: 'Engenharia' }, { nome: 'Manutenção' }, { nome: 'SESMT' } ]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_pcm_atribuicoes.sql
git commit -m "feat: adiciona schema do painel PCM (grupos, pessoas-grupo, atribuições)"
```

---

## Task 2: `enriquecimento.js` anexa `distribuicaoSistema` e `descricaoAbertura`

**Files:**
- Modify: `backend/src/services/enriquecimento.js`
- Modify: `backend/src/services/enriquecimento.test.js`

**Interfaces:**
- Consumes: nada de novo (usa campos que já vêm em `chamado`: `NomeOperador`, `SobrenomeOperador`, `Descricao`).
- Produces (usado pelas Tasks 4-7): `enriquecerChamados(...)` agora retorna objetos com `distribuicaoSistema: string | null` e `descricaoAbertura: string | null`.

Backend-only, sem mudança visível ainda.

- [ ] **Step 1: Escrever os testes (vão falhar — os campos ainda não existem)**

Adicionar ao final de `backend/src/services/enriquecimento.test.js` (mantendo os testes existentes intactos):

```javascript
test("anexa distribuicaoSistema a partir de NomeOperador+SobrenomeOperador", () => {
  const chamados = [
    {
      Chave: 1,
      SequenciaSubCategoria: "005705",
      ChaveUsuario: 586,
      NomeOperador: "Nadson",
      SobrenomeOperador: "da Conceição",
    },
  ];

  const [enriquecido] = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(enriquecido.distribuicaoSistema, "Nadson da Conceição");
});

test("distribuicaoSistema fica null quando não há operador", () => {
  const chamados = [{ Chave: 2, SequenciaSubCategoria: "005705", ChaveUsuario: 586 }];

  const [enriquecido] = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(enriquecido.distribuicaoSistema, null);
});

test("anexa descricaoAbertura a partir de Descricao", () => {
  const chamados = [
    {
      Chave: 3,
      SequenciaSubCategoria: "005705",
      ChaveUsuario: 586,
      Descricao: "É necessário fazer uma desobstrução na caixa de gordura.",
    },
  ];

  const [enriquecido] = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(enriquecido.descricaoAbertura, "É necessário fazer uma desobstrução na caixa de gordura.");
});

test("descricaoAbertura fica null quando Descricao não vem no chamado", () => {
  const chamados = [{ Chave: 4, SequenciaSubCategoria: "005705", ChaveUsuario: 586 }];

  const [enriquecido] = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(enriquecido.descricaoAbertura, null);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/enriquecimento.test.js`
Expected: FAIL — os 4 testes novos, `distribuicaoSistema`/`descricaoAbertura` são `undefined`.

- [ ] **Step 3: Implementar em `enriquecimento.js`**

Adicionar a função (perto de `ufDoChamado`/`anexarUf`, mesmo estilo):

```javascript
// "Distribuição" no Desk Manager não é um campo próprio — é a junção visual de
// NomeOperador+SobrenomeOperador (quem está com o chamado) com NomeGrupo (fila interna do
// Desk, ex: "MANUTENÇÃO - GERAL", que NÃO é o "grupo" deste projeto e é ignorada aqui).
// Confirmado inspecionando a API real do Desk em 2026-09-16.
export function distribuicaoSistemaDoChamado(chamado) {
  const nome = [chamado.NomeOperador, chamado.SobrenomeOperador].filter(Boolean).join(" ");
  return nome || null;
}
```

Modificar `enriquecerChamados` (dentro do `for`, no objeto empurrado para `enriquecidos`):

```javascript
    enriquecidos.push({
      ...chamado,
      ...classificacao,
      ...parseSlaNivel(chamado.NomePrioridade),
      cliente,
      solicitante: nomePorUsuario?.get(chamado.ChaveUsuario) ?? null,
      uf: ufDoChamado(chamado, { codigoClientePorUsuario, ufPorCodigoCliente }),
      distribuicaoSistema: distribuicaoSistemaDoChamado(chamado),
      descricaoAbertura: chamado.Descricao ?? null,
    });
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/enriquecimento.test.js`
Expected: PASS — todos os testes (os já existentes + os 4 novos)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/enriquecimento.js backend/src/services/enriquecimento.test.js
git commit -m "feat: anexa distribuicaoSistema e descricaoAbertura aos chamados enriquecidos"
```

---

## Task 3: `pcmPessoas.js` + rotas de pessoas/grupos + aba "Pessoas/Grupos" (PRIMEIRA ENTREGA VISÍVEL)

**Files:**
- Create: `backend/src/services/pcmPessoas.js`
- Create: `backend/src/services/pcmPessoas.test.js`
- Create: `backend/src/routes/pcm.js`
- Modify: `backend/src/index.js`
- Create: `frontend/src/components/PcmPessoasTab.jsx`
- Create: `frontend/src/pages/Pcm.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js`

**Interfaces:**
- Consumes: `carregarChamadosEnriquecidos()` (já existe); `chamado.distribuicaoSistema` (Task 2).
- Produces (usado pelas Tasks 4-7): `listarGrupos(): string[]`, `listarPessoasGrupo(): Map<string,string>`, `grupoDaPessoa(pessoa: string|null, pessoasGrupo?: Map): string|null`, `deveCriarGrupo(gruposAtuais: string[], nome: string): boolean`, `criarGrupo(nome): Promise<string[]>`, `definirGrupoDaPessoa(pessoa, grupo): Promise<Map>`.

Primeira entrega que aparece no navegador: nova aba "PCM" na navegação, com a lista de pessoas detectadas na distribuição do Desk e um lugar pra criar grupos e classificar cada pessoa.

- [ ] **Step 1: Escrever os testes de `pcmPessoas.js` (vão falhar — o módulo ainda não existe)**

Criar `backend/src/services/pcmPessoas.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { grupoDaPessoa, deveCriarGrupo } from "./pcmPessoas.js";

test("grupoDaPessoa retorna o grupo mapeado", () => {
  const mapa = new Map([["Nadson da Conceição", "Manutenção"]]);
  assert.equal(grupoDaPessoa("Nadson da Conceição", mapa), "Manutenção");
});

test("grupoDaPessoa retorna null quando a pessoa não está mapeada", () => {
  assert.equal(grupoDaPessoa("Fulano de Tal", new Map()), null);
});

test("grupoDaPessoa retorna null pra pessoa vazia ou nula", () => {
  assert.equal(grupoDaPessoa(null, new Map()), null);
  assert.equal(grupoDaPessoa("", new Map()), null);
});

test("deveCriarGrupo aceita nome novo e não vazio", () => {
  assert.equal(deveCriarGrupo(["Manutenção"], "Engenharia"), true);
});

test("deveCriarGrupo rejeita nome vazio ou só espaço", () => {
  assert.equal(deveCriarGrupo(["Manutenção"], "   "), false);
});

test("deveCriarGrupo rejeita duplicata exata", () => {
  assert.equal(deveCriarGrupo(["Manutenção"], "Manutenção"), false);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/pcmPessoas.test.js`
Expected: FAIL — `Cannot find module './pcmPessoas.js'`

- [ ] **Step 3: Implementar `pcmPessoas.js`**

```javascript
// backend/src/services/pcmPessoas.js
import { getSupabaseClient } from "./supabaseClient.js";

let cacheGrupos = null;
let cachePessoasGrupo = null; // Map<pessoa, grupo>

export async function inicializar() {
  const supabase = getSupabaseClient();
  const [{ data: grupos, error: erroGrupos }, { data: pessoas, error: erroPessoas }] = await Promise.all([
    supabase.from("pcm_grupos").select("nome").order("nome"),
    supabase.from("pcm_pessoas_grupo").select("chave_pessoa, grupo"),
  ]);

  if (erroGrupos) throw erroGrupos;
  if (erroPessoas) throw erroPessoas;

  cacheGrupos = grupos.map((g) => g.nome);
  cachePessoasGrupo = new Map(pessoas.map((p) => [p.chave_pessoa, p.grupo]));
  return { grupos: cacheGrupos, pessoasGrupo: cachePessoasGrupo };
}

export function listarGrupos() {
  return cacheGrupos ?? [];
}

export function listarPessoasGrupo() {
  return cachePessoasGrupo ?? new Map();
}

export function grupoDaPessoa(pessoa, pessoasGrupo = listarPessoasGrupo()) {
  if (!pessoa) return null;
  return pessoasGrupo.get(pessoa) ?? null;
}

// Pura — nome não vazio e sem duplicata exata. Mesma regra usada por adicionarGrupo() em
// ConfiguracaoEquipamentos.jsx, só que aqui persiste em tabela em vez de array num blob.
export function deveCriarGrupo(gruposAtuais, nome) {
  const nomeTrim = (nome ?? "").trim();
  return Boolean(nomeTrim) && !gruposAtuais.includes(nomeTrim);
}

export async function criarGrupo(nome) {
  if (!deveCriarGrupo(listarGrupos(), nome)) return listarGrupos();

  const nomeTrim = nome.trim();
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("pcm_grupos").insert({ nome: nomeTrim });
  if (error) throw error;

  cacheGrupos = [...listarGrupos(), nomeTrim].sort((a, b) => a.localeCompare(b));
  return cacheGrupos;
}

export async function definirGrupoDaPessoa(pessoa, grupo) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("pcm_pessoas_grupo")
    .upsert({ chave_pessoa: pessoa, grupo, atualizado_em: new Date().toISOString() });
  if (error) throw error;

  const novoMapa = new Map(listarPessoasGrupo());
  novoMapa.set(pessoa, grupo);
  cachePessoasGrupo = novoMapa;
  return cachePessoasGrupo;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/pcmPessoas.test.js`
Expected: PASS — 6 testes ok

- [ ] **Step 5: Criar `backend/src/routes/pcm.js`**

```javascript
// backend/src/routes/pcm.js
import { Router } from "express";
import { carregarChamadosEnriquecidos } from "../services/enriquecimento.js";
import { listarGrupos, listarPessoasGrupo, criarGrupo, definirGrupoDaPessoa } from "../services/pcmPessoas.js";

export const pcmRouter = Router();

function pessoasConhecidas(chamados) {
  const nomes = new Set();
  for (const c of chamados) {
    if (c.distribuicaoSistema) nomes.add(c.distribuicaoSistema);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

pcmRouter.get("/pcm/pessoas", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const pessoasGrupo = listarPessoasGrupo();

    const pessoas = pessoasConhecidas(chamados).map((pessoa) => ({
      pessoa,
      grupo: pessoasGrupo.get(pessoa) ?? null,
    }));

    res.json({ grupos: listarGrupos(), pessoas });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

pcmRouter.post("/pcm/grupos", async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) {
      res.status(400).json({ erro: "Nome do grupo é obrigatório" });
      return;
    }

    const grupos = await criarGrupo(nome);
    res.json({ grupos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});

pcmRouter.put("/pcm/pessoas/:pessoa", async (req, res) => {
  try {
    const { grupo } = req.body;
    if (!grupo || !listarGrupos().includes(grupo)) {
      res.status(400).json({ erro: `Grupo "${grupo}" não existe` });
      return;
    }

    const pessoasGrupo = await definirGrupoDaPessoa(req.params.pessoa, grupo);
    res.json({ pessoa: req.params.pessoa, grupo: pessoasGrupo.get(req.params.pessoa) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});
```

- [ ] **Step 6: Montar `pcmRouter` e inicializar `pcmPessoas` em `backend/src/index.js`**

Adicionar os imports no topo:

```javascript
import { pcmRouter } from "./routes/pcm.js";
import { inicializar as inicializarPcmPessoas } from "./services/pcmPessoas.js";
```

Trocar `app.use("/api", indicadoresRouter);` por:

```javascript
app.use("/api", indicadoresRouter);
app.use("/api", pcmRouter);
```

Trocar o `Promise.all` de inicialização:

```javascript
  await Promise.all([
    inicializarPrioridades(),
    inicializarConfiguracaoEquipamentos(),
    inicializarConfiguracaoIndicadores(),
    inicializarPcmPessoas(),
  ]);
```

- [ ] **Step 7: Adicionar as funções novas em `frontend/src/api.js`**

```javascript
export function fetchPcmPessoas(opts) {
  return getJson("/api/pcm/pessoas", opts ?? {});
}

export async function criarPcmGrupo(nome) {
  const response = await fetch("/api/pcm/grupos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao criar grupo");
  return data;
}

export async function salvarPcmPessoaGrupo(pessoa, grupo) {
  const response = await fetch(`/api/pcm/pessoas/${encodeURIComponent(pessoa)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grupo }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao salvar grupo da pessoa");
  return data;
}
```

- [ ] **Step 8: Criar `frontend/src/components/PcmPessoasTab.jsx`**

```javascript
// frontend/src/components/PcmPessoasTab.jsx
import { useEffect, useState } from "react";
import { fetchPcmPessoas, criarPcmGrupo, salvarPcmPessoaGrupo } from "../api.js";

export function PcmPessoasTab() {
  const [state, setState] = useState({ status: "loading", grupos: [], pessoas: [], error: null });
  const [novoGrupo, setNovoGrupo] = useState("");

  async function carregar() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const { grupos, pessoas } = await fetchPcmPessoas();
      setState({ status: "ready", grupos, pessoas, error: null });
    } catch (error) {
      setState({ status: "error", grupos: [], pessoas: [], error: error.message });
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleCriarGrupo(e) {
    e.preventDefault();
    if (!novoGrupo.trim()) return;
    try {
      const { grupos } = await criarPcmGrupo(novoGrupo.trim());
      setState((s) => ({ ...s, grupos, error: null }));
      setNovoGrupo("");
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    }
  }

  async function handleMudarGrupo(pessoa, grupo) {
    try {
      await salvarPcmPessoaGrupo(pessoa, grupo);
      setState((s) => ({
        ...s,
        error: null,
        pessoas: s.pessoas.map((p) => (p.pessoa === pessoa ? { ...p, grupo } : p)),
      }));
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    }
  }

  if (state.status === "loading") return <p className="subtitle">Carregando pessoas...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar pessoas: {state.error}</div>;

  const semGrupo = state.pessoas.filter((p) => !p.grupo);
  const comGrupo = state.pessoas.filter((p) => p.grupo);

  return (
    <div>
      <form className="filter-bar" onSubmit={handleCriarGrupo}>
        <input
          type="text"
          className="search-input"
          style={{ maxWidth: 220 }}
          placeholder="Nome do novo grupo..."
          value={novoGrupo}
          onChange={(e) => setNovoGrupo(e.target.value)}
        />
        <button className="refresh-btn" type="submit" disabled={!novoGrupo.trim()}>
          + Novo grupo
        </button>
      </form>

      {state.error && <div className="state-banner error">{state.error}</div>}

      {semGrupo.length > 0 && (
        <div className="state-banner warning">
          {semGrupo.length} pessoa(s) apareceram na distribuição do Desk mas ainda não têm grupo definido — classifique
          abaixo.
        </div>
      )}

      <div className="panel full-width">
        <table>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Grupo</th>
            </tr>
          </thead>
          <tbody>
            {[...semGrupo, ...comGrupo].map((p) => (
              <tr key={p.pessoa}>
                <td>{p.pessoa}</td>
                <td>
                  <select value={p.grupo ?? ""} onChange={(e) => handleMudarGrupo(p.pessoa, e.target.value)}>
                    <option value="" disabled>
                      Selecione um grupo...
                    </option>
                    {state.grupos.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {state.pessoas.length === 0 && (
              <tr>
                <td colSpan={2} className="meta">
                  Nenhuma pessoa encontrada na distribuição de chamados de Manutenção/Engenharia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Criar `frontend/src/pages/Pcm.jsx`**

```javascript
// frontend/src/pages/Pcm.jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import { PcmPessoasTab } from "../components/PcmPessoasTab.jsx";

const TABS = [{ value: "pessoas", label: "Pessoas/Grupos" }];

export default function Pcm() {
  const [aba, setAba] = useState("pessoas");

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>PCM</h2>
          <p className="subtitle">
            Atribuição e acompanhamento de chamados de Manutenção/Engenharia por pessoa e grupo.
          </p>
        </div>
      </div>

      <SubTabs options={TABS} active={aba} onChange={setAba} />

      {aba === "pessoas" && <PcmPessoasTab />}
    </div>
  );
}
```

- [ ] **Step 10: Adicionar o `NavLink`/`<Route>` em `frontend/src/App.jsx`**

Adicionar o import:

```javascript
import Pcm from "./pages/Pcm.jsx";
```

Adicionar o `NavLink` (entre "Performance" e "Prioritários"):

```javascript
          <NavLink to="/pcm" className={({ isActive }) => (isActive ? "active" : "")}>
            PCM
          </NavLink>
```

Adicionar a `<Route>` (entre "/performance" e "/prioritarios"):

```javascript
        <Route path="/pcm" element={<Pcm />} />
```

- [ ] **Step 11: Rodar toda a suíte de testes do backend**

Run: `cd backend && npm test`
Expected: PASS — todos os testes existentes + os 6 novos de `pcmPessoas.test.js`

- [ ] **Step 12: Verificação manual no navegador**

Run: `cd backend && npm run dev` (num terminal) e `cd frontend && npm run dev` (em outro)

Abrir o navegador em `http://localhost:5173/pcm`. Confirmar:
- Aparece o link "PCM" na navegação e a página abre com a aba "Pessoas/Grupos".
- A tabela lista pessoas reais (nomes de operadores do Desk).
- Digitar um nome em "Nome do novo grupo..." e clicar "+ Novo grupo" faz esse grupo aparecer no `<select>` de qualquer pessoa.
- Selecionar um grupo pra uma pessoa salva (recarregar a página e o grupo continua selecionado).

- [ ] **Step 13: Commit**

```bash
git add backend/src/services/pcmPessoas.js backend/src/services/pcmPessoas.test.js backend/src/routes/pcm.js backend/src/index.js frontend/src/components/PcmPessoasTab.jsx frontend/src/pages/Pcm.jsx frontend/src/App.jsx frontend/src/api.js
git commit -m "feat: adiciona painel PCM com aba Pessoas/Grupos"
```

---

## Task 4: `pcmAtribuicoes.js` (regra de exibição efetiva + upsert) e `prazo.js`

**Files:**
- Create: `backend/src/services/prazo.js`
- Create: `backend/src/services/prazo.test.js`
- Create: `backend/src/services/pcmAtribuicoes.js`
- Create: `backend/src/services/pcmAtribuicoes.test.js`
- Modify: `backend/src/index.js`

**Interfaces:**
- Consumes: `grupoDaPessoa` (Task 3); `chamado.distribuicaoSistema`/`chamado.descricaoAbertura` (Task 2).
- Produces (usado pelas Tasks 5-7): `classificarPrazo(dataPrevistaSolucao: string|null, hoje?: Date): "atrasado"|"vence-semana"|"no-prazo"|"sem-data"`; `resolverAtribuicaoEfetiva(chamado, atribuicaoPcm, grupoDaPessoaFn): {origem, pessoa, grupo, urgencia, observacao, dataPrevistaSolucao}`; `atribuicaoDoChamado(codChamado)`; `salvarAtribuicao(codChamado, {grupo, pessoa, urgencia, observacao, dataPrevistaSolucao})`.

Backend-only, sem mudança visível ainda — a próxima task já entrega a tela funcionando de ponta a ponta.

- [ ] **Step 1: Escrever os testes de `prazo.js` (vão falhar — o módulo ainda não existe)**

Criar `backend/src/services/prazo.test.js`. `2026-09-16` é uma quarta-feira; a semana de calendário (segunda a domingo) que a contém vai de `2026-09-14` a `2026-09-20` (confirmado via `new Date(2026,8,dia).getDay()`):

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarPrazo } from "./prazo.js";

const HOJE = new Date(2026, 8, 16); // quarta-feira, 16/09/2026

test("classificarPrazo retorna 'atrasado' pra data prevista no passado", () => {
  assert.equal(classificarPrazo("2026-09-10", HOJE), "atrasado");
});

test("classificarPrazo retorna 'vence-semana' pra hoje mesmo (não é atrasado)", () => {
  assert.equal(classificarPrazo("2026-09-16", HOJE), "vence-semana");
});

test("classificarPrazo retorna 'vence-semana' pro último dia da semana de calendário (domingo)", () => {
  assert.equal(classificarPrazo("2026-09-20", HOJE), "vence-semana");
});

test("classificarPrazo retorna 'no-prazo' pra data da semana seguinte", () => {
  assert.equal(classificarPrazo("2026-09-21", HOJE), "no-prazo");
});

test("classificarPrazo retorna 'sem-data' quando não há data prevista", () => {
  assert.equal(classificarPrazo(null, HOJE), "sem-data");
  assert.equal(classificarPrazo(undefined, HOJE), "sem-data");
  assert.equal(classificarPrazo("", HOJE), "sem-data");
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/prazo.test.js`
Expected: FAIL — `Cannot find module './prazo.js'`

- [ ] **Step 3: Implementar `prazo.js`**

```javascript
// backend/src/services/prazo.js

// Segunda-feira da semana de calendário que contém `data` — Date.getDay() é 0=domingo,
// 1=segunda... 6=sábado, então o desvio até a segunda é (1 - dia), exceto domingo (-6).
function inicioSemana(data) {
  const dia = data.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const inicio = new Date(data);
  inicio.setDate(data.getDate() + diff);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

// "Vence esta semana" usa semana de calendário (segunda a domingo), não janela móvel de 7
// dias — decisão tomada em conversa com o usuário.
export function classificarPrazo(dataPrevistaSolucao, hoje = new Date()) {
  if (!dataPrevistaSolucao) return "sem-data";

  const prevista = new Date(`${dataPrevistaSolucao}T00:00:00`);
  const hojeSemHora = new Date(hoje);
  hojeSemHora.setHours(0, 0, 0, 0);

  if (prevista < hojeSemHora) return "atrasado";

  const inicioSemanaAtual = inicioSemana(hojeSemHora);
  const fimSemanaAtual = new Date(inicioSemanaAtual);
  fimSemanaAtual.setDate(inicioSemanaAtual.getDate() + 6);
  fimSemanaAtual.setHours(23, 59, 59, 999);

  if (prevista >= inicioSemanaAtual && prevista <= fimSemanaAtual) return "vence-semana";

  return "no-prazo";
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/prazo.test.js`
Expected: PASS — 5 testes ok

- [ ] **Step 5: Escrever os testes de `pcmAtribuicoes.js` (vão falhar — o módulo ainda não existe)**

Criar `backend/src/services/pcmAtribuicoes.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverAtribuicaoEfetiva, buildIndicadorPorGrupo, buildIndicadorPorPessoa } from "./pcmAtribuicoes.js";

const grupoDaPessoaFn = (pessoa) => (pessoa === "Nadson da Conceição" ? "Manutenção" : null);

test("resolverAtribuicaoEfetiva usa a atribuição do PCM quando existe", () => {
  const chamado = { distribuicaoSistema: "Nadson da Conceição" };
  const atribuicaoPcm = {
    grupo: "Engenharia",
    pessoa: "Lucas",
    urgencia: "Alta",
    observacao: "aguardando peça",
    dataPrevistaSolucao: "2026-09-20",
  };

  const resultado = resolverAtribuicaoEfetiva(chamado, atribuicaoPcm, grupoDaPessoaFn);

  assert.equal(resultado.origem, "pcm");
  assert.equal(resultado.pessoa, "Lucas");
  assert.equal(resultado.grupo, "Engenharia");
  assert.equal(resultado.urgencia, "Alta");
  assert.equal(resultado.dataPrevistaSolucao, "2026-09-20");
});

test("resolverAtribuicaoEfetiva usa a distribuição do sistema quando não há atribuição do PCM", () => {
  const chamado = { distribuicaoSistema: "Nadson da Conceição" };

  const resultado = resolverAtribuicaoEfetiva(chamado, null, grupoDaPessoaFn);

  assert.equal(resultado.origem, "sistema");
  assert.equal(resultado.pessoa, "Nadson da Conceição");
  assert.equal(resultado.grupo, "Manutenção");
  assert.equal(resultado.urgencia, null);
});

test("resolverAtribuicaoEfetiva cai em 'Sem grupo definido' quando a pessoa do sistema ainda não foi mapeada", () => {
  const chamado = { distribuicaoSistema: "Pessoa Desconhecida" };

  const resultado = resolverAtribuicaoEfetiva(chamado, null, grupoDaPessoaFn);

  assert.equal(resultado.grupo, "Sem grupo definido");
});

test("resolverAtribuicaoEfetiva cai em 'Sem grupo definido' quando o chamado não tem operador", () => {
  const chamado = { distribuicaoSistema: null };

  const resultado = resolverAtribuicaoEfetiva(chamado, null, grupoDaPessoaFn);

  assert.equal(resultado.pessoa, null);
  assert.equal(resultado.grupo, "Sem grupo definido");
});

test("buildIndicadorPorGrupo agrupa por grupo, soma total, pessoas distintas e por urgência", () => {
  const linhas = [
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Alta" },
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Média" },
    { grupo: "Manutenção", pessoa: "Fernanda", urgencia: null },
    { grupo: "Engenharia", pessoa: "Lucas", urgencia: "Crítica" },
  ];

  const resultado = buildIndicadorPorGrupo(linhas);
  const manutencao = resultado.find((g) => g.grupo === "Manutenção");
  const engenharia = resultado.find((g) => g.grupo === "Engenharia");

  assert.equal(manutencao.total, 3);
  assert.equal(manutencao.totalPessoas, 2);
  assert.equal(manutencao.porUrgencia["Alta"], 1);
  assert.equal(manutencao.porUrgencia["Média"], 1);
  assert.equal(manutencao.porUrgencia["Não classificado"], 1);
  assert.equal(engenharia.total, 1);
});

test("buildIndicadorPorPessoa filtra por grupo e agrupa por pessoa", () => {
  const linhas = [
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Alta" },
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Baixa" },
    { grupo: "Manutenção", pessoa: "Fernanda", urgencia: "Alta" },
    { grupo: "Engenharia", pessoa: "Lucas", urgencia: "Crítica" },
  ];

  const resultado = buildIndicadorPorPessoa(linhas, "Manutenção");
  const guilherme = resultado.find((p) => p.pessoa === "Guilherme");

  assert.equal(resultado.length, 2);
  assert.equal(guilherme.total, 2);
  assert.equal(guilherme.porUrgencia["Alta"], 1);
  assert.equal(guilherme.porUrgencia["Baixa"], 1);
});
```

- [ ] **Step 6: Rodar os testes e confirmar que falham**

Run: `cd backend && node --test src/services/pcmAtribuicoes.test.js`
Expected: FAIL — `Cannot find module './pcmAtribuicoes.js'`

- [ ] **Step 7: Implementar `pcmAtribuicoes.js`**

```javascript
// backend/src/services/pcmAtribuicoes.js
import { getSupabaseClient } from "./supabaseClient.js";

let cacheAtribuicoes = null; // Map<codChamado, {grupo, pessoa, urgencia, observacao, dataPrevistaSolucao}>

export async function inicializar() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pcm_atribuicoes_chamados")
    .select("cod_chamado, grupo, pessoa, urgencia, observacao, data_prevista_solucao");
  if (error) throw error;

  cacheAtribuicoes = new Map(
    data.map((a) => [
      a.cod_chamado,
      {
        grupo: a.grupo,
        pessoa: a.pessoa,
        urgencia: a.urgencia,
        observacao: a.observacao ?? "",
        dataPrevistaSolucao: a.data_prevista_solucao,
      },
    ])
  );
  return cacheAtribuicoes;
}

export function listarAtribuicoes() {
  return cacheAtribuicoes ?? new Map();
}

export function atribuicaoDoChamado(codChamado) {
  return listarAtribuicoes().get(codChamado) ?? null;
}

// Pura — decide quem "está com" o chamado hoje: a atribuição manual do PCM (se existir) tem
// prioridade; senão, usa a distribuição automática do sistema (distribuicaoSistema, já
// anexada ao chamado enriquecido) e resolve o grupo dessa pessoa via grupoDaPessoaFn.
export function resolverAtribuicaoEfetiva(chamado, atribuicaoPcm, grupoDaPessoaFn) {
  if (atribuicaoPcm) {
    return {
      origem: "pcm",
      pessoa: atribuicaoPcm.pessoa,
      grupo: atribuicaoPcm.grupo,
      urgencia: atribuicaoPcm.urgencia,
      observacao: atribuicaoPcm.observacao ?? "",
      dataPrevistaSolucao: atribuicaoPcm.dataPrevistaSolucao ?? null,
    };
  }

  const pessoa = chamado.distribuicaoSistema ?? null;
  return {
    origem: "sistema",
    pessoa,
    grupo: pessoa ? grupoDaPessoaFn(pessoa) ?? "Sem grupo definido" : "Sem grupo definido",
    urgencia: null,
    observacao: "",
    dataPrevistaSolucao: null,
  };
}

export async function salvarAtribuicao(codChamado, { grupo, pessoa, urgencia, observacao, dataPrevistaSolucao }) {
  const supabase = getSupabaseClient();
  const payload = {
    cod_chamado: codChamado,
    grupo,
    pessoa,
    urgencia,
    observacao: observacao ?? "",
    data_prevista_solucao: dataPrevistaSolucao ?? null,
    atualizado_em: new Date().toISOString(),
  };

  const { error } = await supabase.from("pcm_atribuicoes_chamados").upsert(payload);
  if (error) throw error;

  const novoMapa = new Map(listarAtribuicoes());
  novoMapa.set(codChamado, {
    grupo,
    pessoa,
    urgencia,
    observacao: observacao ?? "",
    dataPrevistaSolucao: dataPrevistaSolucao ?? null,
  });
  cacheAtribuicoes = novoMapa;
  return cacheAtribuicoes.get(codChamado);
}

const URGENCIAS_ORDEM = ["Crítica", "Alta", "Média", "Baixa", "Não classificado"];

function porUrgenciaVazio() {
  return Object.fromEntries(URGENCIAS_ORDEM.map((u) => [u, 0]));
}

// Consome linhas já no formato de `linhaAtribuicao` (ver pcm.js) — {grupo, pessoa, urgencia}.
export function buildIndicadorPorGrupo(linhas) {
  const porGrupo = new Map();

  for (const linha of linhas) {
    const atual =
      porGrupo.get(linha.grupo) || { grupo: linha.grupo, pessoas: new Set(), total: 0, porUrgencia: porUrgenciaVazio() };
    atual.total += 1;
    if (linha.pessoa) atual.pessoas.add(linha.pessoa);
    atual.porUrgencia[linha.urgencia ?? "Não classificado"] += 1;
    porGrupo.set(linha.grupo, atual);
  }

  return [...porGrupo.values()]
    .map((g) => ({ grupo: g.grupo, totalPessoas: g.pessoas.size, total: g.total, porUrgencia: g.porUrgencia }))
    .sort((a, b) => b.total - a.total);
}

export function buildIndicadorPorPessoa(linhas, grupo) {
  const porPessoa = new Map();

  for (const linha of linhas) {
    if (linha.grupo !== grupo) continue;
    const chave = linha.pessoa ?? "Sem pessoa";
    const atual = porPessoa.get(chave) || { pessoa: chave, total: 0, porUrgencia: porUrgenciaVazio() };
    atual.total += 1;
    atual.porUrgencia[linha.urgencia ?? "Não classificado"] += 1;
    porPessoa.set(chave, atual);
  }

  return [...porPessoa.values()].sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

Run: `cd backend && node --test src/services/pcmAtribuicoes.test.js`
Expected: PASS — 6 testes ok

- [ ] **Step 9: Adicionar `inicializarPcmAtribuicoes` em `backend/src/index.js`**

Adicionar o import:

```javascript
import { inicializar as inicializarPcmAtribuicoes } from "./services/pcmAtribuicoes.js";
```

Adicionar ao `Promise.all`:

```javascript
  await Promise.all([
    inicializarPrioridades(),
    inicializarConfiguracaoEquipamentos(),
    inicializarConfiguracaoIndicadores(),
    inicializarPcmPessoas(),
    inicializarPcmAtribuicoes(),
  ]);
```

- [ ] **Step 10: Rodar toda a suíte de testes do backend**

Run: `cd backend && npm test`
Expected: PASS — todos os testes existentes + os 11 novos (5 de `prazo.test.js` + 6 de `pcmAtribuicoes.test.js`)

- [ ] **Step 11: Commit**

```bash
git add backend/src/services/prazo.js backend/src/services/prazo.test.js backend/src/services/pcmAtribuicoes.js backend/src/services/pcmAtribuicoes.test.js backend/src/index.js
git commit -m "feat: adiciona classificarPrazo e regra de atribuição efetiva (PCM vs sistema)"
```

---

## Task 5: Rota `/pcm/atribuicoes` (GET+PUT) + aba "Atribuições" (SEGUNDA ENTREGA VISÍVEL)

**Files:**
- Modify: `backend/src/routes/pcm.js`
- Modify: `frontend/src/api.js`
- Create: `frontend/src/components/PcmAtribuicoesTab.jsx`
- Modify: `frontend/src/pages/Pcm.jsx`

**Interfaces:**
- Consumes: `atribuicaoDoChamado`, `resolverAtribuicaoEfetiva`, `salvarAtribuicao` (Task 4); `classificarPrazo` (Task 4); `grupoDaPessoa`, `listarGrupos` (Task 3); `isFinalizado`, `excluirCancelados` (já existentes).
- Produces (usado pelas Tasks 6-7): rota `GET /api/pcm/atribuicoes?situacao=aberto|fechado&grupo=&pessoa=&urgencia=` → `{ chamados: [linhaAtribuicao...] }`, onde cada linha é `{codChamado, chave, assunto, status, finalizado, dataCriacao, solicitante, cliente, uf, descricaoAbertura, origem, pessoa, grupo, urgencia, observacao, dataPrevistaSolucao, statusPrazo}`; rota `PUT /api/pcm/atribuicoes/:codChamado` (body `{urgencia?, observacao?, dataPrevistaSolucao?}`) → devolve a mesma linha atualizada. `fetchPcmAtribuicoes(filtros)`, `salvarPcmAtribuicao(codChamado, dados)`.

Esta task entrega a tela central do painel: tabela de chamados com StatTiles de prazo e edição inline.

- [ ] **Step 1: Adicionar `linhaAtribuicao` e as rotas em `backend/src/routes/pcm.js`**

Adicionar os imports no topo do arquivo (junto aos já existentes):

```javascript
import { excluirCancelados } from "../services/filtros.js";
import { isFinalizado } from "../services/indicadores.js";
import { atribuicaoDoChamado, resolverAtribuicaoEfetiva, salvarAtribuicao } from "../services/pcmAtribuicoes.js";
import { classificarPrazo } from "../services/prazo.js";
import { grupoDaPessoa } from "../services/pcmPessoas.js";
```

Adicionar, antes das rotas já existentes:

```javascript
const URGENCIAS = ["Crítica", "Alta", "Média", "Baixa"];

function linhaAtribuicao(chamado) {
  const atribuicaoPcm = atribuicaoDoChamado(chamado.CodChamado);
  const efetiva = resolverAtribuicaoEfetiva(chamado, atribuicaoPcm, grupoDaPessoa);

  return {
    codChamado: chamado.CodChamado,
    chave: chamado.Chave,
    assunto: chamado.Assunto,
    status: chamado.NomeStatus,
    finalizado: isFinalizado(chamado),
    dataCriacao: chamado.DataCriacao,
    solicitante: chamado.solicitante,
    cliente: chamado.cliente,
    uf: chamado.uf,
    descricaoAbertura: chamado.descricaoAbertura,
    origem: efetiva.origem,
    pessoa: efetiva.pessoa,
    grupo: efetiva.grupo,
    urgencia: efetiva.urgencia,
    observacao: efetiva.observacao,
    dataPrevistaSolucao: efetiva.dataPrevistaSolucao,
    statusPrazo: classificarPrazo(efetiva.dataPrevistaSolucao),
  };
}

pcmRouter.get("/pcm/atribuicoes", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { situacao, grupo, pessoa, urgencia } = req.query;

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let filtrados = excluirCancelados(chamados);
    if (situacao === "aberto") filtrados = filtrados.filter((c) => !isFinalizado(c));
    if (situacao === "fechado") filtrados = filtrados.filter((c) => isFinalizado(c));

    let linhas = filtrados.map(linhaAtribuicao);
    if (grupo) linhas = linhas.filter((l) => l.grupo === grupo);
    if (pessoa) linhas = linhas.filter((l) => l.pessoa === pessoa);
    if (urgencia) linhas = linhas.filter((l) => (l.urgencia ?? "Não classificado") === urgencia);

    res.json({ chamados: linhas });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

pcmRouter.put("/pcm/atribuicoes/:codChamado", async (req, res) => {
  try {
    const { urgencia, observacao, dataPrevistaSolucao } = req.body;

    if (urgencia && !URGENCIAS.includes(urgencia)) {
      res.status(400).json({ erro: `Urgência "${urgencia}" inválida` });
      return;
    }

    const { chamados } = await carregarChamadosEnriquecidos({});
    const chamado = chamados.find((c) => c.CodChamado === req.params.codChamado);
    if (!chamado) {
      res.status(404).json({ erro: `Chamado ${req.params.codChamado} não encontrado` });
      return;
    }

    const efetivaAtual = resolverAtribuicaoEfetiva(chamado, atribuicaoDoChamado(chamado.CodChamado), grupoDaPessoa);

    if (efetivaAtual.grupo === "Sem grupo definido") {
      res.status(400).json({
        erro: `${efetivaAtual.pessoa ?? "Essa pessoa"} ainda não tem grupo definido — mapeie na aba "Pessoas/Grupos" antes de editar este chamado`,
      });
      return;
    }

    await salvarAtribuicao(chamado.CodChamado, {
      pessoa: efetivaAtual.pessoa,
      grupo: efetivaAtual.grupo,
      urgencia: urgencia !== undefined ? urgencia : efetivaAtual.urgencia,
      observacao: observacao !== undefined ? observacao : efetivaAtual.observacao,
      dataPrevistaSolucao: dataPrevistaSolucao !== undefined ? dataPrevistaSolucao : efetivaAtual.dataPrevistaSolucao,
    });

    res.json(linhaAtribuicao(chamado));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});
```

- [ ] **Step 2: Verificação manual da rota**

Com o backend rodando (`cd backend && npm run dev`):

```bash
curl -s "http://localhost:3001/api/pcm/atribuicoes?situacao=aberto" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('total',j.chamados.length,'amostra',j.chamados[0])})"
```

Expected: `total` > 0, e a amostra tem `origem: "sistema"` (nenhum chamado foi tocado pelo PCM ainda) e `statusPrazo: "sem-data"` (nenhuma data prevista definida ainda).

- [ ] **Step 3: Adicionar `fetchPcmAtribuicoes`/`salvarPcmAtribuicao` em `frontend/src/api.js`**

```javascript
export function fetchPcmAtribuicoes(opts) {
  return getJson("/api/pcm/atribuicoes", opts ?? {});
}

export async function salvarPcmAtribuicao(codChamado, dados) {
  const response = await fetch(`/api/pcm/atribuicoes/${encodeURIComponent(codChamado)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao salvar atribuição");
  return data;
}
```

- [ ] **Step 4: Criar `frontend/src/components/PcmAtribuicoesTab.jsx`**

```javascript
// frontend/src/components/PcmAtribuicoesTab.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchPcmAtribuicoes, salvarPcmAtribuicao } from "../api.js";
import { StatTile } from "./StatTile.jsx";

const URGENCIAS = ["Crítica", "Alta", "Média", "Baixa"];

const LABEL_PRAZO = {
  atrasado: "Atrasado",
  "vence-semana": "Vence esta semana",
  "no-prazo": "No prazo",
  "sem-data": "Sem data",
};

const CLASSE_PRAZO = {
  atrasado: "status-critical",
  "vence-semana": "status-warning",
  "no-prazo": "status-good",
};

export function PcmAtribuicoesTab({ situacao }) {
  const [state, setState] = useState({ status: "loading", chamados: [], error: null });
  const [filtroPrazo, setFiltroPrazo] = useState("");

  async function carregar() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const { chamados } = await fetchPcmAtribuicoes({ situacao });
      setState({ status: "ready", chamados, error: null });
    } catch (error) {
      setState({ status: "error", chamados: [], error: error.message });
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacao]);

  async function handleEditar(codChamado, campo, valor) {
    const chamado = state.chamados.find((c) => c.codChamado === codChamado);
    const dados = {
      urgencia: chamado.urgencia,
      observacao: chamado.observacao,
      dataPrevistaSolucao: chamado.dataPrevistaSolucao,
      [campo]: valor,
    };

    try {
      const atualizado = await salvarPcmAtribuicao(codChamado, dados);
      setState((s) => ({
        ...s,
        error: null,
        chamados: s.chamados.map((c) => (c.codChamado === codChamado ? atualizado : c)),
      }));
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    }
  }

  const contagemPrazo = useMemo(() => {
    const contagem = { atrasado: 0, "vence-semana": 0, "no-prazo": 0, "sem-data": 0 };
    for (const c of state.chamados) contagem[c.statusPrazo] += 1;
    return contagem;
  }, [state.chamados]);

  const chamadosFiltrados = filtroPrazo ? state.chamados.filter((c) => c.statusPrazo === filtroPrazo) : state.chamados;

  if (state.status === "loading") return <p className="subtitle">Carregando atribuições...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar atribuições: {state.error}</div>;

  return (
    <div>
      <section className="stat-grid">
        <StatTile
          label="Atrasados"
          value={contagemPrazo.atrasado}
          statusClass="status-critical"
          onClick={() => setFiltroPrazo((f) => (f === "atrasado" ? "" : "atrasado"))}
        />
        <StatTile
          label="Vence esta semana"
          value={contagemPrazo["vence-semana"]}
          statusClass="status-warning"
          onClick={() => setFiltroPrazo((f) => (f === "vence-semana" ? "" : "vence-semana"))}
        />
        <StatTile
          label="No prazo"
          value={contagemPrazo["no-prazo"]}
          statusClass="status-good"
          onClick={() => setFiltroPrazo((f) => (f === "no-prazo" ? "" : "no-prazo"))}
        />
        <StatTile
          label="Sem data prevista"
          value={contagemPrazo["sem-data"]}
          onClick={() => setFiltroPrazo((f) => (f === "sem-data" ? "" : "sem-data"))}
        />
      </section>

      {state.error && <div className="state-banner error">{state.error}</div>}

      <div className="panel full-width">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Assunto</th>
              <th>Distribuição</th>
              <th>Grupo</th>
              <th>Urgência</th>
              <th>Observação</th>
              <th>Data prevista</th>
              <th>Prazo</th>
            </tr>
          </thead>
          <tbody>
            {chamadosFiltrados.map((c) => (
              <tr key={c.codChamado}>
                <td>{c.codChamado}</td>
                <td>{c.assunto}</td>
                <td>
                  {c.origem === "pcm" ? "✋" : "🖥"} {c.pessoa ?? "—"}
                </td>
                <td>{c.grupo}</td>
                <td>
                  <select value={c.urgencia ?? ""} onChange={(e) => handleEditar(c.codChamado, "urgencia", e.target.value)}>
                    <option value="">Sem urgência</option>
                    {URGENCIAS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    className="search-input"
                    value={c.observacao ?? ""}
                    onChange={(e) => handleEditar(c.codChamado, "observacao", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={c.dataPrevistaSolucao ?? ""}
                    onChange={(e) => handleEditar(c.codChamado, "dataPrevistaSolucao", e.target.value)}
                  />
                </td>
                <td>
                  <span className={`value ${CLASSE_PRAZO[c.statusPrazo] ?? ""}`}>{LABEL_PRAZO[c.statusPrazo]}</span>
                </td>
              </tr>
            ))}
            {chamadosFiltrados.length === 0 && (
              <tr>
                <td colSpan={8} className="meta">
                  Nenhum chamado encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Adicionar a aba "Atribuições" e o filtro Aberto/Fechado/Todos em `frontend/src/pages/Pcm.jsx`**

Substituir o conteúdo inteiro do arquivo:

```javascript
// frontend/src/pages/Pcm.jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import { PcmPessoasTab } from "../components/PcmPessoasTab.jsx";
import { PcmAtribuicoesTab } from "../components/PcmAtribuicoesTab.jsx";

const TABS = [
  { value: "atribuicoes", label: "Atribuições" },
  { value: "pessoas", label: "Pessoas/Grupos" },
];

const FILTROS_SITUACAO = [
  { value: "aberto", label: "Aberto" },
  { value: "fechado", label: "Fechado" },
  { value: "todos", label: "Todos" },
];

export default function Pcm() {
  const [aba, setAba] = useState("atribuicoes");
  const [situacao, setSituacao] = useState("aberto");
  const situacaoQuery = situacao === "todos" ? "" : situacao;

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>PCM</h2>
          <p className="subtitle">
            Atribuição e acompanhamento de chamados de Manutenção/Engenharia por pessoa e grupo.
          </p>
        </div>
      </div>

      <SubTabs options={TABS} active={aba} onChange={setAba} />

      {aba === "atribuicoes" && <SubTabs options={FILTROS_SITUACAO} active={situacao} onChange={setSituacao} />}

      {aba === "atribuicoes" && <PcmAtribuicoesTab situacao={situacaoQuery} />}
      {aba === "pessoas" && <PcmPessoasTab />}
    </div>
  );
}
```

- [ ] **Step 6: Verificação manual no navegador**

Run: `cd frontend && npm run dev` (backend já rodando)

Na página `/pcm`, aba "Atribuições": confirmar que aparecem os 4 StatTiles de prazo (todos "Sem data" por enquanto, já que nenhum chamado tem data prevista ainda) e a tabela com os chamados. Trocar a urgência de um chamado no `<select>` e confirmar que:
- O valor persiste (recarregar a página com F5 e o `<select>` continua na urgência escolhida).
- O ícone da coluna "Distribuição" muda de 🖥 pra ✋ nesse chamado.
- Preencher uma data prevista no passado e confirmar que a coluna "Prazo" mostra "Atrasado" e o StatTile "Atrasados" incrementa.

Trocar o filtro pra "Todos" e confirmar que aparecem mais chamados (incluindo finalizados).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/pcm.js frontend/src/api.js frontend/src/components/PcmAtribuicoesTab.jsx frontend/src/pages/Pcm.jsx
git commit -m "feat: adiciona aba Atribuições com StatTiles de prazo e edição inline"
```

---

## Task 6: Indicador por grupo/pessoa + aba "Por grupo" (TERCEIRA ENTREGA VISÍVEL)

**Files:**
- Modify: `backend/src/routes/pcm.js`
- Modify: `frontend/src/api.js`
- Create: `frontend/src/components/PcmListaSimples.jsx`
- Create: `frontend/src/components/PcmPorGrupoTab.jsx`
- Modify: `frontend/src/pages/Pcm.jsx`

**Interfaces:**
- Consumes: `buildIndicadorPorGrupo`/`buildIndicadorPorPessoa` (Task 4); `linhaAtribuicao` (Task 5).
- Produces (usado pela Task 7): rotas `GET /api/pcm/indicador-grupo?situacao=` → `{porGrupo: [{grupo, totalPessoas, total, porUrgencia}]}`; `GET /api/pcm/indicador-pessoa?situacao=&grupo=` → `{grupo, porPessoa: [{pessoa, total, porUrgencia}]}`. `fetchPcmIndicadorGrupo(opts)`, `fetchPcmIndicadorPessoa(opts)`. `<PcmListaSimples filtros={{situacao, grupo, pessoa?, urgencia?}} />`.

Entrega o indicador em 2 níveis (grupo → pessoa × urgência) que resolve o problema de grupos com muita gente.

- [ ] **Step 1: Adicionar as rotas de indicador em `backend/src/routes/pcm.js`**

Adicionar o import:

```javascript
import { buildIndicadorPorGrupo, buildIndicadorPorPessoa } from "../services/pcmAtribuicoes.js";
```

Adicionar as rotas (depois da rota `PUT /pcm/atribuicoes/:codChamado`):

```javascript
pcmRouter.get("/pcm/indicador-grupo", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { situacao } = req.query;
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });

    let filtrados = excluirCancelados(chamados);
    if (situacao === "aberto") filtrados = filtrados.filter((c) => !isFinalizado(c));
    if (situacao === "fechado") filtrados = filtrados.filter((c) => isFinalizado(c));

    res.json({ porGrupo: buildIndicadorPorGrupo(filtrados.map(linhaAtribuicao)) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

pcmRouter.get("/pcm/indicador-pessoa", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { situacao, grupo } = req.query;

    if (!grupo) {
      res.status(400).json({ erro: "Parâmetro grupo é obrigatório" });
      return;
    }

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let filtrados = excluirCancelados(chamados);
    if (situacao === "aberto") filtrados = filtrados.filter((c) => !isFinalizado(c));
    if (situacao === "fechado") filtrados = filtrados.filter((c) => isFinalizado(c));

    res.json({ grupo, porPessoa: buildIndicadorPorPessoa(filtrados.map(linhaAtribuicao), grupo) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

- [ ] **Step 2: Verificação manual das rotas**

Com o backend rodando:

```bash
curl -s "http://localhost:3001/api/pcm/indicador-grupo?situacao=aberto"
```

Expected: `{"porGrupo":[...]}` — um item por grupo com pelo menos um chamado atribuído (pode vir vazio se nenhum chamado foi editado ainda nas tasks anteriores; se vier vazio, edite um chamado na aba Atribuições primeiro e rode de novo).

- [ ] **Step 3: Adicionar `fetchPcmIndicadorGrupo`/`fetchPcmIndicadorPessoa` em `frontend/src/api.js`**

```javascript
export function fetchPcmIndicadorGrupo(opts) {
  return getJson("/api/pcm/indicador-grupo", opts ?? {});
}

export function fetchPcmIndicadorPessoa(opts) {
  return getJson("/api/pcm/indicador-pessoa", opts ?? {});
}
```

- [ ] **Step 4: Criar `frontend/src/components/PcmListaSimples.jsx`**

```javascript
// frontend/src/components/PcmListaSimples.jsx
import { useEffect, useState } from "react";
import { fetchPcmAtribuicoes } from "../api.js";

// Lista somente-leitura de chamados filtrada por grupo/pessoa/urgência — aberta ao clicar
// numa célula da matriz Pessoa × Urgência (PcmPorGrupoTab). Edição continua só na aba
// "Atribuições"; aqui é só consulta + (na Task 7) exportação.
export function PcmListaSimples({ filtros }) {
  const [state, setState] = useState({ status: "loading", chamados: [], error: null });

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", chamados: [], error: null });

    fetchPcmAtribuicoes(filtros)
      .then(({ chamados }) => {
        if (!cancelado) setState({ status: "ready", chamados, error: null });
      })
      .catch((error) => {
        if (!cancelado) setState({ status: "error", chamados: [], error: error.message });
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  if (state.status === "loading") return <p className="subtitle">Carregando chamados...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro: {state.error}</div>;
  if (state.chamados.length === 0) return <p className="subtitle">Nenhum chamado encontrado.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Assunto</th>
          <th>Status</th>
          <th>Pessoa</th>
          <th>Urgência</th>
        </tr>
      </thead>
      <tbody>
        {state.chamados.map((c) => (
          <tr key={c.codChamado}>
            <td>{c.codChamado}</td>
            <td>{c.assunto}</td>
            <td>{c.status}</td>
            <td>{c.pessoa ?? "—"}</td>
            <td>{c.urgencia ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Criar `frontend/src/components/PcmPorGrupoTab.jsx`**

```javascript
// frontend/src/components/PcmPorGrupoTab.jsx
import { useEffect, useState } from "react";
import { fetchPcmIndicadorGrupo, fetchPcmIndicadorPessoa } from "../api.js";
import { StatTile } from "./StatTile.jsx";
import { Modal } from "./Modal.jsx";
import { PcmListaSimples } from "./PcmListaSimples.jsx";

const URGENCIAS_COLUNAS = ["Crítica", "Alta", "Média", "Baixa", "Não classificado"];

export function PcmPorGrupoTab({ situacao }) {
  const [state, setState] = useState({ status: "loading", porGrupo: [], error: null });
  const [grupoAberto, setGrupoAberto] = useState(null);
  const [pessoas, setPessoas] = useState({ status: "idle", porPessoa: [], error: null });
  const [lista, setLista] = useState(null);

  useEffect(() => {
    setState((s) => ({ ...s, status: "loading" }));
    fetchPcmIndicadorGrupo({ situacao })
      .then(({ porGrupo }) => setState({ status: "ready", porGrupo, error: null }))
      .catch((error) => setState({ status: "error", porGrupo: [], error: error.message }));
    setGrupoAberto(null);
  }, [situacao]);

  function abrirGrupo(grupo) {
    setGrupoAberto(grupo);
    setPessoas({ status: "loading", porPessoa: [], error: null });
    fetchPcmIndicadorPessoa({ situacao, grupo })
      .then(({ porPessoa }) => setPessoas({ status: "ready", porPessoa, error: null }))
      .catch((error) => setPessoas({ status: "error", porPessoa: [], error: error.message }));
  }

  if (state.status === "loading") return <p className="subtitle">Carregando indicador por grupo...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro: {state.error}</div>;

  return (
    <div>
      <section className="stat-grid">
        {state.porGrupo.map((g) => (
          <StatTile
            key={g.grupo}
            label={g.grupo}
            value={g.total}
            meta={`${g.totalPessoas} pessoa(s)`}
            onClick={() => abrirGrupo(g.grupo)}
          />
        ))}
        {state.porGrupo.length === 0 && <p className="subtitle">Nenhum chamado atribuído ainda.</p>}
      </section>

      {grupoAberto && (
        <div className="panel full-width">
          <h3>{grupoAberto}</h3>
          {pessoas.status === "loading" && <p className="subtitle">Carregando pessoas...</p>}
          {pessoas.status === "error" && <div className="state-banner error">Erro: {pessoas.error}</div>}
          {pessoas.status === "ready" && (
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  {URGENCIAS_COLUNAS.map((u) => (
                    <th key={u} className="num">
                      {u}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {pessoas.porPessoa.map((p) => (
                  <tr key={p.pessoa}>
                    <td
                      className="clickable-row"
                      onClick={() =>
                        setLista({ titulo: `${grupoAberto} — ${p.pessoa}`, filtros: { situacao, grupo: grupoAberto, pessoa: p.pessoa } })
                      }
                    >
                      {p.pessoa}
                    </td>
                    {URGENCIAS_COLUNAS.map((u) => (
                      <td
                        key={u}
                        className="num clickable-row"
                        onClick={() =>
                          setLista({
                            titulo: `${grupoAberto} — ${p.pessoa} — ${u}`,
                            filtros: { situacao, grupo: grupoAberto, pessoa: p.pessoa, urgencia: u },
                          })
                        }
                      >
                        {p.porUrgencia[u]}
                      </td>
                    ))}
                    <td className="num">{p.total}</td>
                  </tr>
                ))}
                {pessoas.porPessoa.length === 0 && (
                  <tr>
                    <td colSpan={URGENCIAS_COLUNAS.length + 2} className="meta">
                      Nenhuma pessoa nesse grupo ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {lista && (
        <Modal title={lista.titulo} onClose={() => setLista(null)}>
          <PcmListaSimples filtros={lista.filtros} />
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Adicionar a aba "Por grupo" em `frontend/src/pages/Pcm.jsx`**

Substituir o conteúdo inteiro do arquivo:

```javascript
// frontend/src/pages/Pcm.jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import { PcmPessoasTab } from "../components/PcmPessoasTab.jsx";
import { PcmAtribuicoesTab } from "../components/PcmAtribuicoesTab.jsx";
import { PcmPorGrupoTab } from "../components/PcmPorGrupoTab.jsx";

const TABS = [
  { value: "atribuicoes", label: "Atribuições" },
  { value: "porGrupo", label: "Por grupo" },
  { value: "pessoas", label: "Pessoas/Grupos" },
];

const FILTROS_SITUACAO = [
  { value: "aberto", label: "Aberto" },
  { value: "fechado", label: "Fechado" },
  { value: "todos", label: "Todos" },
];

export default function Pcm() {
  const [aba, setAba] = useState("atribuicoes");
  const [situacao, setSituacao] = useState("aberto");
  const situacaoQuery = situacao === "todos" ? "" : situacao;

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>PCM</h2>
          <p className="subtitle">
            Atribuição e acompanhamento de chamados de Manutenção/Engenharia por pessoa e grupo.
          </p>
        </div>
      </div>

      <SubTabs options={TABS} active={aba} onChange={setAba} />

      {(aba === "atribuicoes" || aba === "porGrupo") && (
        <SubTabs options={FILTROS_SITUACAO} active={situacao} onChange={setSituacao} />
      )}

      {aba === "atribuicoes" && <PcmAtribuicoesTab situacao={situacaoQuery} />}
      {aba === "porGrupo" && <PcmPorGrupoTab situacao={situacaoQuery} />}
      {aba === "pessoas" && <PcmPessoasTab />}
    </div>
  );
}
```

- [ ] **Step 7: Verificação manual no navegador**

Run: `cd frontend && npm run dev` (backend já rodando)

Na página `/pcm`, aba "Por grupo": confirmar que aparece um `StatTile` por grupo com pelo menos 1 chamado atribuído (edite um chamado na aba "Atribuições" primeiro se a lista vier vazia). Clicar num grupo abre a matriz Pessoa × Urgência. Clicar numa célula (ou no nome da pessoa) abre um modal com a lista de chamados daquele cruzamento. Trocar o filtro Aberto/Fechado/Todos no topo atualiza tanto essa aba quanto "Atribuições".

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/pcm.js frontend/src/api.js frontend/src/components/PcmListaSimples.jsx frontend/src/components/PcmPorGrupoTab.jsx frontend/src/pages/Pcm.jsx
git commit -m "feat: adiciona indicador em 2 níveis (grupo -> pessoa x urgência) no painel PCM"
```

---

## Task 7: Exportação Excel (grupo e pessoa)

**Files:**
- Create: `frontend/src/lib/pcmColunasExport.js`
- Modify: `frontend/src/components/PcmPorGrupoTab.jsx`
- Modify: `frontend/src/components/PcmListaSimples.jsx`

**Interfaces:**
- Consumes: `exportarLinhas` (já existe em `frontend/src/lib/exportExcel.js`); `fetchPcmAtribuicoes` (Task 5) — a mesma rota já devolve todos os campos necessários (`descricaoAbertura`, `solicitante`, `cliente`, `uf` já estão em `linhaAtribuicao` desde a Task 5), então **não é preciso nenhuma rota nova**.
- Produces: `COLUNAS_EXPORT_PCM` (array de `{chave, titulo}`), reaproveitado pelos dois botões de exportar.

Fecha o escopo da spec: exportar Excel completo, tanto do grupo inteiro quanto de uma pessoa.

- [ ] **Step 1: Criar `frontend/src/lib/pcmColunasExport.js`**

```javascript
// frontend/src/lib/pcmColunasExport.js

// Mesmas colunas pros dois botões de exportar (grupo inteiro e pessoa) — o payload de
// /api/pcm/atribuicoes já traz todos esses campos, sem custo extra de API por chamado.
export const COLUNAS_EXPORT_PCM = [
  { chave: "codChamado", titulo: "Código" },
  { chave: "assunto", titulo: "Assunto" },
  { chave: "descricaoAbertura", titulo: "Descrição de abertura" },
  { chave: "solicitante", titulo: "Solicitante" },
  { chave: "cliente", titulo: "Loja/Cliente" },
  { chave: "uf", titulo: "UF" },
  { chave: "dataCriacao", titulo: "Data de criação" },
  { chave: "status", titulo: "Status do chamado" },
  { chave: "origemLabel", titulo: "Origem da atribuição" },
  { chave: "pessoa", titulo: "Distribuição" },
  { chave: "grupo", titulo: "Grupo" },
  { chave: "urgencia", titulo: "Urgência" },
  { chave: "observacao", titulo: "Observação do PCM" },
  { chave: "dataPrevistaSolucao", titulo: "Data prevista de solução" },
  { chave: "statusPrazo", titulo: "Status de prazo" },
];

// exportarLinhas usa `linha[coluna.chave]` direto — como "origem" no payload é "pcm"/"sistema"
// (valor técnico), preparamos "origemLabel" com o texto legível antes de exportar.
export function prepararLinhasExportPcm(chamados) {
  return chamados.map((c) => ({
    ...c,
    origemLabel: c.origem === "pcm" ? "Atribuído pelo PCM" : "Distribuído pelo sistema",
  }));
}
```

- [ ] **Step 2: Adicionar o botão "Exportar Excel" (grupo inteiro) em `frontend/src/components/PcmPorGrupoTab.jsx`**

Adicionar os imports no topo:

```javascript
import { fetchPcmAtribuicoes } from "../api.js";
import { exportarLinhas } from "../lib/exportExcel.js";
import { COLUNAS_EXPORT_PCM, prepararLinhasExportPcm } from "../lib/pcmColunasExport.js";
```

Adicionar a função (dentro do componente, antes do `return`):

```javascript
  async function exportarGrupo() {
    const { chamados } = await fetchPcmAtribuicoes({ situacao, grupo: grupoAberto });
    exportarLinhas(prepararLinhasExportPcm(chamados), COLUNAS_EXPORT_PCM, `pcm-${grupoAberto}`);
  }
```

Adicionar o botão ao lado do `<h3>{grupoAberto}</h3>`:

```javascript
          <div className="page-toolbar">
            <h3 style={{ margin: 0 }}>{grupoAberto}</h3>
            <button className="refresh-btn" onClick={exportarGrupo}>
              Exportar Excel
            </button>
          </div>
```

(Isso substitui a linha `<h3>{grupoAberto}</h3>` que já existia — o `<div className="page-toolbar">` novo envolve o `<h3>` e o botão.)

- [ ] **Step 3: Adicionar o botão "Exportar Excel" (pessoa) em `frontend/src/components/PcmListaSimples.jsx`**

Adicionar os imports no topo:

```javascript
import { exportarLinhas } from "../lib/exportExcel.js";
import { COLUNAS_EXPORT_PCM, prepararLinhasExportPcm } from "../lib/pcmColunasExport.js";
```

Adicionar o botão logo antes da `<table>` (só quando há chamados carregados):

```javascript
  return (
    <div>
      <button
        className="refresh-btn"
        style={{ marginBottom: 8 }}
        onClick={() => exportarLinhas(prepararLinhasExportPcm(state.chamados), COLUNAS_EXPORT_PCM, "pcm-chamados")}
      >
        Exportar Excel
      </button>
      <table>
```

(Isso exige envolver a `<table>` já existente num `<div>` — ajustar o `return` pra fechar esse `<div>` no final, depois de `</table>`.)

- [ ] **Step 4: Verificação manual no navegador**

Run: `cd frontend && npm run dev` (backend já rodando)

Na aba "Por grupo": abrir um grupo e clicar em "Exportar Excel" no cabeçalho — confirmar que baixa `pcm-<grupo>.xlsx` com todas as colunas (inclusive "Descrição de abertura" com o texto real do chamado). Clicar numa pessoa/célula pra abrir o modal e clicar em "Exportar Excel" ali dentro — confirmar que baixa `pcm-chamados.xlsx` só com os chamados daquele cruzamento.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pcmColunasExport.js frontend/src/components/PcmPorGrupoTab.jsx frontend/src/components/PcmListaSimples.jsx
git commit -m "feat: adiciona exportação Excel completa por grupo e por pessoa no painel PCM"
```

---

## Self-Review

**Cobertura da spec** (`docs/superpowers/specs/2026-09-16-pcm-atribuicao-visibilidade-design.md`):
- ✅ Urgência de manutenção independente (Crítica/Alta/Média/Baixa) → Task 4 (`check` constraint na migration, `URGENCIAS` na rota).
- ✅ Pessoas vêm do Desk, não cadastradas do zero; PCM só define grupo → Task 3 (`pessoasConhecidas`, `PcmPessoasTab`).
- ✅ Escopo Manutenção/Engenharia → `carregarChamadosEnriquecidos()` já restringe isso (Task 2 em diante).
- ✅ Distribuição = NomeOperador+SobrenomeOperador, NomeGrupo ignorado → Task 2.
- ✅ Descrição de abertura sem custo extra de API → Task 2 + Task 7 (reaproveita o mesmo payload).
- ✅ Grupo não editável por chamado (só leitura, derivado da pessoa) + bloqueio quando "Sem grupo definido" → Task 5 (`PUT /pcm/atribuicoes/:codChamado`, tabela sem `<select>` de grupo).
- ✅ "Vence esta semana" = semana de calendário → Task 4 (`prazo.js` + testes com datas concretas).
- ✅ Página dedicada "PCM", edição inline, sem botão "Salvar" → Tasks 3, 5.
- ✅ Indicador em 2 níveis (grupo → pessoa × urgência) → Task 6.
- ✅ Filtro Aberto/Fechado/Todos compartilhado, padrão Aberto → Task 5 (`Pcm.jsx`, aplicado também na Task 6).
- ✅ "+ Novo grupo" (mesmo padrão de equipamentos) → Task 3.
- ✅ Pessoas sem grupo destacadas na config → Task 3 (`state-banner warning`).
- ✅ Sem login → nenhuma task introduz autenticação.
- ✅ Exportação Excel completa (grupo e pessoa, com texto de abertura) → Task 7.
- ✅ Testes de backend (`prazo`, `pcmAtribuicoes`, `pcmPessoas`, `enriquecimento`) → Tasks 2, 3, 4.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo step tem código completo, e as duas pendências técnicas da spec já foram resolvidas antes deste plano (inspecionando a API real do Desk em 2026-09-16), então não há nenhuma descoberta em aberto pra fazer durante a implementação.

**Consistência de tipos:** `linhaAtribuicao(chamado)` (Task 5) tem sempre a mesma forma — `{codChamado, chave, assunto, status, finalizado, dataCriacao, solicitante, cliente, uf, descricaoAbertura, origem, pessoa, grupo, urgencia, observacao, dataPrevistaSolucao, statusPrazo}` — consumida sem alteração pelas Tasks 6 e 7. `resolverAtribuicaoEfetiva` (Task 4) sempre devolve `{origem, pessoa, grupo, urgencia, observacao, dataPrevistaSolucao}`, usado igual em Task 5. `classificarPrazo` sempre devolve uma das 4 strings (`"atrasado"|"vence-semana"|"no-prazo"|"sem-data"`), usada com as mesmas chaves em `LABEL_PRAZO`/`CLASSE_PRAZO` (Task 5) e como filtro nos `StatTile` (Task 5).

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-16-pcm-atribuicao-visibilidade.md`.** Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatco um subagente novo por task, reviso entre elas, iteração rápida.

**2. Execução inline** — executo as tarefas nesta sessão, em lote, com checkpoints pra revisão.

Qual você prefere?
