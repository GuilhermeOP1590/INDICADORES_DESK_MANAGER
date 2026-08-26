import { useEffect, useState } from "react";
import { fetchIndicadores, fetchIndicadoresCausas, fetchDashboardChamados, fetchSlaNivelDetalheDashboard } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { SlaNiveisPanel } from "../components/SlaNiveisPanel.jsx";
import { ClientePerformancePanel } from "../components/ClientePerformancePanel.jsx";
import { VolumeTrendChart } from "../components/VolumeTrendChart.jsx";
import { MaximizableChart } from "../components/MaximizableChart.jsx";
import { ChamadosPorAreaChart } from "../components/ChamadosPorAreaChart.jsx";
import { RankedClientePanel } from "../components/RankedClientePanel.jsx";
import { CausaPanel } from "../components/CausaPanel.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { UfSelect } from "../components/UfSelect.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { useUfsDisponiveis } from "../lib/useUfsDisponiveis.js";
import { useDebouncedValue } from "../lib/useDebouncedValue.js";
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
  const [buscaInput, setBuscaInput] = useState("");
  const busca = useDebouncedValue(buscaInput);
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
  const porUf = detalhe?.porUf ?? [];
  const clientesComAmostra = porCliente.filter(
    (c) => c.cliente !== "Não informado" && c.total >= 3 && c.percentualResolucao !== null
  );
  // `total` é o valor da barra (o percentual); os números brutos vão em campos próprios pra
  // aparecerem como colunas na tabela do modal — sem eles um "100%" de 3 chamados fica
  // indistinguível de um "100%" de 300.
  const paraLinhaResolucao = (c) => ({
    label: c.cliente,
    total: c.percentualResolucao,
    chamadosTotal: c.total,
    concluidos: c.concluidos,
    abertos: c.abertos,
  });
  const melhorResolucaoClienteData = [...clientesComAmostra]
    .sort((a, b) => (b.percentualResolucao ?? 0) - (a.percentualResolucao ?? 0))
    .map(paraLinhaResolucao);
  const piorResolucaoClienteData = [...clientesComAmostra]
    .sort((a, b) => (a.percentualResolucao ?? 0) - (b.percentualResolucao ?? 0))
    .map(paraLinhaResolucao);

  const COLUNAS_RESOLUCAO = [
    { header: "Total", render: (d) => d.chamadosTotal, sortKeyName: "chamadosTotal" },
    { header: "Concluídos", render: (d) => d.concluidos, sortKeyName: "concluidos" },
    { header: "Em aberto", render: (d) => d.abertos, sortKeyName: "abertos" },
  ];

  // Corretiva é o tipo que gera cobrança de loja (quebra, falha, retrabalho) — esses dois
  // rankings ficam fixos em Corretiva mesmo quando a aba ativa é "Geral", em vez de seguir
  // `detalhe`, senão o painel mudaria de significado a cada aba.
  const porClienteCorretiva = (state.payload?.indicadores.porTipoDetalhe?.["Corretiva"]?.porCliente ?? []).filter(
    (c) => c.cliente !== "Não informado"
  );
  const filtroCorretiva = { ...periodo, q: busca || undefined, uf: uf || undefined, tipo: "Corretiva" };

  const corretivaVolumeData = [...porClienteCorretiva]
    .sort((a, b) => b.total - a.total)
    .map((c) => ({
      label: c.cliente,
      total: c.total,
      abertos: c.abertos,
      concluidos: c.concluidos,
      diasMaisAntigoAberto: c.diasMaisAntigoAberto,
    }));

  const corretivaAbertosData = porClienteCorretiva
    .filter((c) => c.abertos > 0)
    .sort((a, b) => b.abertos - a.abertos)
    .map((c) => ({
      label: c.cliente,
      total: c.abertos,
      chamadosTotal: c.total,
      concluidos: c.concluidos,
      diasMaisAntigoAberto: c.diasMaisAntigoAberto,
    }));

  // O backlog só vira ação quando se sabe há quanto tempo o chamado mais antigo está parado:
  // "3 abertos há 60 dias" é bem mais grave que "10 abertos ontem". Fica em coluna própria
  // (e não na barra) porque a barra continua sendo contagem de chamados.
  const COLUNA_AGING = {
    header: "Aberto há (dias)",
    render: (d) => (d.diasMaisAntigoAberto === null || d.diasMaisAntigoAberto === undefined ? "—" : d.diasMaisAntigoAberto),
    sortKeyName: "diasMaisAntigoAberto",
  };

  const COLUNAS_CORRETIVA_VOLUME = [
    { header: "Em aberto", render: (d) => d.abertos, sortKeyName: "abertos" },
    { header: "Concluídos", render: (d) => d.concluidos, sortKeyName: "concluidos" },
    COLUNA_AGING,
  ];
  const COLUNAS_CORRETIVA_ABERTOS = [
    { header: "Total corretivas", render: (d) => d.chamadosTotal, sortKeyName: "chamadosTotal" },
    { header: "Concluídos", render: (d) => d.concluidos, sortKeyName: "concluidos" },
    COLUNA_AGING,
  ];

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
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
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

          <SlaNiveisPanel
            porNivel={detalhe?.porNivel}
            onSelecionarNivel={(nivel, label) =>
              drill.abrirNivelDetalhe({ ...filtroBase, nivel }, `SLA nível ${nivel} — ${label}`, fetchSlaNivelDetalheDashboard)
            }
          />

          <ClientePerformancePanel
            porCliente={porCliente}
            porUf={porUf}
            onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período", fetchDashboardChamados)}
            onAbrirCliente={(cliente) => drill.abrirLista({ ...filtroBase, cliente }, cliente, fetchDashboardChamados)}
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

            <MaximizableChart
              title="Chamados por status"
              subtitle="Distribuição atual por situação — clique numa barra"
              data={detalhe.volume.porStatus}
              color="var(--series-1)"
              limit={10}
              filtroBase={filtroBase}
              dimensaoFiltro="status"
              fetcher={fetchDashboardChamados}
              fullWidth
              previewHeight={320}
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

            {(tipoAtivo === GERAL || tipoAtivo === "Corretiva") && (
              <>
                <RankedClientePanel
                  title="Lojas que mais abrem chamados corretivos"
                  subtitle="Top 10 no período — clique pra ver todas as lojas e abrir os chamados"
                  data={corretivaVolumeData}
                  color="var(--series-1)"
                  filtroBase={filtroCorretiva}
                  ordemInicial="desc"
                  fetcher={fetchDashboardChamados}
                  colunasExtras={COLUNAS_CORRETIVA_VOLUME}
                  nomeValor="Corretivas"
                />

                <RankedClientePanel
                  title="Lojas com mais chamados corretivos em aberto"
                  subtitle="Top 10 no período — backlog de corretiva por loja; clique pra ver todas e abrir os chamados"
                  data={corretivaAbertosData}
                  color="var(--status-critical)"
                  filtroBase={{ ...filtroCorretiva, situacaoVolume: "aberto" }}
                  ordemInicial="desc"
                  fetcher={fetchDashboardChamados}
                  colunasExtras={COLUNAS_CORRETIVA_ABERTOS}
                  nomeValor="Em aberto"
                />
              </>
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
              colunasExtras={COLUNAS_RESOLUCAO}
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
              colunasExtras={COLUNAS_RESOLUCAO}
            />
          </section>
        </>
      )}
    </div>
  );
}
