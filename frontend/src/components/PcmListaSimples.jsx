// frontend/src/components/PcmListaSimples.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchPcmAtribuicoes } from "../api.js";
import { exportarLinhas } from "../lib/exportExcel.js";
import { COLUNAS_EXPORT_PCM, prepararLinhasExportPcm } from "../lib/pcmColunasExport.js";

// Lista somente-leitura de chamados filtrada por grupo/pessoa/urgência — aberta ao clicar
// numa célula da matriz Pessoa × Urgência (PcmPorGrupoTab). Edição continua só na aba
// "Atribuições"; aqui é só consulta + exportação. Mini-cards de tipo (Corretiva/Preventiva/
// Rotina/...) deixam escolher o que exportar sem precisar abrir a planilha inteira e filtrar
// depois no Excel.
export function PcmListaSimples({ filtros, onAbrirChamado }) {
  const [state, setState] = useState({ status: "loading", chamados: [], error: null });
  const [filtroTipo, setFiltroTipo] = useState("");

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", chamados: [], error: null });
    setFiltroTipo("");

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

  const porTipo = useMemo(() => {
    const contagem = new Map();
    for (const c of state.chamados) {
      const tipo = c.tipo || "Não classificado";
      contagem.set(tipo, (contagem.get(tipo) || 0) + 1);
    }
    return [...contagem.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  }, [state.chamados]);

  const chamadosFiltrados = filtroTipo ? state.chamados.filter((c) => (c.tipo || "Não classificado") === filtroTipo) : state.chamados;

  if (state.status === "loading") return <p className="subtitle">Carregando chamados...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro: {state.error}</div>;
  if (state.chamados.length === 0) return <p className="subtitle">Nenhum chamado encontrado.</p>;

  return (
    <div>
      {porTipo.length > 1 && (
        <div className="equip-summary">
          {porTipo.map((t) => (
            <button
              key={t.label}
              type="button"
              className={`equip-summary-chip${filtroTipo === t.label ? " ativo" : ""}`}
              onClick={() => setFiltroTipo((f) => (f === t.label ? "" : t.label))}
            >
              {t.label}: <strong>{t.total}</strong>
            </button>
          ))}
        </div>
      )}

      <button
        className="refresh-btn"
        style={{ marginBottom: 8 }}
        onClick={() => exportarLinhas(prepararLinhasExportPcm(chamadosFiltrados), COLUNAS_EXPORT_PCM, "pcm-chamados")}
      >
        Exportar Excel{filtroTipo ? ` (${filtroTipo})` : ""}
      </button>
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Assunto</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Pessoa</th>
            <th>Urgência</th>
          </tr>
        </thead>
        <tbody>
          {chamadosFiltrados.map((c) => (
            <tr
              key={c.codChamado}
              className="clickable-row"
              onClick={() => onAbrirChamado?.({ chave: c.chave, codChamado: c.codChamado })}
            >
              <td>{c.codChamado}</td>
              <td>{c.assunto}</td>
              <td>{c.tipo ?? "—"}</td>
              <td>{c.status}</td>
              <td>{c.pessoa ?? "—"}</td>
              <td>{c.urgencia ?? "—"}</td>
            </tr>
          ))}
          {chamadosFiltrados.length === 0 && (
            <tr>
              <td colSpan={6} className="meta">
                Nenhum chamado do tipo "{filtroTipo}" nessa lista.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
