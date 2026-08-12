export function StatTile({ label, value, statusClass, meta, onClick }) {
  return (
    <div className={`stat-tile${onClick ? " clickable" : ""}`} onClick={onClick}>
      <div className="label">{label}</div>
      <div className={`value ${statusClass || ""}`}>{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}
