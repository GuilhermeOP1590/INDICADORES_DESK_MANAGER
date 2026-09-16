// frontend/src/components/PcmListaSimples.jsx
import { useEffect, useState } from "react";
import { fetchPcmAtribuicoes } from "../api.js";

// Lista somente-leitura de chamados filtrada por grupo/pessoa/urgência — aberta ao clicar
// numa célula da matriz Pessoa × Urgência (PcmPorGrupoTab). Edição continua só na aba
// "Atribuições"; aqui é só consulta + (na Task 7) exportação.
export function PcmListaSimples({ filtros }) {
  const [state, setState] = useState({ status: "loading", chamados: [], error: null });

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", chamados: [], error: null });

    fetchPcmAtribuicoes(filtros)
      .then(({ chamados }) => {
        if (!cancelado) setState({ status: "ready", chamados, error: null });
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
  if (state.status === "error") return <div className="state-banner error">Erro: {state.error}</div>;
  if (state.chamados.length === 0) return <p className="subtitle">Nenhum chamado encontrado.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Assunto</th>
          <th>Status</th>
          <th>Pessoa</th>
          <th>Urgência</th>
        </tr>
      </thead>
      <tbody>
        {state.chamados.map((c) => (
          <tr key={c.codChamado}>
            <td>{c.codChamado}</td>
            <td>{c.assunto}</td>
            <td>{c.status}</td>
            <td>{c.pessoa ?? "—"}</td>
            <td>{c.urgencia ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
