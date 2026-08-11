export function StatTile({ label, value, statusClass }) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className={`value ${statusClass || ""}`}>{value}</div>
    </div>
  );
}
