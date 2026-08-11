import { useEffect, useState } from "react";
import { fetchIndicadores } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { VolumeTrendChart } from "../components/VolumeTrendChart.jsx";
import { HorizontalBarChart } from "../components/HorizontalBarChart.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";

function formatHoras(horas) {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} dias`;
}

function formatPct(pct) {
  if (pct === null || pct === undefined) return "—";
  return `${pct.toFixed(1)}%`;
}

function pctStatusClass(pct) {
  if (pct === null || pct === undefined) return "";
  if (pct >= 90) return "status-good";
  if (pct >= 70) return "status-warning";
  return "status-critical";
}

export default function Dashboard() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchIndicadores({ forceRefresh });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="page-toolbar">
        {state.payload && (
          <div className="meta">
            Atualizado em {new Date(state.payload.atualizadoEm).toLocaleString("pt-BR")} · {state.payload.registrosCarregados} de{" "}
            {state.payload.totalNoDesk} chamados carregados
          </div>
        )}
        <button className="refresh-btn" onClick={() => load(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao carregar indicadores: {state.error}</div>}

      {state.payload && state.payload.registrosCarregados < state.payload.totalNoDesk && (
        <div className="state-banner warning">
          Exibindo os {state.payload.registrosCarregados} chamados mais recentes de um total de {state.payload.totalNoDesk}.
        </div>
      )}

      {state.payload && (
        <>
          <section className="stat-grid">
            <StatTile label="Total de chamados" value={state.payload.indicadores.volume.total} />
            <StatTile label="Em aberto" value={state.payload.indicadores.volume.abertos} />
            <StatTile label="Finalizados" value={state.payload.indicadores.volume.fechados} />
            <StatTile label="Tempo médio de resolução" value={formatHoras(state.payload.indicadores.sla.tempoMedioResolucaoHoras)} />
            <StatTile
              label="SLA 1º atendimento cumprido"
              value={formatPct(state.payload.indicadores.sla.sla1CumpridoPct)}
              statusClass={pctStatusClass(state.payload.indicadores.sla.sla1CumpridoPct)}
            />
            <StatTile
              label="SLA 2º atendimento cumprido"
              value={formatPct(state.payload.indicadores.sla.sla2CumpridoPct)}
              statusClass={pctStatusClass(state.payload.indicadores.sla.sla2CumpridoPct)}
            />
          </section>

          <section className="panel-grid">
            <div className="panel full-width">
              <h2>Chamados criados por dia</h2>
              <p className="subtitle">Últimos dias com movimentação, ordenados cronologicamente</p>
              <VolumeTrendChart data={state.payload.indicadores.volume.porDia} />
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
