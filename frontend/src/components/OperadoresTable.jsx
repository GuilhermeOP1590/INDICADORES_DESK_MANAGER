import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { SortableTh } from "./SortableTh.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { useSort } from "../lib/useSort.js";

export function OperadoresTable({ data, filtroBase }) {
  const drill = useDrillDown();
  const { sorted, sortKey, sortDir, toggleSort } = useSort(data, "total", "desc");

  return (
    <>
      <table>
        <thead>
          <tr>
            <SortableTh label="Operador" sortKeyName="operador" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTh label="Total" sortKeyName="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" />
            <SortableTh label="Abertos" sortKeyName="abertos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" />
            <SortableTh label="Fechados" sortKeyName="fechados" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" />
            <SortableTh
              label="% Resolução"
              sortKeyName="percentualResolucao"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="num"
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((op) => (
            <tr
              key={op.operador}
              className={filtroBase ? "clickable-row" : ""}
              onClick={filtroBase ? () => drill.abrirLista({ ...filtroBase, operador: op.operador }, op.operador) : undefined}
            >
              <td>{op.operador}</td>
              <td className="num">{op.total}</td>
              <td className="num">{op.abertos}</td>
              <td className="num">{op.fechados}</td>
              <td className="num">{Number.isFinite(op.percentualResolucao) ? `${op.percentualResolucao}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}
    </>
  );
}
