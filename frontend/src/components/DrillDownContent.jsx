import { ChamadosList } from "./ChamadosList.jsx";
import { ChamadoDetalhe } from "./ChamadoDetalhe.jsx";
import { ClienteResumoTable } from "./ClienteResumoTable.jsx";
import { BacklogResumoTable } from "./BacklogResumoTable.jsx";
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { NivelDetalhePanel } from "./NivelDetalhePanel.jsx";

export function DrillDownContent({ topo, onAbrirChamado, onAbrirLista }) {
  if (topo?.tipo === "resumoCliente") {
    return (
      <ClienteResumoTable
        filtros={topo.filtros}
        onSelecionarEspecialidade={(especialidade) =>
          onAbrirLista({ ...topo.filtros, especialidade }, `${topo.titulo} — ${especialidade}`)
        }
      />
    );
  }

  if (topo?.tipo === "resumoBacklog") {
    return <BacklogResumoTable dados={topo.dados} filtroBase={topo.filtroBase} onAbrirLista={onAbrirLista} />;
  }

  // Ranking de um subconjunto (ex: equipamentos de um grupo) — dados já prontos, sem fetch;
  // clicar numa barra abre a lista de chamados filtrada por aquele item específico.
  if (topo?.tipo === "subRanking") {
    const altura = Math.max(220, Math.min(topo.dados.length, 30) * 26);
    return (
      <HorizontalBarChart
        data={topo.dados}
        color={topo.color}
        limit={topo.dados.length}
        height={altura}
        formatValue={topo.formatValue}
        agregarOutros={false}
        onBarClick={(label) => onAbrirLista({ ...topo.filtroBase, equipamento: label }, label, topo.fetcher)}
      />
    );
  }

  if (topo?.tipo === "nivelDetalhe") {
    return (
      <NivelDetalhePanel
        filtros={topo.filtros}
        fetcher={topo.fetcher}
        onAbrirLista={(extra, titulo) => onAbrirLista({ ...topo.filtros, ...extra }, titulo)}
      />
    );
  }

  if (topo?.tipo === "lista") {
    return <ChamadosList filtros={topo.filtros} onAbrirChamado={onAbrirChamado} fetcher={topo.fetcher} />;
  }

  if (topo?.tipo === "detalhe") {
    return <ChamadoDetalhe chave={topo.chamado.chave} codChamado={topo.chamado.codChamado} />;
  }

  return null;
}
