import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

export function MaximizableChart({ title, subtitle, data, color, limit = 8, filtroBase, dimensaoFiltro }) {
  const drill = useDrillDown();

  return (
    <div className="panel maximizable" onClick={() => !drill.pilha && drill.abrir()}>
      <div className="panel-header-row">
        <div>
          <h2>{title}</h2>
          <p className="subtitle">{subtitle}</p>
        </div>
        <span className="expand-hint">⤢</span>
      </div>
      <HorizontalBarChart data={data} color={color} limit={limit} height={220} />

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? title} onClose={drill.fechar} onBack={drill.pilha.length > 0 ? drill.voltar : undefined}>
          {!drill.topo && (
            <HorizontalBarChart
              data={data}
              color={color}
              limit={30}
              height={Math.max(320, Math.min(data.length, 31) * 26)}
              onBarClick={(label) => drill.abrirLista({ ...filtroBase, [dimensaoFiltro]: label }, label)}
            />
          )}
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} />
        </Modal>
      )}
    </div>
  );
}
