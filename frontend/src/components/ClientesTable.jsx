import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { SortableTh } from "./SortableTh.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { useSort } from "../lib/useSort.js";

// Espelha OperadoresTable — mesmo racional, só que ranqueando cliente em vez de operador.
export function ClientesTable({ data, filtroBase, fetcher }) {
  const drill = useDrillDown();
  const { sorted, sortKey, sortDir, toggleSort } = useSort(data, "total", "desc");

  return (
    <>
      <table>
        <thead>
          <tr>
            <SortableTh label="Cliente" sortKeyName="cliente" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
          {sorted.map((c) => (
            <tr
              key={c.cliente}
              className={filtroBase ? "clickable-row" : ""}
              onClick={filtroBase ? () => drill.abrirLista({ ...filtroBase, cliente: c.cliente }, c.cliente, fetcher) : undefined}
            >
              <td>{c.cliente}</td>
              <td className="num">{c.total}</td>
              <td className="num">{c.abertos}</td>
              <td className="num">{c.fechados}</td>
              <td className="num">{Number.isFinite(c.percentualResolucao) ? `${c.percentualResolucao}%` : "—"}</td>
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
