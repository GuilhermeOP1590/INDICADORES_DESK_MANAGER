import { useEffect, useState } from "react";
import { fetchEngenharia } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { HorizontalBarChart } from "../components/HorizontalBarChart.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";
import { SubTabs } from "../components/SubTabs.jsx";

export default function Engenharia() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [tipoAtivo, setTipoAtivo] = useState(null);

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchEngenharia({ forceRefresh });
      setState({ status: "ready", payload, error: null });
      setTipoAtivo((atual) => atual ?? payload.porTipoAtividade[0]?.label ?? null);
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const detalhe = tipoAtivo ? state.payload?.porAtividadeDetalhe?.[tipoAtivo] : null;

  return (
    <div>
      <div className="page-toolbar">
        <div className="meta">{state.payload && `${state.payload.total} chamados de Engenharia no total`}</div>
        <button className="refresh-btn" onClick={() => load(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao carregar indicadores de Engenharia: {state.error}</div>}

      {state.payload && (
        <>
          <SubTabs
            options={state.payload.porTipoAtividade.map((t) => ({ value: t.label, label: t.label, count: t.total }))}
            active={tipoAtivo}
            onChange={setTipoAtivo}
          />

          {detalhe && (
            <>
              <section className="stat-grid">
                <StatTile label={`Chamados (${tipoAtivo})`} value={detalhe.total} />
              </section>

              <section className="panel-grid">
                <div className="panel">
                  <h2>Por cliente</h2>
                  <p className="subtitle">Ranking de lojas/unidades — {tipoAtivo}</p>
                  <HorizontalBarChart data={detalhe.porCliente} color="var(--series-2)" limit={10} />
                </div>

                <div className="panel full-width">
                  <h2>Por operador</h2>
                  <p className="subtitle">Todos os operadores que atenderam chamados de {tipoAtivo}</p>
                  <OperadoresTable data={detalhe.operadores} />
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
