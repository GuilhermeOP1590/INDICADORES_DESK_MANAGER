import { ChamadosList } from "./ChamadosList.jsx";
import { ChamadoDetalhe } from "./ChamadoDetalhe.jsx";

export function DrillDownContent({ topo, onAbrirChamado }) {
  if (topo?.tipo === "lista") {
    return <ChamadosList filtros={topo.filtros} onAbrirChamado={onAbrirChamado} />;
  }

  if (topo?.tipo === "detalhe") {
    return <ChamadoDetalhe chave={topo.chamado.chave} codChamado={topo.chamado.codChamado} />;
  }

  return null;
}
