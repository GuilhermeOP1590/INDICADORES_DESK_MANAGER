// frontend/src/components/PcmPorGrupoTab.jsx
import { useEffect, useState } from "react";
import { fetchPcmIndicadorGrupo, fetchPcmIndicadorPessoa, fetchPcmAtribuicoes } from "../api.js";
import { StatTile } from "./StatTile.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { exportarLinhas } from "../lib/exportExcel.js";
import { COLUNAS_EXPORT_PCM, prepararLinhasExportPcm } from "../lib/pcmColunasExport.js";

const URGENCIAS_COLUNAS = ["Crítica", "Alta", "Média", "Baixa", "Não classificado"];

export function PcmPorGrupoTab({ situacao }) {
  const [state, setState] = useState({ status: "loading", porGrupo: [], error: null });
  const [grupoAberto, setGrupoAberto] = useState(null);
  const [pessoas, setPessoas] = useState({ status: "idle", porPessoa: [], error: null });
  const drill = useDrillDown();

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

  async function exportarGrupo() {
    const { chamados } = await fetchPcmAtribuicoes({ situacao, grupo: grupoAberto });
    exportarLinhas(prepararLinhasExportPcm(chamados), COLUNAS_EXPORT_PCM, `pcm-${grupoAberto}`);
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
          <div className="page-toolbar">
            <h3 style={{ margin: 0 }}>{grupoAberto}</h3>
            <button className="refresh-btn" onClick={exportarGrupo}>
              Exportar Excel
            </button>
          </div>
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
                        drill.abrirPcmLista({ situacao, grupo: grupoAberto, pessoa: p.pessoa }, `${grupoAberto} — ${p.pessoa}`)
                      }
                    >
                      {p.pessoa}
                    </td>
                    {URGENCIAS_COLUNAS.map((u) => (
                      <td
                        key={u}
                        className="num clickable-row"
                        onClick={() =>
                          drill.abrirPcmLista(
                            { situacao, grupo: grupoAberto, pessoa: p.pessoa, urgencia: u },
                            `${grupoAberto} — ${p.pessoa} — ${u}`
                          )
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

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}
    </div>
  );
}
