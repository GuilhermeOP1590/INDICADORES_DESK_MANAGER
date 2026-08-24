import { useMemo, useState } from "react";
import { fetchTendenciaMensalCausa } from "../api.js";
import { MonthlyBarChart } from "./MonthlyBarChart.jsx";
import { DateFilterBar } from "./DateFilterBar.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { periodoMesFiscal, periodoDoPontoDaSerie } from "../lib/datas.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TendenciaMensalCausa({ especialidade }) {
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [state, setState] = useState({ status: "idle", payload: null, error: null });
  const [causaSelecionada, setCausaSelecionada] = useState("");
  const drill = useDrillDown();

  async function calcular() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchTendenciaMensalCausa({ ...periodo, especialidade });
      const maiorCausa = [...payload.causas]
        .map((causa) => ({ causa, total: payload.porMes.filter((m) => m.causa === causa).reduce((s, m) => s + m.valor, 0) }))
        .sort((a, b) => b.total - a.total)[0]?.causa;
      setState({ status: "ready", payload, error: null });
      setCausaSelecionada(maiorCausa ?? "");
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  const dadosDaCausa = useMemo(() => {
    if (!state.payload || !causaSelecionada) return [];
    return state.payload.porMes
      .filter((m) => m.causa === causaSelecionada)
      .map((m) => ({ mes: m.mes, valor: m.valor, total: m.total }));
  }, [state.payload, causaSelecionada]);

  function abrirMes(mes) {
    const { dataInicio, dataFim, titulo } = periodoDoPontoDaSerie(mes, "mes");
    drill.abrirLista(
      { causa: causaSelecionada, statusAprovacao: "avaliado", dataInicio, dataFim },
      `${titulo} — ${causaSelecionada}`
    );
  }

  return (
    <div className="panel full-width">
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Valor aprovado por mês, por causa</h2>
          <p className="subtitle">
            Escolha uma causa e veja a evolução mês a mês do valor aprovado — busca o histórico de cada
            chamado do período, pode levar um tempo.
          </p>
        </div>
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={calcular} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Calculando..." : "Calcular"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao calcular: {state.error}</div>}

      {state.payload && state.payload.causas.length === 0 && (
        <p className="subtitle">Nenhum chamado avaliado com causa registrada nesse período.</p>
      )}

      {state.payload && state.payload.causas.length > 0 && (
        <>
          <div className="filter-bar">
            <select value={causaSelecionada} onChange={(e) => setCausaSelecionada(e.target.value)}>
              {state.payload.causas.map((causa) => (
                <option key={causa} value={causa}>
                  {causa}
                </option>
              ))}
            </select>
            <span className="meta">{state.payload.totalAvaliados} chamados avaliados no período</span>
          </div>

          {dadosDaCausa.length === 0 ? (
            <p className="subtitle">Nenhum valor aprovado pra essa causa nesse período.</p>
          ) : (
            <MonthlyBarChart
              data={dadosDaCausa}
              series={[{ dataKey: "valor", name: causaSelecionada, color: "var(--series-5)" }]}
              formatValue={formatBRL}
              onBarClick={abrirMes}
            />
          )}
        </>
      )}

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}
    </div>
  );
}
