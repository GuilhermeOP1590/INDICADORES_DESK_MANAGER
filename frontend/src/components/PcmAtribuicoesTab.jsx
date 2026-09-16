// frontend/src/components/PcmAtribuicoesTab.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchPcmAtribuicoes, salvarPcmAtribuicao } from "../api.js";
import { StatTile } from "./StatTile.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

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
  const [filtroPrazo, setFiltroPrazo] = useState("");
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

  const contagemPrazo = useMemo(() => {
    const contagem = { atrasado: 0, "vence-semana": 0, "no-prazo": 0, "sem-data": 0 };
    for (const c of state.chamados) contagem[c.statusPrazo] += 1;
    return contagem;
  }, [state.chamados]);

  const chamadosFiltrados = state.chamados
    .filter((c) => !filtroPrazo || c.statusPrazo === filtroPrazo)
    .filter((c) => {
      const termo = busca.trim().toLowerCase();
      if (!termo) return true;
      return c.codChamado.toLowerCase().includes(termo) || c.assunto.toLowerCase().includes(termo);
    });

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

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por código ou assunto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <span className="meta">
          {chamadosFiltrados.length} de {state.chamados.length}
        </span>
      </div>

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
                <td className="clickable-row" onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}>
                  {c.codChamado}
                </td>
                <td className="clickable-row" onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}>
                  {c.assunto}
                </td>
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
