import { useState } from "react";
import { fetchTendenciaMensalManutencao } from "../api.js";
import { MonthlyBarChart } from "./MonthlyBarChart.jsx";
import { DateFilterBar } from "./DateFilterBar.jsx";
import { periodoMesFiscal } from "../lib/datas.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDias = (valor) => `${valor}d`;

export function TendenciaMensalManutencao() {
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [state, setState] = useState({ status: "idle", payload: null, error: null });

  async function calcular() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchTendenciaMensalManutencao(periodo);
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Tendência mensal</h2>
          <p className="subtitle">
            Despesas Preventiva x Corretiva e tempo aguardando peça, mês a mês — busca o histórico
            de cada chamado do período, pode levar um tempo (quanto maior o período, mais demora).
          </p>
        </div>
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={calcular} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Calculando..." : "Calcular"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao calcular: {state.error}</div>}

      {state.payload &&
        (state.payload.tendencia.length === 0 ? (
          <p className="subtitle">Nenhum chamado de Manutenção nesse período.</p>
        ) : (
          <>
            <div className="panel full-width">
              <h2>Despesas por mês</h2>
              <p className="subtitle">Preventiva x Corretiva, somando o valor aprovado de cada chamado</p>
              <MonthlyBarChart
                data={state.payload.tendencia}
                series={[
                  { dataKey: "valorPreventiva", name: "Preventiva", color: "var(--series-3)" },
                  { dataKey: "valorCorretiva", name: "Corretiva", color: "var(--series-2)" },
                ]}
                formatValue={formatBRL}
              />
            </div>

            <div className="panel full-width">
              <h2>Tempo aguardando peça por mês</h2>
              <p className="subtitle">Dias acumulados em "Aguardando Peça do Estoque" + "Peça Enviada para Loja"</p>
              <MonthlyBarChart
                data={state.payload.tendencia}
                series={[{ dataKey: "tempoAguardandoPecaDias", name: "Dias aguardando peça", color: "var(--series-5)" }]}
                formatValue={formatDias}
              />
            </div>
          </>
        ))}
    </div>
  );
}
