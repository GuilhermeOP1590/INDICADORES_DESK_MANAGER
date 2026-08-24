import { useEffect, useState } from "react";
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";

// Aberto ao clicar num card de nível de SLA — mostra, lado a lado, o breakdown por atividade
// e o ranking de lojas (clientes) daquele nível, já com os mesmos filtros globais (período/uf/busca)
// ativos na tela de origem. Clicar em qualquer barra/linha abre a lista de chamados filtrada.
export function NivelDetalhePanel({ filtros, fetcher, onAbrirLista }) {
  const [state, setState] = useState({ status: "loading", dados: null, error: null });

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", dados: null, error: null });

    fetcher(filtros)
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

  if (state.status === "loading") return <p className="subtitle">Carregando detalhe do nível...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar detalhe: {state.error}</div>;
  if (state.dados.total === 0) return <p className="subtitle">Nenhum chamado encontrado com esse filtro.</p>;

  return (
    <div>
      <div className="meta" style={{ marginBottom: 12 }}>
        {state.dados.total} chamados no total ({state.dados.abertos} em aberto) — clique numa barra ou numa loja pra ver os
        chamados
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h3>Por atividade</h3>
          <HorizontalBarChart
            data={state.dados.porAtividade}
            color="var(--series-1)"
            limit={10}
            height={Math.max(180, Math.min(state.dados.porAtividade.length, 10) * 32)}
            onBarClick={(label) => onAbrirLista({ atividade: label }, label)}
          />
        </div>

        <div className="panel">
          <h3>Por loja</h3>
          <table>
            <thead>
              <tr>
                <th>Loja</th>
                <th className="num">Total</th>
                <th className="num">Abertos</th>
              </tr>
            </thead>
            <tbody>
              {state.dados.porCliente.map((c) => (
                <tr key={c.cliente} className="clickable-row" onClick={() => onAbrirLista({ cliente: c.cliente }, c.cliente)}>
                  <td>{c.cliente}</td>
                  <td className="num">{c.total}</td>
                  <td className="num">{c.abertos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
