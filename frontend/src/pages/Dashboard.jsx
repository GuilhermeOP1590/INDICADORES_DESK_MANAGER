import { useEffect, useState } from "react";
import { fetchIndicadores } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { VolumeTrendChart } from "../components/VolumeTrendChart.jsx";
import { HorizontalBarChart } from "../components/HorizontalBarChart.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { periodoMesFiscal } from "../lib/datas.js";

function formatHoras(horas) {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} dias`;
}

const GRANULARIDADES = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

export default function Dashboard() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [granularidade, setGranularidade] = useState("dia");

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchIndicadores({ forceRefresh, ...periodo });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.dataInicio, periodo.dataFim]);

  return (
    <div>
      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={() => load(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      {state.payload && (
        <div className="meta" style={{ marginBottom: 16 }}>
          {state.payload.totalFiltrado} chamados no período (de {state.payload.totalCarregado} carregados no total, cancelados
          excluídos)
        </div>
      )}

      {state.status === "error" && <div className="state-banner error">Erro ao carregar indicadores: {state.error}</div>}

      {state.payload && state.payload.totalCarregado < state.payload.totalNoDesk && (
        <div className="state-banner warning">
          Só {state.payload.totalCarregado} de {state.payload.totalNoDesk} chamados foram carregados da API — pode haver dados
          faltando.
        </div>
      )}

      {state.payload && (
        <>
          <section className="stat-grid">
            <StatTile label="Total no período" value={state.payload.indicadores.volume.total} />
            <StatTile label="Em aberto" value={state.payload.indicadores.volume.abertos} />
            <StatTile label="Finalizados" value={state.payload.indicadores.volume.fechados} />
            <StatTile label="Tempo médio de resolução" value={formatHoras(state.payload.indicadores.sla.tempoMedioResolucaoHoras)} />
          </section>

          <section className="panel-grid">
            <div className="panel full-width">
              <div className="panel-header-row">
                <div>
                  <h2>Chamados criados</h2>
                  <p className="subtitle">Volume ao longo do período selecionado</p>
                </div>
                <div className="granularidade-toggle">
                  {GRANULARIDADES.map((g) => (
                    <button
                      key={g.key}
                      className={granularidade === g.key ? "active" : ""}
                      onClick={() => setGranularidade(g.key)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <VolumeTrendChart data={state.payload.indicadores.volume.porDia} granularidade={granularidade} />
            </div>

            <div className="panel">
              <h2>Chamados por status</h2>
              <p className="subtitle">Distribuição atual por situação</p>
              <HorizontalBarChart data={state.payload.indicadores.volume.porStatus} color="var(--series-1)" />
            </div>

            <div className="panel">
              <h2>Chamados por prioridade</h2>
              <p className="subtitle">Distribuição por nível de prioridade</p>
              <HorizontalBarChart data={state.payload.indicadores.categorias.porPrioridade} color="var(--series-2)" />
            </div>

            <div className="panel">
              <h2>Chamados por grupo/categoria</h2>
              <p className="subtitle">Top categorias por volume</p>
              <HorizontalBarChart data={state.payload.indicadores.categorias.porGrupo} color="var(--series-3)" limit={8} />
            </div>

            <div className="panel">
              <h2>Chamados por tipo</h2>
              <p className="subtitle">Distribuição por tipo de atendimento</p>
              <HorizontalBarChart data={state.payload.indicadores.categorias.porTipo} color="var(--series-4)" />
            </div>

            <div className="panel full-width">
              <h2>Chamados por operador</h2>
              <p className="subtitle">Todos os operadores com chamados no período</p>
              <OperadoresTable data={state.payload.indicadores.operadores} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
