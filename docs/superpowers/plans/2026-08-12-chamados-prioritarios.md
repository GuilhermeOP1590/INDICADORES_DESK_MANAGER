# Chamados Prioritários Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba "Prioritários" onde o usuário marca manualmente chamados (pelo código do Desk) como prioridade própria, com nota livre, e vê um resumo + tabela de controle desses chamados (aberto/fechado, tempo parado).

**Architecture:** Backend: novo serviço `prioridades.js` (JSON em `backend/data/`, mesmo padrão de `configuracaoEquipamentos.js`) + 3 rotas REST (`GET/POST/DELETE /api/prioritarios`) que juntam a lista salva com o dataset já enriquecido (`carregarChamadosEnriquecidos`). Frontend: uma página nova reaproveitando componentes existentes (`StatTile`, `SubTabs`, `Modal`, `DrillDownContent`, `useDrillDown`) — sem gráficos, é uma tabela de controle.

**Tech Stack:** Node.js/Express (backend), React/Vite (frontend), `node:test` + `node:assert/strict` para testes de backend (não há framework de teste no frontend — nenhuma página existente tem testes, então esta também não terá; validação do frontend é build + verificação manual).

## Global Constraints

- Todo texto de UI e nomes de função/variável em português, seguindo o resto do código (ex: `carregar`, `adicionar`, `nota`, `codChamado`).
- Nenhuma dependência nova — usar só o que já está em `package.json` de cada lado.
- Arquivos de configuração persistem em `backend/data/*.json`, lidos/escritos com `fs` síncrono, seguindo exatamente o padrão de `configuracaoEquipamentos.js` (ver Task 1).
- Cores e espaçamento do frontend usam as variáveis CSS já definidas em `styles.css` (`var(--status-critical)`, `var(--border)`, etc.) — não introduzir cores literais novas.
- Basear a spec em `docs/superpowers/specs/2026-08-12-chamados-prioritarios-design.md` — qualquer divergência deste plano em relação à spec deve ser resolvida a favor da spec.

---

### Task 1: Serviço de persistência `prioridades.js`

**Files:**
- Create: `backend/src/services/prioridades.js`
- Create: `backend/src/services/prioridades.test.js`

**Interfaces:**
- Consumes: nada (serviço novo, sem dependência de outros arquivos do projeto).
- Produces (usado pela Task 2):
  - `lerPrioridades(): { chamados: Array<{codChamado: string, nota: string, adicionadoEm: string}> }`
  - `salvarPrioridades(config): config` (mesmo shape)
  - `adicionarOuAtualizarPrioridade(codChamado: string, nota: string): config` (lê, aplica upsert, salva, retorna o config salvo)
  - `removerPrioridade(codChamado: string): config` (lê, remove, salva, retorna o config salvo)
  - `aplicarUpsert(config, codChamado, nota): config` — pura, exportada só para teste
  - `aplicarRemocao(config, codChamado): config` — pura, exportada só para teste

- [ ] **Step 1: Escrever os testes (vão falhar — módulo ainda não existe)**

Criar `backend/src/services/prioridades.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarUpsert, aplicarRemocao } from "./prioridades.js";

test("aplicarUpsert adiciona um código novo com nota e data", () => {
  const antes = { chamados: [] };
  const depois = aplicarUpsert(antes, "0726-001231", "cliente cobrando");
  assert.equal(depois.chamados.length, 1);
  assert.equal(depois.chamados[0].codChamado, "0726-001231");
  assert.equal(depois.chamados[0].nota, "cliente cobrando");
  assert.ok(depois.chamados[0].adicionadoEm);
});

test("aplicarUpsert remove espaços nas bordas do código", () => {
  const depois = aplicarUpsert({ chamados: [] }, "  0726-001231  ", "");
  assert.equal(depois.chamados[0].codChamado, "0726-001231");
});

test("aplicarUpsert atualiza a nota de um código já existente, sem duplicar", () => {
  const antes = {
    chamados: [{ codChamado: "0726-001231", nota: "nota antiga", adicionadoEm: "2026-08-01T00:00:00.000Z" }],
  };
  const depois = aplicarUpsert(antes, "0726-001231", "nota nova");
  assert.equal(depois.chamados.length, 1);
  assert.equal(depois.chamados[0].nota, "nota nova");
  assert.equal(depois.chamados[0].adicionadoEm, "2026-08-01T00:00:00.000Z");
});

test("aplicarRemocao tira o código da lista", () => {
  const antes = { chamados: [{ codChamado: "0726-001231", nota: "", adicionadoEm: "2026-08-01T00:00:00.000Z" }] };
  const depois = aplicarRemocao(antes, "0726-001231");
  assert.equal(depois.chamados.length, 0);
});

test("aplicarRemocao não faz nada se o código não está na lista", () => {
  const antes = { chamados: [{ codChamado: "0726-001231", nota: "", adicionadoEm: "2026-08-01T00:00:00.000Z" }] };
  const depois = aplicarRemocao(antes, "9999-999999");
  assert.equal(depois.chamados.length, 1);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './prioridades.js'` (ou erro de import equivalente).

- [ ] **Step 3: Implementar `prioridades.js`**

Criar `backend/src/services/prioridades.js`:

```js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const PASTA_DADOS = path.join(process.cwd(), "data");
const ARQUIVO = path.join(PASTA_DADOS, "chamados-prioritarios.json");

const PADRAO = { chamados: [] };

export function lerPrioridades() {
  if (!existsSync(ARQUIVO)) return PADRAO;
  try {
    const salvo = JSON.parse(readFileSync(ARQUIVO, "utf-8"));
    return { chamados: salvo.chamados ?? [] };
  } catch {
    return PADRAO;
  }
}

export function salvarPrioridades(config) {
  if (!existsSync(PASTA_DADOS)) mkdirSync(PASTA_DADOS, { recursive: true });
  writeFileSync(ARQUIVO, JSON.stringify(config, null, 2));
  return config;
}

// Upsert por codChamado (trim) — se já existe, só atualiza a nota (mantém adicionadoEm
// original); se não existe, adiciona no fim. Pura (não toca em disco) pra poder testar sem
// depender do arquivo real.
export function aplicarUpsert(config, codChamado, nota) {
  const codigo = codChamado.trim();
  const existente = config.chamados.find((c) => c.codChamado === codigo);

  if (existente) {
    return {
      chamados: config.chamados.map((c) => (c.codChamado === codigo ? { ...c, nota: nota ?? "" } : c)),
    };
  }

  return {
    chamados: [...config.chamados, { codChamado: codigo, nota: nota ?? "", adicionadoEm: new Date().toISOString() }],
  };
}

export function aplicarRemocao(config, codChamado) {
  return { chamados: config.chamados.filter((c) => c.codChamado !== codChamado.trim()) };
}

export function adicionarOuAtualizarPrioridade(codChamado, nota) {
  return salvarPrioridades(aplicarUpsert(lerPrioridades(), codChamado, nota));
}

export function removerPrioridade(codChamado) {
  return salvarPrioridades(aplicarRemocao(lerPrioridades(), codChamado));
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npm test`
Expected: PASS — todos os testes de `prioridades.test.js` (e os já existentes) verdes, nenhum arquivo `chamados-prioritarios.json` deve ter sido criado em `backend/data/` (os testes usam só as funções puras `aplicarUpsert`/`aplicarRemocao`, sem tocar em disco).

- [ ] **Step 5: Commit**

```bash
cd "backend"
git add src/services/prioridades.js src/services/prioridades.test.js
git commit -m "feat: servico de persistencia de chamados prioritarios"
```

---

### Task 2: Rotas `GET/POST/DELETE /api/prioritarios`

**Files:**
- Modify: `backend/src/routes/indicadores.js:1-19` (imports)
- Modify: `backend/src/routes/indicadores.js` (fim do arquivo, depois da rota `PUT /configuracao/equipamentos` que hoje termina na linha 564)

**Interfaces:**
- Consumes: `lerPrioridades`, `adicionarOuAtualizarPrioridade`, `removerPrioridade` (Task 1); `carregarChamadosEnriquecidos` (já importado no arquivo, de `../services/enriquecimento.js`); `isFinalizado`, `parseDateTime` (já importados, de `../services/indicadores.js`).
- Produces (usado pela Task 3): três rotas HTTP devolvendo sempre o mesmo formato
  `{ resumo: { total, abertos, fechados, tempoMedioAbertoDias }, chamados: [{ codChamado, chave, assunto, status, cliente, uf, especialidade, finalizado, diasEmAberto, tempoResolucaoHoras, nota, adicionadoEm, encontrado }] }`.

- [ ] **Step 1: Adicionar o import do novo serviço**

Em `backend/src/routes/indicadores.js`, logo abaixo do import de `configuracaoEquipamentos.js` (linha 16), adicionar:

```js
import { lerPrioridades, adicionarOuAtualizarPrioridade, removerPrioridade } from "../services/prioridades.js";
```

- [ ] **Step 2: Implementar `buildPrioritarios` e as 3 rotas, no fim do arquivo**

Depois do fechamento da rota `PUT /configuracao/equipamentos` (última linha do arquivo hoje, `});` na linha 564), adicionar:

```js

// Junta a lista salva (código + nota) com o dataset já enriquecido (Manutenção + Engenharia)
// — mesmo pipeline usado por /manutencao, /engenharia, /orcamento etc. Se um código salvo não
// bater com nenhum chamado do dataset atual (ex: saiu do escopo depois de marcado), a linha
// ainda aparece, só com status "Não encontrado", em vez de sumir ou quebrar a rota.
async function buildPrioritarios({ forceRefresh = false } = {}) {
  const { chamados: salvos } = lerPrioridades();
  const { chamados: enriquecidos } = await carregarChamadosEnriquecidos({ forceRefresh });
  const porCodigo = new Map(enriquecidos.map((c) => [c.CodChamado, c]));

  const linhas = salvos.map((prioridade) => {
    const chamado = porCodigo.get(prioridade.codChamado);

    if (!chamado) {
      return {
        codChamado: prioridade.codChamado,
        chave: null,
        assunto: null,
        status: "Não encontrado",
        cliente: null,
        uf: null,
        especialidade: null,
        finalizado: false,
        diasEmAberto: null,
        tempoResolucaoHoras: null,
        nota: prioridade.nota,
        adicionadoEm: prioridade.adicionadoEm,
        encontrado: false,
      };
    }

    const finalizado = isFinalizado(chamado);
    const inicio = parseDateTime(chamado.DataCriacao, chamado.HoraCriacao);
    let diasEmAberto = null;
    let tempoResolucaoHoras = null;

    if (finalizado) {
      const fim = parseDateTime(chamado.DataFinalizacao, chamado.HoraFinalizacao);
      tempoResolucaoHoras = inicio && fim ? Math.max(0, (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60)) : null;
    } else {
      diasEmAberto = inicio ? Math.round((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24)) : null;
    }

    return {
      codChamado: chamado.CodChamado,
      chave: chamado.Chave,
      assunto: chamado.Assunto,
      status: chamado.NomeStatus,
      cliente: chamado.cliente,
      uf: chamado.uf,
      especialidade: chamado.especialidade,
      finalizado,
      diasEmAberto,
      tempoResolucaoHoras,
      nota: prioridade.nota,
      adicionadoEm: prioridade.adicionadoEm,
      encontrado: true,
    };
  });

  // Grupo 0 = aberto (mais antigo primeiro — parado há mais tempo pede mais atenção),
  // grupo 1 = fechado, grupo 2 = não encontrado (sem dado confiável pra ordenar por tempo).
  const grupo = (c) => (!c.encontrado ? 2 : c.finalizado ? 1 : 0);
  linhas.sort((a, b) => {
    if (grupo(a) !== grupo(b)) return grupo(a) - grupo(b);
    if (grupo(a) === 0) return (b.diasEmAberto ?? 0) - (a.diasEmAberto ?? 0);
    return new Date(b.adicionadoEm).getTime() - new Date(a.adicionadoEm).getTime();
  });

  const abertos = linhas.filter((c) => c.encontrado && !c.finalizado);
  const fechados = linhas.filter((c) => c.encontrado && c.finalizado);
  const tempoMedioAbertoDias = abertos.length
    ? Math.round((abertos.reduce((soma, c) => soma + (c.diasEmAberto ?? 0), 0) / abertos.length) * 10) / 10
    : null;

  return {
    resumo: { total: linhas.length, abertos: abertos.length, fechados: fechados.length, tempoMedioAbertoDias },
    chamados: linhas,
  };
}

indicadoresRouter.get("/prioritarios", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    res.json(await buildPrioritarios({ forceRefresh }));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.post("/prioritarios", async (req, res) => {
  try {
    const { codChamado, nota } = req.body;
    if (!codChamado || !codChamado.trim()) {
      res.status(400).json({ erro: "Código do chamado é obrigatório" });
      return;
    }

    const { chamados: enriquecidos } = await carregarChamadosEnriquecidos({});
    const existe = enriquecidos.some((c) => c.CodChamado === codChamado.trim());
    if (!existe) {
      res.status(400).json({ erro: `Chamado ${codChamado.trim()} não encontrado` });
      return;
    }

    adicionarOuAtualizarPrioridade(codChamado, nota ?? "");
    res.json(await buildPrioritarios({}));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});

indicadoresRouter.delete("/prioritarios/:codChamado", async (req, res) => {
  try {
    removerPrioridade(req.params.codChamado);
    res.json(await buildPrioritarios({}));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});
```

- [ ] **Step 3: Rodar os testes de backend (garantir que nada quebrou)**

Run: `cd backend && npm test`
Expected: PASS — todos os testes, incluindo os de `prioridades.test.js` da Task 1.

- [ ] **Step 4: Verificação manual com o servidor rodando**

Suba o backend (se não estiver rodando): `cd backend && npm start` (porta 3001).

Pegue um código de chamado real pra testar (qualquer um do dataset atual):

```bash
curl -s "http://localhost:3001/api/manutencao" | node -e "
let d=''; process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{ const j=JSON.parse(d); console.log(j.geral.operadores[0]); });
"
```

Isso não devolve `codChamado` diretamente (a listagem por operador não inclui), então use a lista de chamados:

```bash
curl -s "http://localhost:3001/api/chamados?especialidade=Manutenção" | node -e "
let d=''; process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{ const j=JSON.parse(d); console.log(j.chamados[0].codChamado); });
"
```

Anote o código impresso (ex: `0726-001231`) e rode a sequência completa:

```bash
# 1. Lista vazia
curl -s "http://localhost:3001/api/prioritarios"
# Esperado: {"resumo":{"total":0,"abertos":0,"fechados":0,"tempoMedioAbertoDias":null},"chamados":[]}

# 2. Adicionar com código inválido -> 400
curl -s -w "\nHTTP %{http_code}\n" -X POST "http://localhost:3001/api/prioritarios" \
  -H "Content-Type: application/json" -d '{"codChamado":"0000-000000","nota":"teste"}'
# Esperado: HTTP 400, {"erro":"Chamado 0000-000000 não encontrado"}

# 3. Adicionar com o código real anotado -> 200, entra na lista
curl -s -X POST "http://localhost:3001/api/prioritarios" \
  -H "Content-Type: application/json" -d '{"codChamado":"<CODIGO_REAL>","nota":"teste de verificacao"}'
# Esperado: HTTP 200, resumo.total = 1, chamados[0].codChamado = "<CODIGO_REAL>", nota = "teste de verificacao"

# 4. Adicionar de novo com nota diferente -> upsert, continua com total 1
curl -s -X POST "http://localhost:3001/api/prioritarios" \
  -H "Content-Type: application/json" -d '{"codChamado":"<CODIGO_REAL>","nota":"nota atualizada"}'
# Esperado: resumo.total ainda 1, chamados[0].nota = "nota atualizada"

# 5. Remover
curl -s -X DELETE "http://localhost:3001/api/prioritarios/<CODIGO_REAL>"
# Esperado: resumo.total = 0, chamados = []
```

- [ ] **Step 5: Commit**

```bash
cd "backend"
git add src/routes/indicadores.js
git commit -m "feat: rotas GET/POST/DELETE /api/prioritarios"
```

---

### Task 3: Funções de API no frontend (`api.js`)

**Files:**
- Modify: `frontend/src/api.js` (fim do arquivo)

**Interfaces:**
- Consumes: rotas da Task 2 (`GET/POST/DELETE /api/prioritarios`), helper `getJson` já existente no topo do arquivo.
- Produces (usado pela Task 4):
  - `fetchPrioritarios(): Promise<{resumo, chamados}>`
  - `adicionarPrioridade(codChamado: string, nota: string): Promise<{resumo, chamados}>`
  - `removerPrioridade(codChamado: string): Promise<{resumo, chamados}>`

- [ ] **Step 1: Adicionar as três funções no fim de `frontend/src/api.js`**

```js

export function fetchPrioritarios() {
  return getJson("/api/prioritarios", {});
}

export async function adicionarPrioridade(codChamado, nota) {
  const response = await fetch("/api/prioritarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codChamado, nota }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao adicionar chamado prioritário");
  return data;
}

export async function removerPrioridade(codChamado) {
  const response = await fetch(`/api/prioritarios/${encodeURIComponent(codChamado)}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao remover chamado prioritário");
  return data;
}
```

- [ ] **Step 2: Validar que o frontend ainda builda (não há teste automatizado de frontend neste projeto)**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros (as funções novas não são usadas ainda nesta task, então só confirma que a sintaxe está correta).

- [ ] **Step 3: Commit**

```bash
cd "frontend"
git add src/api.js
git commit -m "feat: funcoes de API para chamados prioritarios"
```

---

### Task 4: Página `ChamadosPrioritarios.jsx`

**Files:**
- Create: `frontend/src/pages/ChamadosPrioritarios.jsx`

**Interfaces:**
- Consumes: `fetchPrioritarios`, `adicionarPrioridade`, `removerPrioridade` (Task 3); componentes existentes `StatTile`, `SubTabs`, `Modal`, `DrillDownContent`; hook existente `useDrillDown` (método usado: `abrirChamado({chave, codChamado})`); helper `formatHoras` de `lib/datas.js`.
- Produces (usado pela Task 5): `export default function ChamadosPrioritarios()` — componente de página, sem props (não depende de período/UF/busca global).

- [ ] **Step 1: Criar `frontend/src/pages/ChamadosPrioritarios.jsx`**

```jsx
import { useEffect, useState } from "react";
import { fetchPrioritarios, adicionarPrioridade, removerPrioridade } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { formatHoras } from "../lib/datas.js";

const FILTROS = [
  { value: "abertos", label: "Abertos" },
  { value: "fechados", label: "Fechados" },
  { value: "todos", label: "Todos" },
];

export default function ChamadosPrioritarios() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [filtro, setFiltro] = useState("abertos");
  const [codigoInput, setCodigoInput] = useState("");
  const [notaInput, setNotaInput] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [erroAcao, setErroAcao] = useState(null);
  const drill = useDrillDown();

  async function carregar() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchPrioritarios();
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleAdicionar(e) {
    e.preventDefault();
    if (!codigoInput.trim()) return;

    setAdicionando(true);
    setErroAcao(null);
    try {
      const payload = await adicionarPrioridade(codigoInput.trim(), notaInput.trim());
      setState({ status: "ready", payload, error: null });
      setCodigoInput("");
      setNotaInput("");
    } catch (error) {
      setErroAcao(error.message);
    } finally {
      setAdicionando(false);
    }
  }

  async function handleRemover(codChamado) {
    try {
      const payload = await removerPrioridade(codChamado);
      setState({ status: "ready", payload, error: null });
      setErroAcao(null);
    } catch (error) {
      setErroAcao(error.message);
    }
  }

  const payload = state.payload;
  const chamados = payload?.chamados ?? [];
  const filtrados = chamados.filter((c) => {
    if (filtro === "abertos") return !c.finalizado;
    if (filtro === "fechados") return c.finalizado;
    return true;
  });

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Chamados prioritários</h2>
          <p className="subtitle">
            Marcados manualmente pra acompanhamento mais próximo — independente da prioridade do Desk.
          </p>
        </div>
        <button className="refresh-btn" onClick={carregar} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      <form className="filter-bar" onSubmit={handleAdicionar}>
        <input
          type="text"
          className="search-input"
          placeholder="Código do chamado (ex: 0726-001231)"
          value={codigoInput}
          onChange={(e) => setCodigoInput(e.target.value)}
        />
        <input
          type="text"
          className="search-input"
          placeholder="Nota (opcional)"
          value={notaInput}
          onChange={(e) => setNotaInput(e.target.value)}
        />
        <button className="refresh-btn" type="submit" disabled={adicionando || !codigoInput.trim()}>
          {adicionando ? "Adicionando..." : "Adicionar"}
        </button>
      </form>

      {erroAcao && <div className="state-banner error">{erroAcao}</div>}
      {state.status === "error" && (
        <div className="state-banner error">Erro ao carregar chamados prioritários: {state.error}</div>
      )}
      {state.status === "loading" && !payload && <p className="subtitle">Carregando chamados prioritários...</p>}

      {payload && (
        <>
          <section className="stat-grid">
            <StatTile label="Total priorizados" value={payload.resumo.total} />
            <StatTile
              label="Em aberto"
              value={payload.resumo.abertos}
              statusClass={payload.resumo.abertos > 0 ? "status-warning" : undefined}
            />
            <StatTile label="Fechados" value={payload.resumo.fechados} />
            <StatTile
              label="Tempo médio parado"
              value={payload.resumo.tempoMedioAbertoDias !== null ? `${payload.resumo.tempoMedioAbertoDias} dias` : "—"}
            />
          </section>

          <SubTabs options={FILTROS} active={filtro} onChange={setFiltro} />

          {drill.pilha !== null && (
            <Modal
              title={drill.topo?.titulo ?? ""}
              onClose={drill.fechar}
              onBack={drill.pilha.length > 1 ? drill.voltar : undefined}
            >
              <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
            </Modal>
          )}

          <div className="panel full-width">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Assunto</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Área</th>
                  <th>Tempo</th>
                  <th>Nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.codChamado}
                    className={c.encontrado ? "clickable-row" : ""}
                    onClick={c.encontrado ? () => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado }) : undefined}
                  >
                    <td>{c.codChamado}</td>
                    <td>{c.assunto ?? "—"}</td>
                    <td>{c.cliente ?? "—"}</td>
                    <td>{c.status}</td>
                    <td>{c.especialidade ?? "—"}</td>
                    <td>
                      {c.finalizado
                        ? `Resolvido em ${formatHoras(c.tempoResolucaoHoras)}`
                        : c.diasEmAberto !== null
                          ? `${c.diasEmAberto} dias em aberto`
                          : "—"}
                    </td>
                    <td>{c.nota || "—"}</td>
                    <td>
                      <button
                        className="remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemover(c.codChamado);
                        }}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="meta">
                      Nenhum chamado priorizado{filtro !== "todos" ? ` (${filtro})` : ""} — adicione um código acima.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Validar build**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros (o componente ainda não está montado em nenhuma rota, então isso só confirma sintaxe/imports corretos — o roteamento real vem na Task 5).

- [ ] **Step 3: Commit**

```bash
cd "frontend"
git add src/pages/ChamadosPrioritarios.jsx
git commit -m "feat: pagina de chamados prioritarios"
```

---

### Task 5: Navegação, estilo do botão remover, e verificação end-to-end

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles.css` (fim do arquivo)

**Interfaces:**
- Consumes: `ChamadosPrioritarios` (Task 4).
- Produces: nada consumido por outra task — esta é a task final.

- [ ] **Step 1: Adicionar a rota e o item de menu em `App.jsx`**

Adicionar o import, logo após o de `Performance`:

```js
import Performance from "./pages/Performance.jsx";
import ChamadosPrioritarios from "./pages/ChamadosPrioritarios.jsx";
import Configuracoes from "./pages/Configuracoes.jsx";
```

Adicionar o `NavLink`, entre o de "Performance" e o de "Configurações":

```jsx
          <NavLink to="/performance" className={({ isActive }) => (isActive ? "active" : "")}>
            Performance
          </NavLink>
          <NavLink to="/prioritarios" className={({ isActive }) => (isActive ? "active" : "")}>
            Prioritários
          </NavLink>
          <NavLink to="/configuracoes" className={({ isActive }) => (isActive ? "active" : "")}>
            Configurações
          </NavLink>
```

Adicionar a `Route`, entre a de "/performance" e a de "/configuracoes":

```jsx
        <Route path="/performance" element={<Performance />} />
        <Route path="/prioritarios" element={<ChamadosPrioritarios />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
```

- [ ] **Step 2: Adicionar o estilo do botão remover em `styles.css`**

No fim do arquivo, adicionar:

```css

.remove-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.remove-btn:hover {
  border-color: var(--status-critical);
  color: var(--status-critical);
}
```

- [ ] **Step 3: Validar build**

Run: `cd frontend && npm run build`
Expected: `✓ built in Xs`, sem erros.

- [ ] **Step 4: Verificação manual end-to-end**

Com backend rodando (porta 3001) e frontend em dev (`cd frontend && npm run dev`, porta padrão do Vite):

1. Abrir a URL do Vite no navegador, confirmar que "Prioritários" aparece no menu entre "Performance" e "Configurações".
2. Clicar em "Prioritários" — deve carregar com resumo zerado e tabela vazia (`Nenhum chamado priorizado (abertos) — adicione um código acima.`).
3. Pegar um código de chamado real (mesmo comando `curl` da Task 2, Step 4) e colar no campo "Código do chamado", opcionalmente preencher "Nota", clicar "Adicionar".
4. Confirmar: linha aparece na tabela, StatTiles atualizam (Total = 1), campos do formulário limpam.
5. Tentar adicionar um código inexistente (ex: `0000-000000`) — confirmar que aparece o banner de erro vermelho junto do formulário, sem apagar a linha já adicionada.
6. Clicar na linha do chamado (fora do botão "Remover") — confirmar que abre o modal de detalhe do chamado, igual às outras telas.
7. Fechar o modal, clicar em "Remover" na linha — confirmar que a linha some e os StatTiles voltam a zero.
8. Testar o filtro Abertos/Fechados/Todos com pelo menos um chamado já finalizado marcado como prioritário (repetir passo 3 com o código de um chamado fechado) — confirmar que "Tempo" mostra `Resolvido em Xh` em vez de `X dias em aberto`, e que o filtro "Fechados" mostra só ele.

- [ ] **Step 5: Commit**

```bash
cd "frontend"
git add src/App.jsx src/styles.css
git commit -m "feat: liga a aba Prioritarios na navegacao"
```

---

## Self-Review

**Cobertura da spec:**
- Persistência flag + nota, upsert por código, dataset `carregarChamadosEnriquecidos` → Task 1 + Task 2. ✓
- 3 rotas (`GET/POST/DELETE`), validação de código contra dataset real → Task 2. ✓
- Continua após resolvido, filtro Aberto/Fechado/Todos client-side → Task 2 (payload sempre completo) + Task 4 (filtro local). ✓
- Resumo (4 StatTiles) + tabela detalhada + remover + nota + drill-down pro detalhe → Task 4. ✓
- Nav item + rota → Task 5. ✓
- Testes do serviço → Task 1. ✓
- Fora de escopo (sem endpoint de editar nota separado, sem confirmação de remoção, sem alertas) — nenhuma task implementa isso, como esperado. ✓

**Consistência de tipos/assinaturas:** `codChamado`/`nota`/`chave`/`especialidade`/`finalizado`/`diasEmAberto`/`tempoResolucaoHoras`/`encontrado` usados com o mesmo nome e formato em Task 2 (produção) e Task 4 (consumo) — conferido campo a campo.
