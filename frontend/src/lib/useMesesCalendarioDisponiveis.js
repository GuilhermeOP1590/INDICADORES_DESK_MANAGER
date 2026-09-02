import { useEffect, useState } from "react";
import { fetchPeriodosDisponiveis } from "../api.js";
import { listaMesesCalendario } from "./datas.js";

// Só lista meses calendário que têm pelo menos um chamado — mesmo racional de
// useMesesFiscaisDisponiveis, só que pro seletor de mês cheio (modos Aprovação/Inserção).
export function useMesesCalendarioDisponiveis() {
  const [meses, setMeses] = useState(listaMesesCalendario());

  useEffect(() => {
    fetchPeriodosDisponiveis()
      .then(({ dataMinima, dataMaxima }) => {
        if (!dataMinima || !dataMaxima) return;
        setMeses(listaMesesCalendario().filter((mes) => mes.dataInicio <= dataMaxima && mes.dataFim >= dataMinima));
      })
      .catch(() => {});
  }, []);

  return meses;
}
