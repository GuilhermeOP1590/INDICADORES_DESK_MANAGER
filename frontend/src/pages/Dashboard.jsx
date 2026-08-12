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
import { SubTabs } from "../components/SubTabs.jsx";
import { useUfsDisponiveis } from "../lib/useUfsDisponiveis.js";
import { periodoMesFiscal, formatHoras, periodoDoPontoDaSerie } from "../lib/datas.js";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

const formatPct = (valor) => `${valor}%`;

const GRANULARIDADES = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

const GERAL = "__geral__";
// "tipo" só existe pra chamados de Manutenção, com Engenharia sempre caindo em "Corretiva"
// (ver indicadores.js#buildIndicadores no backend) — mesmas abas que já existem em Manutenção.
const TIPOS = ["Preventiva", "Corretiva", "Rotina", "Segurança", "Outros/Não classificado"];

export default function Dashboard() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [granularidade, setGranularidade] = useState("dia");
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [tipoAtivo, setTipoAtivo] = useState(GERAL);
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

  const contagemPorTipo = Object.fromEntries((state.payload?.indicadores.porTipo ?? []).map((t) => [t.label, t.total]));
  const detalhe = tipoAtivo === GERAL ? state.payload?.indicadores : state.payload?.indicadores.porTipoDetalhe?.[tipoAtivo];

  const filtroBase = {
    ...(tipoAtivo === GERAL ? {} : { tipo: tipoAtivo }),
    ...periodo,
    q: busca || undefined,
    uf: uf || undefined,
  };
  const tempoMedio = detalhe?.sla.tempoMedioResolucaoHoras;

  // % de resolução por cliente (só quem tem amostra mínima — senão 1 chamado fechado vira
  // "100%" e distorce o ranking) — quem está indo melhor/pior, não só quem tem mais volume.
  // percentualResolucao null = cliente sem nenhum chamado concluído ou aberto (só "Aguardando
  // Aprovação") — não dá pra ranquear como melhor nem pior sem nenhum dado avaliável.
  const porCliente = detalhe?.porCliente ?? [];
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
          <SubTabs
            options={[
              { value: GERAL, label: "Geral", count: state.payload.indicadores.volume.total },
              ...TIPOS.map((tipo) => ({ value: tipo, label: tipo, count: contagemPorTipo[tipo] ?? 0 })),
            ]}
            active={tipoAtivo}
            onChange={setTipoAtivo}
          />

          <section className="stat-grid">
            <StatTile
              label={`Total no período${tipoAtivo === GERAL ? "" : ` (${tipoAtivo})`}`}
              value={detalhe.volume.total}
              onClick={() => drill.abrirLista(filtroBase, `Total no período${tipoAtivo === GERAL ? "" : ` — ${tipoAtivo}`}`, fetchDashboardChamados)}
            />
            <StatTile
              label="Em aberto"
              value={detalhe.volume.abertos}
              onClick={() => drill.abrirLista({ ...filtroBase, situacaoVolume: "aberto" }, "Em aberto", fetchDashboardChamados)}
            />
            <StatTile
              label="Finalizados"
              value={detalhe.volume.fechados}
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
            operadores={detalhe.operadores}
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
                  <p className="subtitle">Volume ao longo do período selecionado — clique num ponto pra ver os chamados</p>
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
              <VolumeTrendChart
                data={detalhe.volume.porDia}
                granularidade={granularidade}
                onSelecionarPeriodo={(label) => {
                  const { dataInicio, dataFim, titulo } = periodoDoPontoDaSerie(label, granularidade);
                  drill.abrirLista({ ...filtroBase, dataInicio, dataFim }, titulo, fetchDashboardChamados);
                }}
              />
            </div>

            <div className="panel">
              <h2>Aberto x Finalizado</h2>
              <p className="subtitle">Proporção dos chamados do período</p>
              <DonutChart
                data={[
                  { label: "Em aberto", total: detalhe.volume.abertos },
                  { label: "Finalizados", total: detalhe.volume.fechados },
                ]}
                height={220}
              />
            </div>

            <MaximizableChart
              title="Chamados por status"
              subtitle="Distribuição atual por situação — clique numa barra"
              data={detalhe.volume.porStatus}
              color="var(--series-1)"
              filtroBase={filtroBase}
              dimensaoFiltro="status"
              fetcher={fetchDashboardChamados}
            />

            <div className="panel">
              <h2>Chamados por área</h2>
              <p className="subtitle">Engenharia x Manutenção — clique numa barra</p>
              <ChamadosPorAreaChart
                data={detalhe.areas}
                onBarClick={(area) => drill.abrirLista({ ...filtroBase, area }, area, fetchDashboardChamados)}
              />
            </div>

            {tipoAtivo === GERAL && (
              <CausaPanel carregar={() => fetchIndicadoresCausas(filtroBase)} filtroBase={filtroBase} />
            )}

            <RankedClientePanel
              title="Clientes com melhor % de resolução"
              subtitle={`Top 10${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} no período (mínimo 3 chamados) — clique pra ver todos e abrir os chamados`}
              data={melhorResolucaoClienteData}
              color="var(--status-good)"
              filtroBase={filtroBase}
              formatValue={formatPct}
              ordemInicial="desc"
              fetcher={fetchDashboardChamados}
            />

            <RankedClientePanel
              title="Clientes com pior % de resolução"
              subtitle={`Top 10${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} no período (mínimo 3 chamados) — clique pra ver todos e abrir os chamados`}
              data={piorResolucaoClienteData}
              color="var(--status-critical)"
              filtroBase={filtroBase}
              formatValue={formatPct}
              ordemInicial="asc"
              fetcher={fetchDashboardChamados}
            />
          </section>
        </>
      )}
    </div>
  );
}
