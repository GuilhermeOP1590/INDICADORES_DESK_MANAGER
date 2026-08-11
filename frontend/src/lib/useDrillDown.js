import { useState } from "react";

// pilha === null  -> modal fechado
// pilha === []    -> modal aberto, mostrando a "raiz" (gráfico ou nada)
// pilha === [...] -> navegando (lista de chamados, detalhe de um chamado)
export function useDrillDown() {
  const [pilha, setPilha] = useState(null);

  function abrir() {
    setPilha([]);
  }

  function abrirLista(filtros, titulo) {
    setPilha([{ tipo: "lista", filtros, titulo }]);
  }

  function abrirChamado(chamado) {
    setPilha((p) => [...(p ?? []), { tipo: "detalhe", chamado, titulo: chamado.codChamado }]);
  }

  function voltar() {
    setPilha((p) => (p && p.length > 0 ? p.slice(0, -1) : p));
  }

  function fechar() {
    setPilha(null);
  }

  const topo = pilha && pilha.length > 0 ? pilha[pilha.length - 1] : null;

  return { pilha, topo, abrir, abrirLista, abrirChamado, voltar, fechar };
}
