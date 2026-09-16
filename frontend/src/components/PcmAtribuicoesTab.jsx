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
