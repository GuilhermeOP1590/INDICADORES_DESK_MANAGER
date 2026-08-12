export function SortableTh({ label, sortKeyName, sortKey, sortDir, onSort, className }) {
  const ativo = sortKeyName === sortKey;
  return (
    <th className={`sortable ${className ?? ""}`} onClick={() => onSort(sortKeyName)}>
      {label}
      <span className="sort-arrow">{ativo ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</span>
    </th>
  );
}
