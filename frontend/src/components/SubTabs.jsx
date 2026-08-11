export function SubTabs({ options, active, onChange }) {
  return (
    <div className="sub-tabs">
      {options.map((option) => (
        <button
          key={option.value}
          className={`sub-tab ${option.value === active ? "active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="sub-tab-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
