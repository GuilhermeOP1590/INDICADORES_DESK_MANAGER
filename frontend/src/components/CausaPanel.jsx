import { useState } from "react";
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

// A causa só existe na thread de interações de cada chamado — não vem na listagem em massa.
// Buscar isso é 1 chamada de rede por chamado, então é sob demanda (botão), não automático.
export function CausaPanel({ carregar, filtroBase, onCarregado }) {
  const [state, setState] = useState({ status: "idle", porCausa: null, error: null });
  const drill = useDrillDown();

  async function handleCarregar() {
    setState({ status: "loading", porCausa: null, error: null });
    try {
      const resultado = await carregar();
      setState({ status: "ready", porCausa: resultado.porCausa, error: null });
      onCarregado?.(resultado);
    } catch (error) {
      setState({ status: "error", porCausa: null, error: error.message });
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <div>
          <h2>Por causa</h2>
          <p className="subtitle">Causa registrada na última interação de cada chamado — clique numa barra</p>
        </div>
        {state.status !== "idle" && (
          <button className="refresh-btn" onClick={handleCarregar} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Carregando..." : "Recarregar"}
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <button className="refresh-btn" onClick={handleCarregar}>
          Carregar causas
        </button>
      )}

      {state.status === "loading" && (
        <p className="subtitle">Buscando a causa de cada chamado no período — pode levar até 1 minuto em períodos grandes...</p>
      )}
      {state.status === "error" && <div className="state-banner error">Erro ao carregar causas: {state.error}</div>}

      {state.status === "ready" && (
        <div onClick={() => !drill.pilha && drill.abrir()} style={{ cursor: "pointer" }}>
          <HorizontalBarChart data={state.porCausa} color="var(--series-5)" limit={8} height={220} />
        </div>
      )}

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? "Por causa"} onClose={drill.fechar} onBack={drill.pilha.length > 0 ? drill.voltar : undefined}>
          {!drill.topo && (
            <HorizontalBarChart
              data={state.porCausa}
              color="var(--series-5)"
              limit={30}
              height={Math.max(320, Math.min(state.porCausa.length, 31) * 26)}
              onBarClick={(label, agregado) => {
                if (agregado) {
                  const foraDoTopo = state.porCausa.slice(0, 30).map((c) => c.label);
                  drill.abrirLista({ ...filtroBase, dimensao: "causa", foraDoTopo: foraDoTopo.join("|") }, "Outros (agregado)");
                } else {
                  drill.abrirLista({ ...filtroBase, causa: label }, label);
                }
              }}
            />
          )}
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}
    </div>
  );
}
