// frontend/src/components/PcmAtribuicoesTab.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchPcmAtribuicoes, salvarPcmAtribuicao } from "../api.js";
import { StatTile } from "./StatTile.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { useSort } from "../lib/useSort.js";
import { formatBR } from "../lib/datas.js";
import { exportarLinhas } from "../lib/exportExcel.js";
import { COLUNAS_EXPORT_PCM, prepararLinhasExportPcm } from "../lib/pcmColunasExport.js";
import { aplicarFiltrosColuna, buscaNormalizada, filtroAtivo, opcoesDaColuna } from "../lib/filtrosColuna.js";
import { ColumnFilterTh } from "./ColumnFilterTh.jsx";

const URGENCIAS = ["Crítica", "Alta", "Média", "Baixa"];

const LABEL_PRAZO = {
  atrasado: "Atrasado",
  "vence-semana": "Vence esta semana",
  "no-prazo": "No prazo",
  "sem-data": "Sem data",
};

const ORDEM_PRAZO = ["Atrasado", "Vence esta semana", "No prazo", "Sem data"];
const ORDEM_URGENCIA = [...URGENCIAS, "Sem urgência"];

function porOrdemFixa(ordem) {
  return (a, b) => ordem.indexOf(a) - ordem.indexOf(b);
}

// "dd/mm/aaaa" não ordena como texto — compara pela data ISO; "Sem data" vai pro fim.
function porDataBR(a, b) {
  const iso = (v) => (v === "Sem data" ? "9999" : v.split("/").reverse().join("-"));
  return iso(a).localeCompare(iso(b));
}

const COLUNAS = [
  { chave: "codChamado", titulo: "Código", tipo: "texto", valor: (c) => c.codChamado },
  { chave: "assunto", titulo: "Assunto", tipo: "texto", valor: (c) => c.assunto ?? "" },
  { chave: "cliente", titulo: "Loja", tipo: "lista", valor: (c) => c.cliente || "Sem loja" },
  { chave: "pessoa", titulo: "Distribuição", tipo: "lista", valor: (c) => c.pessoa ?? "Sem pessoa" },
  { chave: "grupo", titulo: "Grupo", tipo: "lista", valor: (c) => c.grupo },
  {
    chave: "urgencia",
    titulo: "Urgência",
    tipo: "lista",
    valor: (c) => c.urgencia || "Sem urgência",
    ordenarOpcoes: porOrdemFixa(ORDEM_URGENCIA),
  },
  { chave: "observacao", titulo: "Observação", tipo: "texto", valor: (c) => c.observacao ?? "" },
  {
    chave: "dataPrevistaSolucao",
    titulo: "Data prevista",
    tipo: "lista",
    valor: (c) => (c.dataPrevistaSolucao ? formatBR(c.dataPrevistaSolucao) : "Sem data"),
    ordenarOpcoes: porDataBR,
  },
  {
    chave: "statusPrazo",
    titulo: "Prazo",
    tipo: "lista",
    valor: (c) => LABEL_PRAZO[c.statusPrazo],
    ordenarOpcoes: porOrdemFixa(ORDEM_PRAZO),
  },
];

const COLUNA_PRAZO = COLUNAS.find((c) => c.chave === "statusPrazo");

// Resumo curto do filtro pra mostrar no chip ("Loja: Loja 12, Loja 30 +2").
function resumoFiltro(coluna, filtro) {
  if (coluna.tipo === "texto") return `contém "${filtro.trim()}"`;
  const valores = [...filtro];
  return valores.length <= 2 ? valores.join(", ") : `${valores.slice(0, 2).join(", ")} +${valores.length - 2}`;
}

const CLASSE_PRAZO = {
  atrasado: "status-critical",
  "vence-semana": "status-warning",
  "no-prazo": "status-good",
};

// Campo de observação isolado: mantém o texto digitado num estado local e só chama
// onSalvar no blur (não a cada tecla) — evita disparar uma request por caractere e evita
// que uma resposta atrasada do servidor sobrescreva o que o usuário ainda está digitando.
function ObservacaoCell({ chamado, onSalvar }) {
  const [valor, setValor] = useState(chamado.observacao ?? "");

  useEffect(() => {
    setValor(chamado.observacao ?? "");
  }, [chamado.codChamado, chamado.observacao]);

  return (
    <input
      type="text"
      className="search-input"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => {
        if (valor !== (chamado.observacao ?? "")) onSalvar(valor);
      }}
    />
  );
}

export function PcmAtribuicoesTab({ situacao }) {
  const [state, setState] = useState({ status: "loading", chamados: [], error: null });
  const [filtros, setFiltros] = useState({});
  const [busca, setBusca] = useState("");
  const drill = useDrillDown();

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

  const chamadosNaBusca = useMemo(() => {
    const termo = buscaNormalizada(busca);
    if (!termo) return state.chamados;
    return state.chamados.filter((c) =>
      [c.codChamado, c.assunto, c.cliente, c.pessoa].some((v) => buscaNormalizada(v).includes(termo))
    );
  }, [state.chamados, busca]);

  const chamadosFiltrados = useMemo(
    () => aplicarFiltrosColuna(chamadosNaBusca, COLUNAS, filtros),
    [chamadosNaBusca, filtros]
  );

  // Opções de cada coluna = valores presentes nas linhas que passam em todos os OUTROS
  // filtros — assim dá pra cruzar (ex.: escolher a loja e ver só os grupos/pessoas dela).
  const opcoesPorColuna = useMemo(() => {
    const opcoes = {};
    for (const coluna of COLUNAS) {
      if (coluna.tipo !== "lista") continue;
      opcoes[coluna.chave] = opcoesDaColuna(aplicarFiltrosColuna(chamadosNaBusca, COLUNAS, filtros, coluna.chave), coluna);
    }
    return opcoes;
  }, [chamadosNaBusca, filtros]);

  // Os cards de prazo contam dentro dos demais filtros (loja, grupo...), mas ignoram o
  // próprio filtro de prazo — senão clicar em "Atrasados" zeraria os outros cards.
  const contagemPrazo = useMemo(() => {
    const contagem = { atrasado: 0, "vence-semana": 0, "no-prazo": 0, "sem-data": 0 };
    for (const c of aplicarFiltrosColuna(chamadosNaBusca, COLUNAS, filtros, "statusPrazo")) contagem[c.statusPrazo] += 1;
    return contagem;
  }, [chamadosNaBusca, filtros]);

  const { sorted: chamadosOrdenados, sortKey, sortDir, toggleSort } = useSort(chamadosFiltrados);

  function definirFiltro(chave, valor) {
    setFiltros((f) => ({ ...f, [chave]: valor }));
  }

  function alternarPrazo(statusPrazo) {
    const label = LABEL_PRAZO[statusPrazo];
    const atual = filtros.statusPrazo;
    const soEsse = atual && atual.size === 1 && atual.has(label);
    definirFiltro("statusPrazo", soEsse ? new Set() : new Set([label]));
  }

  function prazoSelecionado(statusPrazo) {
    return filtroAtivo(COLUNA_PRAZO, filtros.statusPrazo) && filtros.statusPrazo.has(LABEL_PRAZO[statusPrazo]);
  }

  const filtrosAtivos = COLUNAS.filter((c) => filtroAtivo(c, filtros[c.chave]));
  const temFiltro = filtrosAtivos.length > 0 || busca.trim() !== "";

  function limparTudo() {
    setFiltros({});
    setBusca("");
  }

  function exportarFiltrados() {
    exportarLinhas(prepararLinhasExportPcm(chamadosOrdenados), COLUNAS_EXPORT_PCM, "pcm-atribuicoes-filtradas");
  }

  if (state.status === "loading") return <p className="subtitle">Carregando atribuições...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar atribuições: {state.error}</div>;

  return (
    <div>
      <section className="stat-grid">
        <StatTile
          label="Atrasados"
          value={contagemPrazo.atrasado}
          statusClass="status-critical"
          className={prazoSelecionado("atrasado") ? "selecionado" : ""}
          onClick={() => alternarPrazo("atrasado")}
        />
        <StatTile
          label="Vence esta semana"
          value={contagemPrazo["vence-semana"]}
          statusClass="status-warning"
          className={prazoSelecionado("vence-semana") ? "selecionado" : ""}
          onClick={() => alternarPrazo("vence-semana")}
        />
        <StatTile
          label="No prazo"
          value={contagemPrazo["no-prazo"]}
          statusClass="status-good"
          className={prazoSelecionado("no-prazo") ? "selecionado" : ""}
          onClick={() => alternarPrazo("no-prazo")}
        />
        <StatTile
          label="Sem data prevista"
          value={contagemPrazo["sem-data"]}
          className={prazoSelecionado("sem-data") ? "selecionado" : ""}
          onClick={() => alternarPrazo("sem-data")}
        />
      </section>

      {state.error && <div className="state-banner error">{state.error}</div>}

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por código, assunto, loja ou pessoa..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <span className="meta">
          {chamadosFiltrados.length} de {state.chamados.length}
        </span>
        <button className="refresh-btn" onClick={exportarFiltrados} disabled={chamadosFiltrados.length === 0}>
          Exportar Excel
        </button>
      </div>

      {temFiltro && (
        <div className="filtro-chips">
          {filtrosAtivos.map((coluna) => (
            <span key={coluna.chave} className="filtro-chip">
              <strong>{coluna.titulo}:</strong> {resumoFiltro(coluna, filtros[coluna.chave])}
              <button
                type="button"
                title={`Remover filtro de ${coluna.titulo}`}
                onClick={() => definirFiltro(coluna.chave, coluna.tipo === "texto" ? "" : new Set())}
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" className="filtro-limpar" onClick={limparTudo}>
            Limpar todos os filtros
          </button>
        </div>
      )}

      <div className="panel full-width">
        <table>
          <thead>
            <tr>
              {COLUNAS.map((coluna, i) => (
                <ColumnFilterTh
                  key={coluna.chave}
                  coluna={coluna}
                  filtro={filtros[coluna.chave]}
                  opcoes={opcoesPorColuna[coluna.chave] ?? []}
                  onChange={(valor) => definirFiltro(coluna.chave, valor)}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  alinharDireita={i >= COLUNAS.length - 3}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {chamadosOrdenados.map((c) => (
              <tr key={c.codChamado}>
                <td className="clickable-row" onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}>
                  {c.codChamado}
                </td>
                <td className="clickable-row" onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}>
                  {c.assunto}
                </td>
                <td>{c.cliente || "—"}</td>
                <td className="clickable-row" onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}>
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
                  <ObservacaoCell chamado={c} onSalvar={(valor) => handleEditar(c.codChamado, "observacao", valor)} />
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
                <td colSpan={COLUNAS.length} className="meta">
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
