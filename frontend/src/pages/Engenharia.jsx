import { useEffect, useState } from "react";
import { fetchEngenharia } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { MaximizableChart } from "../components/MaximizableChart.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { periodoMesFiscal } from "../lib/datas.js";

const GERAL = "__geral__";

export default function Engenharia() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [tipoAtivo, setTipoAtivo] = useState(GERAL);

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchEngenharia({ forceRefresh, ...periodo });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.dataInicio, periodo.dataFim]);

  const detalhe = tipoAtivo === GERAL ? state.payload?.geral : state.payload?.porAtividadeDetalhe?.[tipoAtivo];

  const filtroBase = {
    especialidade: "Engenharia",
    ...(tipoAtivo === GERAL ? {} : { tipoAtividade: tipoAtivo }),
    ...periodo,
  };

  return (
    <div>
      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={() => load(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao carregar indicadores de Engenharia: {state.error}</div>}

      {state.payload && (
        <>
          <div className="meta" style={{ marginBottom: 12 }}>
            {state.payload.total} chamados de Engenharia no período
          </div>

          <SubTabs
            options={[
              { value: GERAL, label: "Geral", count: state.payload.total },
              ...state.payload.porTipoAtividade.map((t) => ({ value: t.label, label: t.label, count: t.total })),
            ]}
            active={tipoAtivo}
            onChange={setTipoAtivo}
          />

          {tipoAtivo === GERAL && (
            <section className="panel-grid">
              <MaximizableChart
                title="Por tipo de atividade"
                subtitle="Civil, Hidráulica, Elétrica, Telhado, Serralheria, Compras — clique numa barra"
                data={state.payload.porTipoAtividade}
                color="var(--series-2)"
                limit={8}
                filtroBase={{ especialidade: "Engenharia", ...periodo }}
                dimensaoFiltro="tipoAtividade"
              />
            </section>
          )}

          {detalhe && (
            <>
              <section className="stat-grid">
                <StatTile label={`Chamados${tipoAtivo === GERAL ? "" : ` (${tipoAtivo})`}`} value={detalhe.total} />
              </section>

              <section className="panel-grid">
                <MaximizableChart
                  title="Por cliente"
                  subtitle={`Ranking de lojas/unidades${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} — clique numa barra`}
                  data={detalhe.porCliente}
                  color="var(--series-2)"
                  limit={10}
                  filtroBase={filtroBase}
                  dimensaoFiltro="cliente"
                />

                <div className="panel full-width">
                  <h2>Por operador</h2>
                  <p className="subtitle">Todos os operadores que atenderam esses chamados no período — clique numa linha</p>
                  <OperadoresTable data={detalhe.operadores} filtroBase={filtroBase} />
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
