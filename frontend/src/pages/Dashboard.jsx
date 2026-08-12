import { useEffect, useState } from "react";
import { fetchIndicadores, fetchIndicadoresCausas, fetchDashboardChamados } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { TeamPerformanceCards } from "../components/TeamPerformanceCards.jsx";
import { VolumeTrendChart } from "../components/VolumeTrendChart.jsx";
import { MaximizableChart } from "../components/MaximizableChart.jsx";
import { ChamadosPorAreaChart } from "../components/ChamadosPorAreaChart.jsx";
import { RankedClientePanel } from "../components/RankedClientePanel.jsx";
import { DonutChart } from "../components/DonutChart.jsx";
import { CausaPanel } from "../components/CausaPanel.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { UfSelect } from "../components/UfSelect.jsx";
import { useUfsDisponiveis } from "../lib/useUfsDisponiveis.js";
import { periodoMesFiscal, formatHoras } from "../lib/datas.js";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

const formatPct = (valor) => `${valor}%`;

const GRANULARIDADES = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

export default function Dashboard() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [granularidade, setGranularidade] = useState("dia");
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");
  const ufsDisponiveis = useUfsDisponiveis();
  const drill = useDrillDown();

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchIndicadores({ forceRefresh, ...periodo, q: busca || undefined, uf: uf || undefined });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.dataInicio, periodo.dataFim, busca, uf]);

  const filtroBase = { ...periodo, q: busca || undefined, uf: uf || undefined };
  const tempoMedio = state.payload?.indicadores.sla.tempoMedioResolucaoHoras;

  // % de resolução por cliente (só quem tem amostra mínima — senão 1 chamado fechado vira
  // "100%" e distorce o ranking) — quem está indo melhor/pior, não só quem tem mais volume.
  // percentualResolucao null = cliente sem nenhum chamado concluído ou aberto (só "Aguardando
  // Aprovação") — não dá pra ranquear como melhor nem pior sem nenhum dado avaliável.
  // Filtro de tipo (Preventiva/Corretiva/Rotina/Segurança) troca pra um recorte pré-calculado
  // no backend (porClientePorTipo) — só existe pra chamados de Manutenção.
  const porCliente = tipoCliente
    ? (state.payload?.indicadores.porClientePorTipo?.[tipoCliente] ?? [])
    : (state.payload?.indicadores.porCliente ?? []);
  const clientesComAmostra = porCliente.filter(
    (c) => c.cliente !== "Não informado" && c.total >= 3 && c.percentualResolucao !== null
  );
  const melhorResolucaoClienteData = [...clientesComAmostra]
    .sort((a, b) => (b.percentualResolucao ?? 0) - (a.percentualResolucao ?? 0))
    .map((c) => ({ label: c.cliente, total: c.percentualResolucao }));
  const piorResolucaoClienteData = [...clientesComAmostra]
    .sort((a, b) => (a.percentualResolucao ?? 0) - (b.percentualResolucao ?? 0))
    .map((c) => ({ label: c.cliente, total: c.percentualResolucao }));

  return (
    <div>
      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={() => load(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por assunto, equipamento ou código do chamado..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <UfSelect value={uf} onChange={setUf} ufs={ufsDisponiveis} />
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
            <StatTile
              label="Total no período"
              value={state.payload.indicadores.volume.total}
              onClick={() => drill.abrirLista(filtroBase, "Total no período", fetchDashboardChamados)}
            />
            <StatTile
              label="Em aberto"
              value={state.payload.indicadores.volume.abertos}
              onClick={() => drill.abrirLista({ ...filtroBase, situacaoVolume: "aberto" }, "Em aberto", fetchDashboardChamados)}
            />
            <StatTile
              label="Finalizados"
              value={state.payload.indicadores.volume.fechados}
              onClick={() =>
                drill.abrirLista({ ...filtroBase, situacaoVolume: "finalizado" }, "Finalizados", fetchDashboardChamados)
              }
            />
            <StatTile
              label="Tempo médio de resolução"
              value={formatHoras(tempoMedio)}
              onClick={() =>
                drill.abrirLista(
                  { ...filtroBase, situacaoVolume: "finalizado" },
                  `Tempo médio de resolução — ${formatHoras(tempoMedio)}`,
                  fetchDashboardChamados
                )
              }
            />
            <StatTile
              label="Backlog (antes do período)"
              value={state.payload.backlog.total}
              statusClass={state.payload.backlog.total > 0 ? "status-warning" : undefined}
              meta="Criados antes do período e ainda em aberto"
              onClick={() =>
                drill.abrirResumoBacklog(
                  state.payload.backlog,
                  { uf: uf || undefined, q: busca || undefined, criadosAntes: periodo.dataInicio, situacaoVolume: "aberto" },
                  "Backlog — criados antes do período"
                )
              }
            />
          </section>

          <TeamPerformanceCards
            operadores={state.payload.indicadores.operadores}
            onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período", fetchDashboardChamados)}
            onAbrirOperador={(operador) => drill.abrirLista({ ...filtroBase, operador }, operador, fetchDashboardChamados)}
          />

          {drill.pilha !== null && (
            <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
              <DrillDownContent
                topo={drill.topo}
                onAbrirChamado={drill.abrirChamado}
                onAbrirLista={(filtros, titulo) => drill.abrirListaEmpilhada(filtros, titulo, fetchDashboardChamados)}
              />
            </Modal>
          )}

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
              <h2>Aberto x Finalizado</h2>
              <p className="subtitle">Proporção dos chamados do período</p>
              <DonutChart
                data={[
                  { label: "Em aberto", total: state.payload.indicadores.volume.abertos },
                  { label: "Finalizados", total: state.payload.indicadores.volume.fechados },
                ]}
                height={220}
              />
            </div>

            <MaximizableChart
              title="Chamados por status"
              subtitle="Distribuição atual por situação — clique numa barra"
              data={state.payload.indicadores.volume.porStatus}
              color="var(--series-1)"
              filtroBase={filtroBase}
              dimensaoFiltro="status"
              fetcher={fetchDashboardChamados}
            />

            <div className="panel">
              <h2>Chamados por área</h2>
              <p className="subtitle">Engenharia x Manutenção x outras áreas — clique numa barra</p>
              <ChamadosPorAreaChart
                data={state.payload.indicadores.areas}
                onBarClick={(area) => drill.abrirLista({ ...filtroBase, area }, area, fetchDashboardChamados)}
              />
            </div>

            <CausaPanel carregar={() => fetchIndicadoresCausas(filtroBase)} filtroBase={filtroBase} />

            <RankedClientePanel
              title="Clientes com melhor % de resolução"
              subtitle={
                tipoCliente
                  ? `Top 10 — só ${tipoCliente} (mínimo 3 chamados) — clique pra ver todos e abrir os chamados`
                  : "Top 10 no período (mínimo 3 chamados) — clique pra ver todos em % e abrir os chamados"
              }
              data={melhorResolucaoClienteData}
              color="var(--status-good)"
              filtroBase={{ ...filtroBase, tipo: tipoCliente || undefined }}
              formatValue={formatPct}
              ordemInicial="desc"
              fetcher={fetchDashboardChamados}
              tipoFiltro={tipoCliente}
              onTipoFiltroChange={setTipoCliente}
            />

            <RankedClientePanel
              title="Clientes com pior % de resolução"
              subtitle={
                tipoCliente
                  ? `Top 10 — só ${tipoCliente} (mínimo 3 chamados) — clique pra ver todos e abrir os chamados`
                  : "Top 10 no período (mínimo 3 chamados) — clique pra ver todos em % e abrir os chamados"
              }
              data={piorResolucaoClienteData}
              color="var(--status-critical)"
              filtroBase={{ ...filtroBase, tipo: tipoCliente || undefined }}
              formatValue={formatPct}
              ordemInicial="asc"
              fetcher={fetchDashboardChamados}
              tipoFiltro={tipoCliente}
              onTipoFiltroChange={setTipoCliente}
            />
          </section>
        </>
      )}
    </div>
  );
}
