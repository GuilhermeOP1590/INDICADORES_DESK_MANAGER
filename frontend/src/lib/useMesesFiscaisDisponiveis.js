import { useEffect, useState } from "react";
import { fetchPeriodosDisponiveis } from "../api.js";
import { listaMesesFiscais } from "./datas.js";

// Só lista meses fiscais que têm pelo menos um chamado — sem isso o seletor mostra 15 meses
// fixos pra trás, mesmo os de antes do sistema ter dados.
export function useMesesFiscaisDisponiveis() {
  const [meses, setMeses] = useState(listaMesesFiscais());

  useEffect(() => {
    fetchPeriodosDisponiveis()
      .then(({ dataMinima, dataMaxima }) => {
        if (!dataMinima || !dataMaxima) return;
        setMeses(listaMesesFiscais().filter((mes) => mes.dataInicio <= dataMaxima && mes.dataFim >= dataMinima));
      })
      .catch(() => {});
  }, []);

  return meses;
}
