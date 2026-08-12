import { useState } from "react";
import { fetchEquipamentosPorIc } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { DonutChart } from "../components/DonutChart.jsx";
import { HorizontalBarChart } from "../components/HorizontalBarChart.jsx";
import { RankingTable } from "../components/RankingTable.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { periodoMesFiscal, formatBR } from "../lib/datas.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Modal de perfil de um Ic específico — mantém seu PRÓPRIO useDrillDown/Modal aninhado pra abrir
// o detalhe de um chamado (mesmo padrão já usado em OperadoresTable.jsx), sem precisar estender
// DrillDownContent.jsx com um tipo novo.
function PerfilIc({ ic, onClose }) {
  const drill = useDrillDown();

  const donutData = [
    { label: "Preventiva", total: ic.preventiva },
    { label: "Corretiva", total: ic.corretiva },
  ];

  return (
    <Modal title={ic.ic} onClose={onClose}>
      <section className="stat-grid">
        <StatTile label="Total de chamados" value={ic.total} />
        <StatTile label="Cliente" value={ic.cliente ?? "Não identificado"} />
        <StatTile label="Custo total" value={formatBRL(ic.custoTotal)} />
        <StatTile
          label="Recorrência média"
          value={ic.recorrenciaDias !== null ? `a cada ${ic.recorrenciaDias}d` : "poucos dados"}
        />
      </section>

      <div className="panel">
        <h2>Preventiva x Corretiva</h2>
        <DonutChart data={donutData} height={200} />
      </div>

      <div className="panel full-width">
        <h2>Histórico</h2>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Data</th>
              <th>Tipo</th>
              <th>Causa</th>
              <th>Valor</th>
              <th>Horímetro</th>
            </tr>
          </thead>
          <tbody>
            {ic.chamados.map((c) => (
              <tr
                key={c.chave}
                className="clickable-row"
                onClick={() => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado })}
              >
                <td>{c.codChamado}</td>
                <td>{formatBR(c.dataCriacao)}</td>
                <td>{c.tipo ?? "—"}</td>
                <td>{c.causa ?? "—"}</td>
                <td className="num">{c.valorAprovacao ? formatBRL(c.valorAprovacao) : "—"}</td>
                <td className="num">{c.horimetro ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drill.pilha !== null && (
        <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
          <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
        </Modal>
      )}
    </Modal>
  );
}

export default function EquipamentosPorIc() {
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [state, setState] = useState({ status: "idle", payload: null, error: null });
  const [icSelecionado, setIcSelecionado] = useState(null);
  const [graficoAberto, setGraficoAberto] = useState(false);

  async function calcular() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchEquipamentosPorIc(periodo);
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  const selecionarIc = (label, agregado, entry) => setIcSelecionado(entry);

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Equipamentos por Ic</h2>
          <p className="subtitle">
            Custo e recorrência por equipamento específico (Ic do DeskManager) — só chamados de
            Manutenção com Ic identificado na interação.
          </p>
        </div>
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={calcular} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Calculando..." : "Calcular"}
        </button>
      </div>

      {state.status === "loading" && (
        <p className="subtitle">Buscando histórico de cada chamado do período — pode levar até 1 minuto...</p>
      )}

      {state.status === "error" && <div className="state-banner error">Erro ao calcular: {state.error}</div>}

      {state.payload && (
        <>
          <div className="meta" style={{ marginBottom: 12 }}>
            {state.payload.totalChamados} chamados de Manutenção no período — {state.payload.totalComIc} com Ic
            identificado, {state.payload.totalSemIc} sem
          </div>

          {state.payload.ics.length === 0 ? (
            <p className="subtitle">Nenhum chamado com Ic identificado nesse período.</p>
          ) : (
            <>
              <div className="panel full-width">
                <div className="panel-header-row">
                  <div>
                    <h2>Top equipamentos por volume de chamados</h2>
                    <p className="subtitle">Clique numa barra pra abrir o perfil do equipamento</p>
                  </div>
                  <span className="expand-hint" onClick={() => setGraficoAberto(true)}>
                    ⤢
                  </span>
                </div>
                <HorizontalBarChart
                  data={state.payload.ics.map((ic) => ({ ...ic, label: ic.ic }))}
                  limit={15}
                  agregarOutros={false}
                  height={Math.min(state.payload.ics.length, 15) * 26 + 20}
                  onBarClick={selecionarIc}
                />
              </div>

              {graficoAberto && (
                <Modal title="Top equipamentos por volume de chamados" onClose={() => setGraficoAberto(false)}>
                  <HorizontalBarChart
                    data={state.payload.ics.map((ic) => ({ ...ic, label: ic.ic }))}
                    limit={state.payload.ics.length}
                    agregarOutros={false}
                    height={Math.max(320, state.payload.ics.length * 26)}
                    onBarClick={selecionarIc}
                  />
                </Modal>
              )}

              <div className="panel full-width">
                <h2>Todos os equipamentos ({state.payload.ics.length})</h2>
                <RankingTable
                  data={state.payload.ics.map((ic) => ({ ...ic, label: ic.ic }))}
                  nomeColuna="Equipamento (Ic)"
                  onSelecionar={selecionarIc}
                  colunasExtras={[
                    { header: "Cliente", render: (d) => d.cliente ?? "—", valorBusca: (d) => d.cliente ?? "" },
                  ]}
                />
              </div>
            </>
          )}
        </>
      )}

      {icSelecionado && <PerfilIc ic={icSelecionado} onClose={() => setIcSelecionado(null)} />}
    </div>
  );
}
