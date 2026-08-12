import { useEffect, useState } from "react";
import { fetchResumoCliente } from "../api.js";

// Aberto ao clicar numa barra do gráfico "Por cliente" — cruza Manutenção x Engenharia pra
// mostrar de onde vem a demanda real daquela unidade, não só o total de uma especialidade.
export function ClienteResumoTable({ filtros, onSelecionarEspecialidade }) {
  const [state, setState] = useState({ status: "loading", dados: null, error: null });

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", dados: null, error: null });

    fetchResumoCliente(filtros)
      .then((resultado) => {
        if (!cancelado) setState({ status: "ready", dados: resultado, error: null });
      })
      .catch((error) => {
        if (!cancelado) setState({ status: "error", dados: null, error: error.message });
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  if (state.status === "loading") return <p className="subtitle">Carregando resumo...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar resumo: {state.error}</div>;
  if (state.dados.porEspecialidade.length === 0) return <p className="subtitle">Nenhum chamado encontrado com esse filtro.</p>;

  return (
    <div>
      <div className="meta" style={{ marginBottom: 12 }}>
        {state.dados.total} chamados no total — clique numa linha pra ver os chamados
      </div>
      <table>
        <thead>
          <tr>
            <th>Especialidade</th>
            <th className="num">Total</th>
            <th className="num">Abertos</th>
            <th className="num">Fechados</th>
            <th className="num">% Resolução</th>
          </tr>
        </thead>
        <tbody>
          {state.dados.porEspecialidade.map((e) => (
            <tr key={e.especialidade} className="clickable-row" onClick={() => onSelecionarEspecialidade(e.especialidade, e.total)}>
              <td>{e.especialidade}</td>
              <td className="num">{e.total}</td>
              <td className="num">{e.abertos}</td>
              <td className="num">{e.fechados}</td>
              <td className="num">{Number.isFinite(e.percentualResolucao) ? `${e.percentualResolucao}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
