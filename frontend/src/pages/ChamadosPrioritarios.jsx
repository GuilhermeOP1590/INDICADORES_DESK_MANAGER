import { useEffect, useState } from "react";
import { fetchPrioritarios, adicionarPrioridade, removerPrioridade } from "../api.js";
import { StatTile } from "../components/StatTile.jsx";
import { SubTabs } from "../components/SubTabs.jsx";
import { Modal } from "../components/Modal.jsx";
import { DrillDownContent } from "../components/DrillDownContent.jsx";
import { useDrillDown } from "../lib/useDrillDown.js";
import { formatHoras } from "../lib/datas.js";

const FILTROS = [
  { value: "abertos", label: "Abertos" },
  { value: "fechados", label: "Fechados" },
  { value: "todos", label: "Todos" },
];

export default function ChamadosPrioritarios() {
  const [state, setState] = useState({ status: "loading", payload: null, error: null });
  const [filtro, setFiltro] = useState("abertos");
  const [codigoInput, setCodigoInput] = useState("");
  const [notaInput, setNotaInput] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [erroAcao, setErroAcao] = useState(null);
  const drill = useDrillDown();

  async function carregar() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchPrioritarios();
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleAdicionar(e) {
    e.preventDefault();
    if (!codigoInput.trim()) return;

    setAdicionando(true);
    setErroAcao(null);
    try {
      const payload = await adicionarPrioridade(codigoInput.trim(), notaInput.trim());
      setState({ status: "ready", payload, error: null });
      setCodigoInput("");
      setNotaInput("");
    } catch (error) {
      setErroAcao(error.message);
    } finally {
      setAdicionando(false);
    }
  }

  async function handleRemover(codChamado) {
    try {
      const payload = await removerPrioridade(codChamado);
      setState({ status: "ready", payload, error: null });
      setErroAcao(null);
    } catch (error) {
      setErroAcao(error.message);
    }
  }

  const payload = state.payload;
  const chamados = payload?.chamados ?? [];
  const filtrados = chamados.filter((c) => {
    if (filtro === "abertos") return !c.finalizado;
    if (filtro === "fechados") return c.finalizado;
    return true;
  });

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Chamados prioritários</h2>
          <p className="subtitle">
            Marcados manualmente pra acompanhamento mais próximo — independente da prioridade do Desk.
          </p>
        </div>
        <button className="refresh-btn" onClick={carregar} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Atualizando..." : "Atualizar agora"}
        </button>
      </div>

      <form className="filter-bar" onSubmit={handleAdicionar}>
        <input
          type="text"
          className="search-input"
          placeholder="Código do chamado (ex: 0726-001231)"
          value={codigoInput}
          onChange={(e) => setCodigoInput(e.target.value)}
        />
        <input
          type="text"
          className="search-input"
          placeholder="Nota (opcional)"
          value={notaInput}
          onChange={(e) => setNotaInput(e.target.value)}
        />
        <button className="refresh-btn" type="submit" disabled={adicionando || !codigoInput.trim()}>
          {adicionando ? "Adicionando..." : "Adicionar"}
        </button>
      </form>

      {erroAcao && <div className="state-banner error">{erroAcao}</div>}
      {state.status === "error" && (
        <div className="state-banner error">Erro ao carregar chamados prioritários: {state.error}</div>
      )}
      {state.status === "loading" && !payload && <p className="subtitle">Carregando chamados prioritários...</p>}

      {payload && (
        <>
          <section className="stat-grid">
            <StatTile label="Total priorizados" value={payload.resumo.total} />
            <StatTile
              label="Em aberto"
              value={payload.resumo.abertos}
              statusClass={payload.resumo.abertos > 0 ? "status-warning" : undefined}
            />
            <StatTile label="Fechados" value={payload.resumo.fechados} />
            <StatTile
              label="Tempo médio parado"
              value={payload.resumo.tempoMedioAbertoDias !== null ? `${payload.resumo.tempoMedioAbertoDias} dias` : "—"}
            />
          </section>

          <SubTabs options={FILTROS} active={filtro} onChange={setFiltro} />

          {drill.pilha !== null && (
            <Modal
              title={drill.topo?.titulo ?? ""}
              onClose={drill.fechar}
              onBack={drill.pilha.length > 1 ? drill.voltar : undefined}
            >
              <DrillDownContent topo={drill.topo} onAbrirChamado={drill.abrirChamado} onAbrirLista={drill.abrirListaEmpilhada} />
            </Modal>
          )}

          <div className="panel full-width">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Assunto</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Área</th>
                  <th>Tempo</th>
                  <th>Nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.codChamado}
                    className={c.encontrado ? "clickable-row" : ""}
                    onClick={c.encontrado ? () => drill.abrirChamado({ chave: c.chave, codChamado: c.codChamado }) : undefined}
                  >
                    <td>{c.codChamado}</td>
                    <td>{c.assunto ?? "—"}</td>
                    <td>{c.cliente ?? "—"}</td>
                    <td>{c.status}</td>
                    <td>{c.especialidade ?? "—"}</td>
                    <td>
                      {c.finalizado
                        ? `Resolvido em ${formatHoras(c.tempoResolucaoHoras)}`
                        : c.diasEmAberto !== null
                          ? `${c.diasEmAberto} dias em aberto`
                          : "—"}
                    </td>
                    <td>{c.nota || "—"}</td>
                    <td>
                      <button
                        className="remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemover(c.codChamado);
                        }}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="meta">
                      Nenhum chamado priorizado{filtro !== "todos" ? ` (${filtro})` : ""} — adicione um código acima.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
