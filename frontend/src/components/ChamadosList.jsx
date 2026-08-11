import { useEffect, useState } from "react";
import { fetchChamadosFiltrados } from "../api.js";
import { formatBR } from "../lib/datas.js";

export function ChamadosList({ filtros, onAbrirChamado }) {
  const [state, setState] = useState({ status: "loading", chamados: [], error: null });

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", chamados: [], error: null });

    fetchChamadosFiltrados(filtros)
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

  if (state.status === "loading") return <p className="subtitle">Carregando chamados...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar chamados: {state.error}</div>;
  if (state.chamados.length === 0) return <p className="subtitle">Nenhum chamado encontrado com esse filtro.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Assunto</th>
          <th>Status</th>
          <th>Data</th>
          <th>Cliente</th>
          <th>Operador</th>
        </tr>
      </thead>
      <tbody>
        {state.chamados.map((c) => (
          <tr key={c.chave} className="clickable-row" onClick={() => onAbrirChamado(c)}>
            <td>{c.codChamado}</td>
            <td>{c.assunto}</td>
            <td>{c.status}</td>
            <td>
              {formatBR(c.dataCriacao)} {c.horaCriacao}
            </td>
            <td>{c.cliente ?? "—"}</td>
            <td>{c.operador}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
