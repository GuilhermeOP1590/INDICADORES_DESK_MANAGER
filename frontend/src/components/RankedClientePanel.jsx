import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { RankingTable } from "./RankingTable.jsx";
import { Modal } from "./Modal.jsx";
import { DrillDownContent } from "./DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";

const TOP_N = 10;
const ALTURA_POR_LINHA = 32;

const TIPOS_MANUTENCAO = ["Preventiva", "Corretiva", "Rotina", "Segurança"];

// Painel full-width com preview em barra (top 10, altura folgada pra caber o nome inteiro do
// cliente) — ao clicar, abre direto a tabela completa com busca/ordenação. Sem repetir o
// gráfico no modal: a barra já mostrou o essencial, a tabela é só pra achar/comparar qualquer
// cliente da lista, não só o top 10.
// tipoFiltro/onTipoFiltroChange são opcionais — sem eles o seletor de tipo não aparece.
export function RankedClientePanel({
  title,
  subtitle,
  data,
  color,
  filtroBase,
  formatValue,
  ordemInicial,
  fetcher,
  tipoFiltro,
  onTipoFiltroChange,
}) {
  const drill = useDrillDown();
  const top10 = data.slice(0, TOP_N);
  const semDados = data.length === 0;

  // Sem seletor de tipo, um painel vazio não tem pra onde o usuário ir — mantém o
  // comportamento antigo de simplesmente não renderizar. Com seletor, esconder o painel some
  // também com o próprio seletor e trava o usuário no tipo sem dado — melhor mostrar um aviso.
  if (semDados && !onTipoFiltroChange) return null;

  return (
    <div className="panel full-width maximizable" onClick={() => !semDados && !drill.pilha && drill.abrir()}>
      <div className="panel-header-row">
        <div>
          <h2>{title}</h2>
          <p className="subtitle">{subtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onTipoFiltroChange && (
            <select
              value={tipoFiltro ?? ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onTipoFiltroChange(e.target.value)}
            >
              <option value="">Todos os tipos (Manutenção)</option>
              {TIPOS_MANUTENCAO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          {!semDados && <span className="expand-hint">⤢</span>}
        </div>
      </div>
      {semDados ? (
        <p className="subtitle">
          Nenhum cliente com pelo menos 3 chamados{tipoFiltro ? ` do tipo "${tipoFiltro}"` : ""} nesse período — tente outro
          tipo ou período.
        </p>
      ) : (
        <HorizontalBarChart
          data={top10}
          color={color}
          limit={TOP_N}
          height={TOP_N * ALTURA_POR_LINHA}
          formatValue={formatValue}
          agregarOutros={false}
        />
      )}

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? title} onClose={drill.fechar} onBack={drill.pilha.length > 0 ? drill.voltar : undefined}>
          {!drill.topo && (
            <RankingTable
              data={data}
              formatValue={formatValue}
              nomeColuna="Cliente"
              nomeValor="% Resolução"
              ordemInicial={ordemInicial}
              onSelecionar={(label) => drill.abrirLista({ ...filtroBase, cliente: label }, label, fetcher)}
            />
          )}
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
