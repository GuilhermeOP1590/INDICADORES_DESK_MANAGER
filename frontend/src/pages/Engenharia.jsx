import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchEngenharia, fetchEngenhariaCausas, fetchSlaNivelDetalhe } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { SlaNiveisPanel } from "../components/SlaNiveisPanel.jsx";
import { TeamPerformanceCards } from "../components/TeamPerformanceCards.jsx";
import { MaximizableChart } from "../components/MaximizableChart.jsx";
import { CausaPanel } from "../components/CausaPanel.jsx";
import { OperadoresTable } from "../components/OperadoresTable.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { DateFilterBar } from "../components/DateFilterBar.jsx";
import { UfSelect } from "../components/UfSelect.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { useUfsDisponiveis } from "../lib/useUfsDisponiveis.js";
import { useDebouncedValue } from "../lib/useDebouncedValue.js";
import { periodoMesFiscal } from "../lib/datas.js";

const GERAL = "__geral__";
// Status real do Desk pra equipamento avaliado e reprovado pra uso, com laudo técnico anexado
// — mesmo valor usado em Manutencao.jsx (front e back não compartilham módulo, cada lado
// declara essa string localmente).
const STATUS_CONDENADO = "Condenado e Laudo Anexo (Atenção)";
const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Engenharia() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  const [tipoAtivo, setTipoAtivo] = useState(GERAL);
  const [buscaInput, setBuscaInput] = useState("");
  const busca = useDebouncedValue(buscaInput);
  const [uf, setUf] = useState("");
  const [detalhesAprovacao, setDetalhesAprovacao] = useState(null);
  const drill = useDrillDown();
  const ufsDisponiveis = useUfsDisponiveis();

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchEngenharia({ forceRefresh, ...periodo, q: busca || undefined, uf: uf || undefined });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    load();
    setDetalhesAprovacao(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.dataInicio, periodo.dataFim, busca, uf]);

  const detalhe = tipoAtivo === GERAL ? state.payload?.geral : state.payload?.porAtividadeDetalhe?.[tipoAtivo];

  const filtroBase = {
    especialidade: "Engenharia",
    ...(tipoAtivo === GERAL ? {} : { tipoAtividade: tipoAtivo }),
    ...periodo,
    q: busca || undefined,
    uf: uf || undefined,
  };

  return (
    <div>
      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} />
        <button className="refresh-btn" onClick={() => load(true)} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por assunto ou código do chamado..."
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
        />
        <UfSelect value={uf} onChange={setUf} ufs={ufsDisponiveis} />
      </div>

      {state.status === "error" && <div className="state-banner error">Erro ao carregar indicadores de Engenharia: {state.error}</div>}

      {state.payload && (
        <>
          <div className="meta" style={{ marginBottom: 12 }}>
            {state.payload.total} chamados de Engenharia no período
          </div>

          <SubTabs
            options={[
              { value: GERAL, label: "Geral", count: state.payload.total },
              ...state.payload.porTipoAtividade.map((t) => ({ value: t.label, label: t.label, count: t.total })),
            ]}
            active={tipoAtivo}
            onChange={setTipoAtivo}
          />

          {detalhe && (
            <>
              <section className="stat-grid">
                <StatTile
                  label={`Chamados${tipoAtivo === GERAL ? "" : ` (${tipoAtivo})`}`}
                  value={detalhe.total}
                  onClick={() => drill.abrirLista(filtroBase, `Chamados${tipoAtivo === GERAL ? "" : ` — ${tipoAtivo}`}`)}
                />
                <StatTile
                  label="Aguardando Aprovação"
                  value={detalhe.aguardandoAprovacao.aguardando}
                  statusClass="status-warning"
                  meta={tipoAtivo === GERAL && detalhesAprovacao ? formatBRL(detalhesAprovacao.valorAguardando) : undefined}
                  onClick={() => drill.abrirLista({ ...filtroBase, statusAprovacao: "aguardando" }, "Aguardando Aprovação")}
                />
                <StatTile
                  label="Condenado (laudo)"
                  value={detalhe.condenado}
                  statusClass={detalhe.condenado > 0 ? "status-critical" : undefined}
                  meta={
                    <Link to="/condenados" onClick={(e) => e.stopPropagation()}>
                      Ver todos pendentes →
                    </Link>
                  }
                  onClick={() => drill.abrirLista({ ...filtroBase, status: STATUS_CONDENADO }, "Condenado (laudo)")}
                />
                {tipoAtivo === GERAL && detalhesAprovacao && (
                  <StatTile
                    label="Aprovados"
                    value={detalhesAprovacao.jaAvaliados}
                    meta={formatBRL(detalhesAprovacao.valorAvaliado)}
                    onClick={() => drill.abrirLista({ ...filtroBase, statusAprovacao: "avaliado" }, "Aprovados")}
                  />
                )}
                {tipoAtivo === GERAL && detalhesAprovacao && detalhesAprovacao.jaReprovados > 0 && (
                  <StatTile
                    label="Reprovados"
                    value={detalhesAprovacao.jaReprovados}
                    statusClass="status-critical"
                    meta={formatBRL(detalhesAprovacao.valorReprovado)}
                    onClick={() => drill.abrirLista({ ...filtroBase, statusAprovacao: "reprovado" }, "Reprovados")}
                  />
                )}
              </section>

              <TeamPerformanceCards operadores={detalhe.operadores} />

              <SlaNiveisPanel
                porNivel={detalhe.porNivel}
                onSelecionarNivel={(nivel, label) =>
                  drill.abrirNivelDetalhe({ ...filtroBase, nivel }, `SLA nível ${nivel} — ${label}`, fetchSlaNivelDetalhe)
                }
              />

              {drill.pilha !== null && (
                <Modal title={drill.topo?.titulo ?? ""} onClose={drill.fechar} onBack={drill.pilha.length > 1 ? drill.voltar : undefined}>
                  <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
                </Modal>
              )}

              {tipoAtivo === GERAL && (
                <section className="panel-grid">
                  <MaximizableChart
                    title="Por tipo de atividade"
                    subtitle="Civil, Hidráulica, Elétrica, Telhado, Serralheria, Compras — clique numa barra"
                    data={state.payload.porTipoAtividade}
                    color="var(--series-2)"
                    limit={8}
                    filtroBase={{ especialidade: "Engenharia", ...periodo, q: busca || undefined, uf: uf || undefined }}
                    dimensaoFiltro="tipoAtividade"
                  />
                  <CausaPanel
                    carregar={() => fetchEngenhariaCausas({ ...periodo, q: busca || undefined, uf: uf || undefined })}
                    filtroBase={{ especialidade: "Engenharia", ...periodo, q: busca || undefined, uf: uf || undefined }}
                    onCarregado={setDetalhesAprovacao}
                  />
                </section>
              )}

              <section className="panel-grid">
                <MaximizableChart
                  title="Por cliente"
                  subtitle={`Ranking de lojas/unidades${tipoAtivo !== GERAL ? ` — ${tipoAtivo}` : ""} — clique numa barra`}
                  data={detalhe.porCliente}
                  color="var(--series-2)"
                  limit={10}
                  filtroBase={filtroBase}
                  dimensaoFiltro="cliente"
                  resumoPorCliente
                />

                <div className="panel full-width">
                  <h2>Por operador</h2>
                  <p className="subtitle">Todos os operadores que atenderam esses chamados no período — clique numa linha</p>
                  <OperadoresTable data={detalhe.operadores} filtroBase={filtroBase} />
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
