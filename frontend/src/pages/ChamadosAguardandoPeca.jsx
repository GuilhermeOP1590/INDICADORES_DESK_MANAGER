import { useEffect, useState } from "react";
import { fetchAguardandoPeca } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { SortableTh } from "../components/SortableTh.jsx";
import { useSort } from "../lib/useSort.js";

// Sem filtro de período/UF — igual Condenados: o objetivo é nunca perder de vista peça
// pendente antiga. Some da lista sozinho quando o status do chamado muda no Desk.
export default function ChamadosAguardandoPeca() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [busca, setBusca] = useState("");
  const drill = useDrillDown();

  async function carregar(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchAguardandoPeca({ forceRefresh });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const payload = state.payload;
  const itens = payload?.itens ?? [];
  const maisAntigo = itens[0];

  const filtrados = itens.filter((c) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return (
      c.assunto.toLowerCase().includes(termo) ||
      c.codChamado.toLowerCase().includes(termo) ||
      (c.cliente ?? "").toLowerCase().includes(termo)
    );
  });

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtrados, "diasParado", "desc");

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Aguardando Peça</h2>
          <p className="subtitle">
            Todo chamado com status "Aguardando Peça do Estoque" ou "Peça Enviada para Loja" agora, de
            qualquer período — sai da lista sozinho quando o status muda no Desk.
          </p>
        </div>
        <button className="refresh-btn" onClick={() => carregar(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao carregar aguardando peça: {state.error}</div>}
      {state.status === "loading" && !payload && <p className="subtitle">Carregando...</p>}

      {payload && (
        <>
          <section className="stat-grid">
            <StatTile
              label="Total pendente"
              value={payload.total}
              statusClass={payload.total > 0 ? "status-warning" : undefined}
            />
            <StatTile
              label="Parado há mais tempo"
              value={payload.diasParadoMaisAntigo !== null ? `${payload.diasParadoMaisAntigo} dias` : "—"}
              meta={maisAntigo ? `${maisAntigo.codChamado} — ${maisAntigo.cliente ?? "—"}` : undefined}
              statusClass={payload.diasParadoMaisAntigo > 0 ? "status-warning" : undefined}
            />
          </section>

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
            {itens.length === 0 ? (
              <p className="subtitle">Nenhum chamado aguardando peça no momento.</p>
            ) : (
              <>
                <div className="filter-bar">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Buscar por assunto, código ou cliente..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                  <span className="meta">
                    {filtrados.length} de {itens.length}
                  </span>
                </div>

                {sorted.length === 0 ? (
                  <p className="subtitle">Nenhum chamado corresponde a essa busca.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <SortableTh label="Código" sortKeyName="codChamado" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableTh label="Assunto" sortKeyName="assunto" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableTh label="Cliente" sortKeyName="cliente" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableTh label="Área" sortKeyName="especialidade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <th>Equipamento (Ic)</th>
                        <SortableTh label="Causa" sortKeyName="causa" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableTh
                          label="Dias parado"
                          sortKeyName="diasParado"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="num"
                        />
                        <SortableTh label="Operador" sortKeyName="operador" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((c) => (
                        <tr
                          key={c.chave}
                          className="clickable-row"
                          onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}
                        >
                          <td>{c.codChamado}</td>
                          <td>{c.assunto}</td>
                          <td>{c.cliente ?? "—"}</td>
                          <td>{c.especialidade ?? "—"}</td>
                          <td>{c.ics.length > 0 ? c.ics.join(", ") : "—"}</td>
                          <td>{c.causa ?? "—"}</td>
                          <td className="num">{c.diasParado ?? "—"}</td>
                          <td>{c.operador}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
