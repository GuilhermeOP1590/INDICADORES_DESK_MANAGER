import { useMemo, useState } from "react";
import { fetchTendenciaMensalCausa } from "../api.js";
import { MonthlyBarChart } from "./MonthlyBarChart.jsx";
import { DateFilterBar } from "./DateFilterBar.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { periodoMesFiscal, periodoDoPontoDaSerie } from "../lib/datas.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Mesma paleta do DonutChart — 8 cores dá conta das causas mais comuns (na prática 4-6 por
// período); com mais de 8 causas a cor recicla, mas o essencial (comparar as top causas mês a
// mês) continua legível.
const PALETA = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

// Empilhado por mês (uma cor por causa) em vez de "escolha 1 causa no dropdown" — dá pra
// comparar todas as causas E ver a evolução mês a mês na mesma imagem, sem precisar trocar de
// seleção pra notar que uma causa está crescendo enquanto outra cai.
export function TendenciaMensalCausa({ especialidade }) {
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [state, setState] = useState({ status: "idle", payload: null, error: null });
  const drill = useDrillDown();

  async function calcular() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchTendenciaMensalCausa({ ...periodo, especialidade });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  // Ordena as causas por valor total do período (maior primeiro) — tanto a ordem das séries
  // empilhadas (a mais relevante fica na base, mais fácil de comparar entre meses) quanto a
  // ordem da legenda seguem essa relevância, em vez da ordem alfabética que o backend devolve.
  const causasPorRelevancia = useMemo(() => {
    if (!state.payload) return [];
    const totalPorCausa = new Map(state.payload.causas.map((c) => [c, 0]));
    for (const m of state.payload.porMes) {
      totalPorCausa.set(m.causa, (totalPorCausa.get(m.causa) ?? 0) + m.valor);
    }
    return [...state.payload.causas].sort((a, b) => (totalPorCausa.get(b) ?? 0) - (totalPorCausa.get(a) ?? 0));
  }, [state.payload]);

  const dadosPorMes = useMemo(() => {
    if (!state.payload) return [];
    const porMesMap = new Map();
    for (const m of state.payload.porMes) {
      const linha = porMesMap.get(m.mes) ?? { mes: m.mes };
      linha[m.causa] = m.valor;
      porMesMap.set(m.mes, linha);
    }
    return [...porMesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [state.payload]);

  const series = useMemo(
    () => causasPorRelevancia.map((causa, index) => ({ dataKey: causa, name: causa, color: PALETA[index % PALETA.length] })),
    [causasPorRelevancia]
  );

  function abrirMes(mes, causa) {
    const { dataInicio, dataFim, titulo } = periodoDoPontoDaSerie(mes, "mes");
    drill.abrirLista({ causa, statusAprovacao: "avaliado", dataInicio, dataFim }, `${titulo} — ${causa}`);
  }

  return (
    <div className="panel full-width">
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Valor aprovado por mês, por causa</h2>
          <p className="subtitle">
            Cada cor é uma causa, empilhada por mês — busca o histórico de cada chamado do período, pode levar um tempo.
            Clique num segmento pra ver os chamados daquele mês/causa.
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
            <span className="meta">{state.payload.totalAvaliados} chamados avaliados no período</span>
          </div>

          <MonthlyBarChart data={dadosPorMes} series={series} formatValue={formatBRL} onBarClick={abrirMes} stacked height={320} />
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
