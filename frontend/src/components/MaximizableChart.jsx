import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { RankingTable } from "./RankingTable.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

// Acima disso, dezenas de barras de 26px viram uma faixa ilegível — melhor mostrar só o
// top N como barra (onde a comparação visual ainda funciona) e o resto numa tabela com
// busca/ordenação (ver RankingTable).
const LIMITE_BARRAS_MAXIMIZADO = 12;
const TOP_N_MAXIMIZADO = 10;

export function MaximizableChart({
  title,
  subtitle,
  data,
  color,
  limit = 8,
  filtroBase,
  dimensaoFiltro,
  formatValue,
  resumoPorCliente,
  agregarOutros = true,
  fetcher,
}) {
  const drill = useDrillDown();

  return (
    <div className="panel maximizable" onClick={() => !drill.pilha && drill.abrir()}>
      <div className="panel-header-row">
        <div>
          <h2>{title}</h2>
          <p className="subtitle">{subtitle}</p>
        </div>
        <span className="expand-hint">⤢</span>
      </div>
      <HorizontalBarChart
        data={data}
        color={color}
        limit={limit}
        height={220}
        formatValue={formatValue}
        agregarOutros={agregarOutros}
      />

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? title} onClose={drill.fechar} onBack={drill.pilha.length > 0 ? drill.voltar : undefined}>
          {!drill.topo &&
            (() => {
              const selecionar = (label, agregado, entry) => {
                if (agregado) {
                  const foraDoTopo = data.slice(0, 30).map((d) => d.label);
                  drill.abrirLista(
                    { ...filtroBase, dimensao: dimensaoFiltro, foraDoTopo: foraDoTopo.join("|") },
                    "Outros (agregado)",
                    fetcher
                  );
                } else if (entry?.itens) {
                  drill.abrirSubRanking(entry.itens, label, { filtroBase, fetcher, color, formatValue });
                } else if (resumoPorCliente) {
                  drill.abrirResumoCliente({ ...filtroBase, cliente: label }, label);
                } else {
                  drill.abrirLista({ ...filtroBase, [dimensaoFiltro]: label }, label, fetcher);
                }
              };

              if (data.length <= LIMITE_BARRAS_MAXIMIZADO) {
                return (
                  <HorizontalBarChart
                    data={data}
                    color={color}
                    limit={30}
                    height={Math.max(320, Math.min(data.length, 31) * 26)}
                    agregarOutros={agregarOutros}
                    onBarClick={selecionar}
                    formatValue={formatValue}
                  />
                );
              }

              return (
                <div>
                  <HorizontalBarChart
                    data={data}
                    color={color}
                    limit={TOP_N_MAXIMIZADO}
                    height={TOP_N_MAXIMIZADO * 26}
                    agregarOutros={false}
                    onBarClick={selecionar}
                    formatValue={formatValue}
                  />
                  <h3 style={{ marginTop: 20 }}>Todos ({data.length})</h3>
                  <RankingTable data={data} formatValue={formatValue} onSelecionar={selecionar} />
                </div>
              );
            })()}
          <DrillDownContent
            topo={drill.topo}
            onAbrirChamado={drill.abrirChamado}
            onAbrirLista={(filtros, titulo) => drill.abrirListaEmpilhada(filtros, titulo, fetcher)}
          />
        </Modal>
      )}
    </div>
  );
}
