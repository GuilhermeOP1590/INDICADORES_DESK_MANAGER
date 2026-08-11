import { useEffect, useState } from "react";
import { fetchManutencao } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { MaximizableChart } from "../components/MaximizableChart.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { periodoMesFiscal } from "../lib/datas.js";

const GERAL = "__geral__";
const TIPOS = ["Preventiva", "Corretiva", "Rotina", "Outros/Não classificado"];
const COR_POR_TIPO = {
  [GERAL]: "var(--series-1)",
  Preventiva: "var(--series-3)",
  Corretiva: "var(--series-2)",
  Rotina: "var(--series-1)",
  "Outros/Não classificado": "var(--series-4)",
};

export default function Manutencao() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [tipoAtivo, setTipoAtivo] = useState(GERAL);

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchManutencao({ forceRefresh, ...periodo });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.dataInicio, periodo.dataFim]);

  const contagemPorTipo = Object.fromEntries((state.payload?.porTipo ?? []).map((t) => [t.label, t.total]));
  const detalhe = tipoAtivo === GERAL ? state.payload?.geral : state.payload?.porTipoDetalhe?.[tipoAtivo];

  const filtroBase = {
    especialidade: "Manutenção",
    ...(tipoAtivo === GERAL ? {} : { tipo: tipoAtivo }),
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

      {state.status === "error" && <div className="state-banner error">Erro ao carregar indicadores de Manutenção: {state.error}</div>}

      {state.payload && (
        <>
          <div className="meta" style={{ marginBottom: 12 }}>
            {state.payload.total} chamados de Manutenção no período
          </div>

          <SubTabs
            options={[
              { value: GERAL, label: "Geral", count: state.payload.total },
              ...TIPOS.map((tipo) => ({ value: tipo, label: tipo, count: contagemPorTipo[tipo] ?? 0 })),
            ]}
            active={tipoAtivo}
            onChange={setTipoAtivo}
          />

          {tipoAtivo === "Outros/Não classificado" && (
            <div className="state-banner warning">
              Chamados de "Manutenção - Equipamentos" que não são claramente um equipamento (Segurança, Sesmt, Transporte, testes) —
              revisar depois se algum desses precisa de classificação própria.
            </div>
          )}

          {tipoAtivo === GERAL && (
            <section className="panel-grid">
              <MaximizableChart
                title="Por tipo"
                subtitle="Preventiva x Corretiva x Rotina x Outros, no período — clique numa barra pra ver os chamados"
                data={state.payload.porTipo}
                color="var(--series-1)"
                limit={4}
                filtroBase={{ especialidade: "Manutenção", ...periodo }}
                dimensaoFiltro="tipo"
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
                  title="Por equipamento"
                  subtitle={`Ranking de equipamentos${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} — clique numa barra`}
                  data={detalhe.porEquipamento}
                  color={COR_POR_TIPO[tipoAtivo]}
                  limit={10}
                  filtroBase={filtroBase}
                  dimensaoFiltro="equipamento"
                />

                <MaximizableChart
                  title="Por cliente"
                  subtitle={`Ranking de lojas/unidades${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} — clique numa barra`}
                  data={detalhe.porCliente}
                  color={COR_POR_TIPO[tipoAtivo]}
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
