export function StatTile({ label, value, statusClass, meta, onClick, className }) {
  return (
    <div className={`stat-tile${onClick ? " clickable" : ""}${className ? ` ${className}` : ""}`} onClick={onClick}>
      <div className="label">{label}</div>
      <div className={`value ${statusClass || ""}`}>{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}
