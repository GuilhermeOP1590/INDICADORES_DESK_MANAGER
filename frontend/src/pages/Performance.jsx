import { useEffect, useState } from "react";
import { fetchIndicadores, fetchManutencao, fetchEngenharia } from "../api.js";
import { TeamPerformanceCards } from "../components/TeamPerformanceCards.jsx";
import { RegiaoPerformancePanel } from "../components/RegiaoPerformancePanel.jsx";
import { ClientePerformancePanel } from "../components/ClientePerformancePanel.jsx";
import { ClientesTable } from "../components/ClientesTable.jsx";
import { MaximizableChart } from "../components/MaximizableChart.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { UfSelect } from "../components/UfSelect.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { useUfsDisponiveis } from "../lib/useUfsDisponiveis.js";
import { useDebouncedValue } from "../lib/useDebouncedValue.js";
import { periodoMesFiscal } from "../lib/datas.js";

const ABAS = [
  { value: "Geral", label: "Geral" },
  { value: "Manutenção", label: "Manutenção" },
  { value: "Engenharia", label: "Engenharia" },
];

const FETCH_POR_ABA = {
  Geral: fetchIndicadores,
  Manutenção: fetchManutencao,
  Engenharia: fetchEngenharia,
};

const formatPct = (valor) => `${valor}%`;

function operadoresDoPayload(aba, payload) {
  if (!payload) return [];
  return aba === "Geral" ? payload.indicadores.operadores : payload.geral.operadores;
}

function porUfDoPayload(aba, payload) {
  if (!payload) return [];
  return aba === "Geral" ? payload.indicadores.porUf : payload.geral.porUf;
}

function porClienteDoPayload(aba, payload) {
  if (!payload) return [];
  return aba === "Geral" ? payload.indicadores.porCliente : payload.geral.porClienteDetalhado;
}

export default function Performance() {
  const [aba, setAba] = useState("Geral");
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [buscaInput, setBuscaInput] = useState("");
  const busca = useDebouncedValue(buscaInput);
  const [uf, setUf] = useState("");
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const drill = useDrillDown();
  const ufsDisponiveis = useUfsDisponiveis();

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await FETCH_POR_ABA[aba]({ forceRefresh, ...periodo, q: busca || undefined, uf: uf || undefined });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, periodo.dataInicio, periodo.dataFim, busca, uf]);

  const filtroBase = {
    ...(aba !== "Geral" ? { especialidade: aba } : {}),
    ...periodo,
    q: busca || undefined,
    uf: uf || undefined,
  };

  const operadores = operadoresDoPayload(aba, state.payload);
  const porUf = porUfDoPayload(aba, state.payload);
  const porCliente = porClienteDoPayload(aba, state.payload);
  const comOperador = operadores.filter((op) => op.operador !== "Sem operador");

  const volumeData = comOperador.map((op) => ({ label: op.operador, total: op.total }));
  const resolucaoData = [...comOperador]
    .filter((op) => op.total >= 3 && op.percentualResolucao !== null)
    .sort((a, b) => (b.percentualResolucao ?? 0) - (a.percentualResolucao ?? 0))
    .map((op) => ({ label: op.operador, total: op.percentualResolucao }));

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

      <SubTabs options={ABAS} active={aba} onChange={setAba} />

      {state.status === "error" && (
        <div className="state-banner error">Erro ao carregar performance do time: {state.error}</div>
      )}

      {state.payload && (
        <>
          <div className="meta" style={{ marginBottom: 12 }}>
            {comOperador.length} operadores com chamados no período ({aba})
          </div>

          <TeamPerformanceCards operadores={operadores} />

          <RegiaoPerformancePanel
            porUf={porUf}
            onSelecionarUf={(regiao) => drill.abrirLista({ ...filtroBase, uf: regiao }, `Chamados — ${regiao}`)}
          />

          <ClientePerformancePanel
            porCliente={porCliente}
            onAbrirGeral={() => drill.abrirLista(filtroBase, "Total no período")}
            onAbrirCliente={(cliente) => drill.abrirLista({ ...filtroBase, cliente }, cliente)}
          />

          {drill.pilha !== null && (
            <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
              <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
            </Modal>
          )}

          <section className="panel-grid">
            <MaximizableChart
              title="Volume por operador"
              subtitle="Total de chamados atendidos no período — clique numa barra"
              data={volumeData}
              color="var(--series-1)"
              limit={10}
              filtroBase={filtroBase}
              dimensaoFiltro="operador"
            />

            <MaximizableChart
              title="% de resolução por operador"
              subtitle="Operadores com 3+ chamados no período, do melhor para o pior — clique numa barra"
              data={resolucaoData}
              color="var(--series-3)"
              limit={10}
              filtroBase={filtroBase}
              dimensaoFiltro="operador"
              formatValue={formatPct}
              agregarOutros={false}
            />

            <div className="panel full-width">
              <h2>Ranking completo — operadores</h2>
              <p className="subtitle">Todos os operadores com chamados no período — clique numa linha</p>
              <OperadoresTable data={operadores} filtroBase={filtroBase} />
            </div>

            <div className="panel full-width">
              <h2>Ranking completo — clientes</h2>
              <p className="subtitle">Todos os clientes com chamados no período — clique numa linha</p>
              <ClientesTable data={porCliente} filtroBase={filtroBase} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
