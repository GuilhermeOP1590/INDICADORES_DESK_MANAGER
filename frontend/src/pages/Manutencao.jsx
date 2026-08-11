import { useEffect, useState } from "react";
import { fetchManutencao } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { HorizontalBarChart } from "../components/HorizontalBarChart.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";
import { SubTabs } from "../components/SubTabs.jsx";

const TIPOS = ["Preventiva", "Corretiva", "Rotina", "Outros/Não classificado"];
const COR_POR_TIPO = {
  Preventiva: "var(--series-3)",
  Corretiva: "var(--series-2)",
  Rotina: "var(--series-1)",
  "Outros/Não classificado": "var(--series-4)",
};

export default function Manutencao() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [tipoAtivo, setTipoAtivo] = useState("Corretiva");

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchManutencao({ forceRefresh });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const contagemPorTipo = Object.fromEntries((state.payload?.porTipo ?? []).map((t) => [t.label, t.total]));
  const detalhe = state.payload?.porTipoDetalhe?.[tipoAtivo];

  return (
    <div>
      <div className="page-toolbar">
        <div className="meta">{state.payload && `${state.payload.total} chamados de Manutenção no total`}</div>
        <button className="refresh-btn" onClick={() => load(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao carregar indicadores de Manutenção: {state.error}</div>}

      {state.payload && (
        <>
          <SubTabs
            options={TIPOS.map((tipo) => ({ value: tipo, label: tipo, count: contagemPorTipo[tipo] ?? 0 }))}
            active={tipoAtivo}
            onChange={setTipoAtivo}
          />

          {tipoAtivo === "Outros/Não classificado" && (
            <div className="state-banner warning">
              Chamados de "Manutenção - Equipamentos" que não são claramente um equipamento (Segurança, Sesmt, Transporte, testes) —
              revisar depois se algum desses precisa de classificação própria.
            </div>
          )}

          {detalhe && (
            <>
              <section className="stat-grid">
                <StatTile label={`Chamados (${tipoAtivo})`} value={detalhe.total} />
              </section>

              <section className="panel-grid">
                <div className="panel">
                  <h2>Por equipamento</h2>
                  <p className="subtitle">Ranking de equipamentos por volume — {tipoAtivo}</p>
                  <HorizontalBarChart data={detalhe.porEquipamento} color={COR_POR_TIPO[tipoAtivo]} limit={10} />
                </div>

                <div className="panel">
                  <h2>Por cliente</h2>
                  <p className="subtitle">Ranking de lojas/unidades — {tipoAtivo}</p>
                  <HorizontalBarChart data={detalhe.porCliente} color={COR_POR_TIPO[tipoAtivo]} limit={10} />
                </div>

                <div className="panel full-width">
                  <h2>Por operador</h2>
                  <p className="subtitle">Todos os operadores que atenderam chamados de {tipoAtivo}</p>
                  <OperadoresTable data={detalhe.operadores} />
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
