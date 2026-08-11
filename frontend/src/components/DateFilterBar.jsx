import { useState } from "react";
import { periodoHoje, periodoOntem, periodoSemanaPassada, periodoMesFiscal } from "../lib/datas.js";

const PRESETS = [
  { key: "hoje", label: "Hoje", calcular: periodoHoje },
  { key: "ontem", label: "Ontem", calcular: periodoOntem },
  { key: "semana", label: "Semana passada", calcular: periodoSemanaPassada },
  { key: "mes", label: "Mês (26 a 25)", calcular: periodoMesFiscal },
  { key: "personalizado", label: "Personalizado", calcular: null },
];

export function DateFilterBar({ periodo, onChange }) {
  const [presetAtivo, setPresetAtivo] = useState("mes");

  function selecionarPreset(preset) {
    setPresetAtivo(preset.key);
    if (preset.calcular) {
      onChange(preset.calcular());
    }
  }

  return (
    <div className="date-filter-bar">
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          className={`date-filter-btn ${presetAtivo === preset.key ? "active" : ""}`}
          onClick={() => selecionarPreset(preset)}
        >
          {preset.label}
        </button>
      ))}
      {presetAtivo === "personalizado" && (
        <span className="date-filter-custom">
          <input
            type="date"
            value={periodo.dataInicio ?? ""}
            onChange={(e) => onChange({ ...periodo, dataInicio: e.target.value })}
          />
          <span>até</span>
          <input type="date" value={periodo.dataFim ?? ""} onChange={(e) => onChange({ ...periodo, dataFim: e.target.value })} />
        </span>
      )}
    </div>
  );
}
