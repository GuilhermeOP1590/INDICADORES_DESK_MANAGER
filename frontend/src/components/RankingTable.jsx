import { useMemo, useState } from "react";
import { useSort } from "../lib/useSort.js";
import { SortableTh } from "./SortableTh.jsx";

// Alternativa a dezenas de barras finas e ilegíveis (ver HorizontalBarChart) quando a
// categoria tem muitas entradas — busca + ordenação por coluna dá uma forma precisa de
// achar/comparar um item específico, sem depender de escanear uma parede de barras.
export function RankingTable({
  data,
  formatValue,
  onSelecionar,
  nomeColuna = "Nome",
  nomeValor = "Total",
  ordemInicial = "desc",
  colunasExtras = [],
}) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return data;
    return data.filter((d) => {
      if (d.label.toLowerCase().includes(termo)) return true;
      return colunasExtras.some((col) => (col.valorBusca ? String(col.valorBusca(d)).toLowerCase().includes(termo) : false));
    });
  }, [data, busca, colunasExtras]);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtrados, "total", ordemInicial);

  return (
    <div>
      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder={`Buscar ${nomeColuna.toLowerCase()}...`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <span className="meta">
          {filtrados.length} de {data.length}
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <SortableTh label={nomeColuna} sortKeyName="label" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            {colunasExtras.map((col) =>
              col.sortKeyName ? (
                <SortableTh
                  key={col.header}
                  label={col.header}
                  sortKeyName={col.sortKeyName}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              ) : (
                <th key={col.header}>{col.header}</th>
              )
            )}
            <SortableTh label={nomeValor} sortKeyName="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.label} className="clickable-row" onClick={() => onSelecionar?.(d.label, Boolean(d.agregado), d)}>
              <td>{d.label}</td>
              {colunasExtras.map((col) => (
                <td key={col.header}>{col.render(d)}</td>
              ))}
              <td className="num">{formatValue ? formatValue(d.total) : d.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
