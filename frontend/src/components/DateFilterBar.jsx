import { useState } from "react";
import { periodoHoje, periodoOntem, periodoSemanaPassada, nomeMesFiscal, nomeMesCalendario } from "../lib/datas.js";
import { useMesesFiscaisDisponiveis } from "../lib/useMesesFiscaisDisponiveis.js";
import { useMesesCalendarioDisponiveis } from "../lib/useMesesCalendarioDisponiveis.js";

const PRESETS = [
  { key: "hoje", label: "Hoje", calcular: periodoHoje },
  { key: "ontem", label: "Ontem", calcular: periodoOntem },
  { key: "semana", label: "Semana passada", calcular: periodoSemanaPassada },
  { key: "personalizado", label: "Personalizado", calcular: null },
];

export function DateFilterBar({ periodo, onChange, modo = "criacao" }) {
  const [presetAtivo, setPresetAtivo] = useState("mes");
  const mesesFiscais = useMesesFiscaisDisponiveis();
  const mesesCalendario = useMesesCalendarioDisponiveis();
  const ehFiscal = modo === "criacao";
  const meses = ehFiscal ? mesesFiscais : mesesCalendario;
  const nomeMes = ehFiscal ? nomeMesFiscal : nomeMesCalendario;

  function selecionarPreset(preset) {
    setPresetAtivo(preset.key);
    if (preset.calcular) {
      onChange(preset.calcular());
    }
  }

  function selecionarMes(e) {
    const mes = meses.find((m) => m.label === e.target.value);
    if (!mes) return;
    setPresetAtivo("mes");
    onChange({ dataInicio: mes.dataInicio, dataFim: mes.dataFim });
  }

  return (
    <div className="date-filter-bar">
      <select
        className={`date-filter-select ${presetAtivo === "mes" ? "active" : ""}`}
        value={presetAtivo === "mes" ? nomeMes(periodo) : ""}
        onChange={selecionarMes}
      >
        <option value="" disabled>
          {ehFiscal ? "Mês fiscal (26 a 25)" : "Mês (01 ao fim)"}
        </option>
        {meses.map((mes) => (
          <option key={mes.label} value={mes.label}>
            {mes.label}
          </option>
        ))}
      </select>
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
          <input type="date" value={periodo.dataInicio ?? ""} onChange={(e) => onChange({ ...periodo, dataInicio: e.target.value })} />
          <span>até</span>
          <input type="date" value={periodo.dataFim ?? ""} onChange={(e) => onChange({ ...periodo, dataFim: e.target.value })} />
        </span>
      )}
    </div>
  );
}
