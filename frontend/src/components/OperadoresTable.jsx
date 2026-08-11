import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

export function OperadoresTable({ data, filtroBase }) {
  const drill = useDrillDown();

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Operador</th>
            <th className="num">Total</th>
            <th className="num">Abertos</th>
            <th className="num">Fechados</th>
          </tr>
        </thead>
        <tbody>
          {data.map((op) => (
            <tr
              key={op.operador}
              className={filtroBase ? "clickable-row" : ""}
              onClick={filtroBase ? () => drill.abrirLista({ ...filtroBase, operador: op.operador }, op.operador) : undefined}
            >
              <td>{op.operador}</td>
              <td className="num">{op.total}</td>
              <td className="num">{op.abertos}</td>
              <td className="num">{op.fechados}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} />
        </Modal>
      )}
    </>
  );
}
