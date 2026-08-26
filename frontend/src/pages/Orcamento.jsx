import { useEffect, useState } from "react";
import { fetchOrcamento, fetchOrcamentoResumoRapido } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { DonutChart } from "../components/DonutChart.jsx";
import { MaximizableChart } from "../components/MaximizableChart.jsx";
import { RegiaoOrcamentoPanel } from "../components/RegiaoOrcamentoPanel.jsx";
import { HistoricoAprovacoesTable } from "../components/HistoricoAprovacoesTable.jsx";
import { TendenciaMensalCausa } from "../components/TendenciaMensalCausa.jsx";
import { ComparacaoOrcamento } from "../components/ComparacaoOrcamento.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { UfSelect } from "../components/UfSelect.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { useUfsDisponiveis } from "../lib/useUfsDisponiveis.js";
import { useDebouncedValue } from "../lib/useDebouncedValue.js";
import { periodoMesFiscal, deslocarMeses, formatBR } from "../lib/datas.js";

const ABAS = [
  { value: "Geral", label: "Geral" },
  { value: "Manutenção", label: "Manutenção" },
  { value: "Engenharia", label: "Engenharia" },
];

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function labelPeriodo(periodo) {
  return `${formatBR(periodo.dataInicio)} a ${formatBR(periodo.dataFim)}`;
}

export default function Orcamento() {
  const [aba, setAba] = useState("Geral");
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [buscaInput, setBuscaInput] = useState("");
  const busca = useDebouncedValue(buscaInput);
  const [uf, setUf] = useState("");
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [resumoRapido, setResumoRapido] = useState({ status: "idle", dados: null, error: null });
  const drill = useDrillDown();
  const ufsDisponiveis = useUfsDisponiveis();

  const [comparando, setComparando] = useState(false);
  const [periodoComparacao, setPeriodoComparacao] = useState(deslocarMeses(periodoMesFiscal(), -1));
  const [comparacao, setComparacao] = useState({ status: "idle", payload: null, error: null });

  async function carregarResumoRapido(forceRefresh = false) {
    setResumoRapido((s) => ({ ...s, status: "loading" }));
    try {
      const dados = await fetchOrcamentoResumoRapido({
        forceRefresh,
        especialidade: aba,
        ...periodo,
        q: busca || undefined,
        uf: uf || undefined,
      });
      setResumoRapido({ status: "ready", dados, error: null });
    } catch (error) {
      setResumoRapido({ status: "error", dados: null, error: error.message });
    }
  }

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchOrcamento({ forceRefresh, especialidade: aba, ...periodo, q: busca || undefined, uf: uf || undefined });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    carregarResumoRapido();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, periodo.dataInicio, periodo.dataFim, busca, uf]);

  useEffect(() => {
    if (!comparando) return;
    let cancelado = false;
    setComparacao((c) => ({ ...c, status: "loading" }));
    fetchOrcamento({ especialidade: aba, ...periodoComparacao, q: busca || undefined, uf: uf || undefined })
      .then((payload) => {
        if (!cancelado) setComparacao({ status: "ready", payload, error: null });
      })
      .catch((error) => {
        if (!cancelado) setComparacao({ status: "error", payload: null, error: error.message });
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparando, aba, periodoComparacao.dataInicio, periodoComparacao.dataFim, busca, uf]);

  const filtroBase = {
    ...(aba !== "Geral" ? { especialidade: aba } : {}),
    ...periodo,
    q: busca || undefined,
    uf: uf || undefined,
  };

  const payload = state.payload;
  const donutData =
    payload && payload.aguardando.valor + payload.avaliados.valor > 0
      ? [
          { label: "Aguardando Aprovação", total: payload.aguardando.valor },
          { label: "Aprovados", total: payload.avaliados.valor },
        ]
      : null;

  const porCausaData = payload?.porCausa.map((c) => ({ label: c.label, total: c.valor })) ?? [];
  const porTipoData = payload?.porTipo.map((t) => ({ label: t.tipo, total: t.aguardandoValor + t.avaliadosValor })) ?? [];

  return (
    <div>
      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button
          className="refresh-btn"
          onClick={() => {
            carregarResumoRapido(true);
            load(true);
          }}
          disabled={state.status === "loading"}
        >
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
        <button className="refresh-btn" onClick={() => setComparando((c) => !c)}>
          {comparando ? "Fechar comparação" : "Comparar com outro período"}
        </button>
      </div>

      {comparando && (
        <div className="filter-bar">
          <span className="meta">Comparar {labelPeriodo(periodo)} com:</span>
          <DateFilterBar periodo={periodoComparacao} onChange={setPeriodoComparacao} />
        </div>
      )}

      <SubTabs options={ABAS} active={aba} onChange={setAba} />

      {resumoRapido.dados && (
        <div className="meta" style={{ marginBottom: 12 }}>
          {resumoRapido.dados.totalChamados} chamados no período ({aba}) — {resumoRapido.dados.aguardandoTotal} aguardando
          aprovação
        </div>
      )}

      {state.status === "loading" && (
        <p className="subtitle">
          Calculando valores aprovados — busca a causa e o valor de aprovação de cada chamado, pode levar até 1 minuto em
          períodos grandes...
        </p>
      )}

      {state.status === "error" && <div className="state-banner error">Erro ao carregar orçamento: {state.error}</div>}

      {payload && (
        <>
          <section className="stat-grid">
            <StatTile
              label="Aguardando Aprovação"
              value={payload.aguardando.total}
              statusClass="status-warning"
              meta={formatBRL(payload.aguardando.valor)}
              onClick={() => drill.abrirLista({ ...filtroBase, statusAprovacao: "aguardando" }, "Aguardando Aprovação")}
            />
            <StatTile
              label="Aprovados"
              value={payload.avaliados.total}
              meta={formatBRL(payload.avaliados.valor)}
              onClick={() => drill.abrirLista({ ...filtroBase, statusAprovacao: "avaliado" }, "Aprovados")}
            />
            <StatTile
              label="Reprovados"
              value={payload.reprovados.total}
              statusClass={payload.reprovados.total > 0 ? "status-critical" : undefined}
              meta={formatBRL(payload.reprovados.valor)}
              onClick={() => drill.abrirLista({ ...filtroBase, statusAprovacao: "reprovado" }, "Reprovados")}
            />
            <StatTile
              label="Total em orçamento"
              value={formatBRL(payload.aguardando.valor + payload.avaliados.valor)}
              meta={`${payload.aguardando.total + payload.avaliados.total} chamados com valor registrado — não inclui reprovados`}
            />
          </section>

          {drill.pilha !== null && (
            <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
              <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
            </Modal>
          )}

          {comparando && (
            <>
              {comparacao.status === "loading" && <p className="subtitle">Calculando período de comparação...</p>}
              {comparacao.status === "error" && (
                <div className="state-banner error">Erro ao carregar comparação: {comparacao.error}</div>
              )}
              {comparacao.status === "ready" && (
                <ComparacaoOrcamento
                  atual={payload}
                  anterior={comparacao.payload}
                  labelAtual={labelPeriodo(periodo)}
                  labelAnterior={labelPeriodo(periodoComparacao)}
                />
              )}
            </>
          )}

          <RegiaoOrcamentoPanel porUf={payload.porUf} porCliente={payload.porCliente} filtroBase={filtroBase} />

          <section className="panel-grid">
            <div className="panel">
              <h2>Aguardando x Já avaliados</h2>
              <p className="subtitle">Proporção do valor total em orçamento</p>
              {donutData ? (
                <DonutChart data={donutData} formatValue={formatBRL} />
              ) : (
                <p className="subtitle">Nenhum valor de aprovação registrado nesse período ainda.</p>
              )}
            </div>

            {porCausaData.length > 0 && (
              <MaximizableChart
                title="Custo por causa (finalizados)"
                subtitle="Soma do valor aprovado, agrupado pela causa registrada no fechamento — clique numa barra"
                data={porCausaData}
                color="var(--series-5)"
                limit={8}
                filtroBase={{ ...filtroBase, statusAprovacao: "avaliado" }}
                dimensaoFiltro="causa"
                formatValue={formatBRL}
              />
            )}

            {porTipoData.length > 0 && (
              <MaximizableChart
                title="Custo por tipo/atividade"
                subtitle="Manutenção: Preventiva/Corretiva/Rotina/Segurança — Engenharia: Elétrica/Hidráulica/Civil/etc — clique numa barra"
                data={porTipoData}
                color="var(--series-4)"
                limit={8}
                filtroBase={{ ...filtroBase, statusAprovacao: "comOrcamento" }}
                dimensaoFiltro="atividade"
                formatValue={formatBRL}
              />
            )}
          </section>

          <div className="panel full-width">
            <h2>Histórico de aprovações</h2>
            <p className="subtitle">Chamados avaliados, do mais recente pro mais antigo — clique numa linha pra abrir o chamado</p>
            <HistoricoAprovacoesTable dados={payload.historicoAprovacoes} onAbrirChamado={drill.abrirChamado} />
          </div>

          <TendenciaMensalCausa especialidade={aba} />
        </>
      )}
    </div>
  );
}
