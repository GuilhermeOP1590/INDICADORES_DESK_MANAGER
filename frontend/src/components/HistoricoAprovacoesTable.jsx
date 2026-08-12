import { useMemo, useState } from "react";
import { formatBR } from "../lib/datas.js";
import { contagemPorCampo } from "../lib/contagem.js";
import { SortableTh } from "./SortableTh.jsx";
import { useSort } from "../lib/useSort.js";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function opcoesDe(dados, campo) {
  return [...new Set(dados.map((c) => c[campo]).filter(Boolean))].sort();
}

// Ledger cronológico: cada chamado que já foi avaliado, na ordem em que o valor foi lançado —
// pra acompanhar o ritmo de aprovações, não só o total acumulado. Filtro por coluna (status,
// cliente, causa) além da busca livre, já que a lista pode crescer bastante ao longo do mês.
export function HistoricoAprovacoesTable({ dados, onAbrirChamado }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [cliente, setCliente] = useState("");
  const [causa, setCausa] = useState("");

  const statusDisponiveis = useMemo(() => opcoesDe(dados, "status"), [dados]);
  const clientesDisponiveis = useMemo(() => opcoesDe(dados, "cliente"), [dados]);
  const causasDisponiveis = useMemo(() => opcoesDe(dados, "causa"), [dados]);
  const contagemStatus = useMemo(() => contagemPorCampo(dados, "status"), [dados]);
  const contagemCliente = useMemo(() => contagemPorCampo(dados, "cliente"), [dados]);
  const contagemCausa = useMemo(() => contagemPorCampo(dados, "causa"), [dados]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return dados.filter((c) => {
      if (status && c.status !== status) return false;
      if (cliente && c.cliente !== cliente) return false;
      if (causa && c.causa !== causa) return false;
      if (termo && !c.assunto.toLowerCase().includes(termo) && !c.codChamado.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [dados, busca, status, cliente, causa]);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtrados, "dataAprovacao", "desc");

  if (dados.length === 0) {
    return <p className="subtitle">Nenhuma aprovação registrada nesse período ainda.</p>;
  }

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
          <option value="">Todos os status ({dados.length})</option>
          {statusDisponiveis.map((s) => (
            <option key={s} value={s}>
              {s} ({contagemStatus.get(s) ?? 0})
            </option>
          ))}
        </select>
        <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
          <option value="">Todos os clientes ({dados.length})</option>
          {clientesDisponiveis.map((c) => (
            <option key={c} value={c}>
              {c} ({contagemCliente.get(c) ?? 0})
            </option>
          ))}
        </select>
        <select value={causa} onChange={(e) => setCausa(e.target.value)}>
          <option value="">Todas as causas ({dados.length})</option>
          {causasDisponiveis.map((c) => (
            <option key={c} value={c}>
              {c} ({contagemCausa.get(c) ?? 0})
            </option>
          ))}
        </select>
        <span className="meta">
          {filtrados.length} de {dados.length}
        </span>
      </div>

      {filtrados.length === 0 ? (
        <p className="subtitle">Nenhuma aprovação corresponde a esse filtro.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh
                label="Data da aprovação"
                sortKeyName="dataAprovacao"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableTh label="Código" sortKeyName="codChamado" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Assunto" sortKeyName="assunto" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Status atual" sortKeyName="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Cliente" sortKeyName="cliente" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Causa" sortKeyName="causa" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Valor" sortKeyName="valor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.chave} className="clickable-row" onClick={() => onAbrirChamado(c)}>
                <td>{formatBR(c.dataAprovacao)}</td>
                <td>{c.codChamado}</td>
                <td>{c.assunto}</td>
                <td>{c.status}</td>
                <td>{c.cliente ?? "—"}</td>
                <td>{c.causa ?? "—"}</td>
                <td className="num">{formatBRL(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
