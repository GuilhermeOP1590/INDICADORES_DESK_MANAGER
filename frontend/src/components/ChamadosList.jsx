import { useEffect, useMemo, useState } from "react";
import { fetchChamadosFiltrados } from "../api.js";
import { formatBR, formatHoras } from "../lib/datas.js";
import { contagemPorCampo } from "../lib/contagem.js";
import { SortableTh } from "./SortableTh.jsx";
import { useSort } from "../lib/useSort.js";
import { exportarLinhas } from "../lib/exportExcel.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Espelha a classificação feita em Configurações (backend/configuracaoIndicadores.js) —
// filtra pelo "balde" (aberto/concluído/aguardando aprovação), não pelo status bruto do Desk.
const SITUACAO_LABELS = {
  concluido: "Concluído",
  aberto: "Em aberto",
  aguardandoAprovacao: "Aguardando Aprovação",
  outro: "Outro",
};

export function ChamadosList({ filtros, onAbrirChamado, fetcher }) {
  const [state, setState] = useState({ status: "loading", chamados: [], error: null });
  const [status, setStatus] = useState("");
  const [situacao, setSituacao] = useState("");
  const [area, setArea] = useState("");
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const buscar = fetcher ?? fetchChamadosFiltrados;

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", chamados: [], error: null });
    setStatus("");
    setSituacao("");
    setArea("");
    setTipo("");
    setBusca("");

    buscar(filtros)
      .then((resultado) => {
        if (!cancelado) setState({ status: "ready", chamados: resultado.chamados, error: null });
      })
      .catch((error) => {
        if (!cancelado) setState({ status: "error", chamados: [], error: error.message });
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  const statusDisponiveis = useMemo(() => [...new Set(state.chamados.map((c) => c.status))].sort(), [state.chamados]);
  const areasDisponiveis = useMemo(() => [...new Set(state.chamados.map((c) => c.area).filter(Boolean))].sort(), [state.chamados]);
  const tiposDisponiveis = useMemo(() => [...new Set(state.chamados.map((c) => c.tipo).filter(Boolean))].sort(), [state.chamados]);
  const contagemStatus = useMemo(() => contagemPorCampo(state.chamados, "status"), [state.chamados]);
  const contagemSituacao = useMemo(() => contagemPorCampo(state.chamados, "situacao"), [state.chamados]);
  const contagemArea = useMemo(() => contagemPorCampo(state.chamados, "area"), [state.chamados]);
  const contagemTipo = useMemo(() => contagemPorCampo(state.chamados, "tipo"), [state.chamados]);
  const temValor = state.chamados.some((c) => c.valorAprovacao !== undefined);
  const temTempoResolucao = state.chamados.some((c) => c.tempoResolucaoHoras !== undefined);
  const temArea = state.chamados.some((c) => c.area !== undefined);
  const temTipo = tiposDisponiveis.length > 0;
  const temPrioridade = state.chamados.some((c) => c.prioridade !== undefined);

  const chamadosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return state.chamados
      .filter((c) => {
        if (status && c.status !== status) return false;
        if (situacao && c.situacao !== situacao) return false;
        if (area && c.area !== area) return false;
        if (tipo && c.tipo !== tipo) return false;
        if (termo && !c.assunto.toLowerCase().includes(termo) && !c.codChamado.toLowerCase().includes(termo)) return false;
        return true;
      })
      .map((c) => ({
        ...c,
        dataHora: `${c.dataCriacao} ${c.horaCriacao}`,
        dataHoraFinalizacao: c.dataFinalizacao ? `${c.dataFinalizacao} ${c.horaFinalizacao}` : "",
      }));
  }, [state.chamados, status, situacao, area, tipo, busca]);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(chamadosFiltrados);

  const colunasExport = [
    { chave: "codChamado", titulo: "Código" },
    { chave: "assunto", titulo: "Assunto" },
    { chave: "status", titulo: "Status" },
    { chave: "prioridade", titulo: "Prioridade" },
    { chave: "dataHora", titulo: "Data de criação" },
    { chave: "dataHoraFinalizacao", titulo: "Data de finalização" },
    { chave: "cliente", titulo: "Cliente" },
    { chave: "operador", titulo: "Operador" },
  ];

  if (state.status === "loading") return <p className="subtitle">Carregando chamados...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar chamados: {state.error}</div>;
  if (state.chamados.length === 0) return <p className="subtitle">Nenhum chamado encontrado com esse filtro.</p>;

  return (
    <div>
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Buscar por assunto ou código..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="search-input"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status ({state.chamados.length})</option>
          {statusDisponiveis.map((s) => (
            <option key={s} value={s}>
              {s} ({contagemStatus.get(s) ?? 0})
            </option>
          ))}
        </select>
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todas as situações ({state.chamados.length})</option>
          {Object.entries(SITUACAO_LABELS).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label} ({contagemSituacao.get(valor) ?? 0})
            </option>
          ))}
        </select>
        {temArea && (
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas as áreas ({state.chamados.length})</option>
            {areasDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a} ({contagemArea.get(a) ?? 0})
              </option>
            ))}
          </select>
        )}
        {temTipo && (
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos os tipos ({state.chamados.length})</option>
            {tiposDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t} ({contagemTipo.get(t) ?? 0})
              </option>
            ))}
          </select>
        )}
        <button className="refresh-btn" onClick={() => exportarLinhas(sorted, colunasExport, "chamados")}>
          Exportar Excel
        </button>
        <span className="meta">
          {chamadosFiltrados.length} de {state.chamados.length}
        </span>
      </div>

      {chamadosFiltrados.length === 0 ? (
        <p className="subtitle">Nenhum chamado corresponde a esse filtro.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Código" sortKeyName="codChamado" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Assunto" sortKeyName="assunto" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Status" sortKeyName="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              {temPrioridade && (
                <SortableTh label="Prioridade" sortKeyName="prioridade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              )}
              <SortableTh label="Data de criação" sortKeyName="dataHora" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh
                label="Data de finalização"
                sortKeyName="dataHoraFinalizacao"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableTh label="Cliente" sortKeyName="cliente" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              {temArea && <SortableTh label="Área" sortKeyName="area" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
              {temTipo && <SortableTh label="Tipo" sortKeyName="tipo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
              <SortableTh label="Operador" sortKeyName="operador" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              {temTempoResolucao && (
                <SortableTh
                  label="Tempo de resolução"
                  sortKeyName="tempoResolucaoHoras"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="num"
                />
              )}
              {temValor && (
                <SortableTh
                  label="Valor"
                  sortKeyName="valorAprovacao"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="num"
                />
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.chave} className="clickable-row" onClick={() => onAbrirChamado(c)}>
                <td>{c.codChamado}</td>
                <td>{c.assunto}</td>
                <td>{c.status}</td>
                {temPrioridade && (
                  <td>
                    {c.prioridade ? (
                      <span className={`badge-nivel${c.slaNivel ? ` sla-nivel-${c.slaNivel}` : ""}`}>{c.prioridade}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td>
                  {formatBR(c.dataCriacao)} {c.horaCriacao}
                </td>
                <td>{c.dataFinalizacao ? `${formatBR(c.dataFinalizacao)} ${c.horaFinalizacao}` : "—"}</td>
                <td>{c.cliente ?? "—"}</td>
                {temArea && <td>{c.area ?? "—"}</td>}
                {temTipo && <td>{c.tipo ?? "—"}</td>}
                <td>{c.operador}</td>
                {temTempoResolucao && <td className="num">{formatHoras(c.tempoResolucaoHoras)}</td>}
                {temValor && <td className="num">{c.valorAprovacao ? formatBRL(c.valorAprovacao) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
