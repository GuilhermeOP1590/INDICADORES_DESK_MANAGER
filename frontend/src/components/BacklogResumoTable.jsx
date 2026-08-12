// Resumo do backlog (chamados criados antes do período selecionado, ainda em aberto) — os
// dados já vêm prontos junto com /indicadores (buildBacklog no backend), então aqui é só
// exibir duas rankings clicáveis: por área (Manutenção/Engenharia/Outras) e por cliente
// (maiores ofensores), cada uma abrindo a lista de chamados correspondente.
export function BacklogResumoTable({ dados, filtroBase, onAbrirLista }) {
  if (!dados || dados.total === 0) {
    return <p className="subtitle">Nenhum chamado em aberto criado antes do período selecionado.</p>;
  }

  return (
    <div>
      <div className="meta" style={{ marginBottom: 12 }}>
        {dados.total} chamados criados antes do período, ainda em aberto — clique numa linha pra ver os chamados
      </div>

      <h3>Por área</h3>
      <table>
        <thead>
          <tr>
            <th>Área</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {dados.porArea.map((a) => (
            <tr
              key={a.label}
              className="clickable-row"
              onClick={() => onAbrirLista({ ...filtroBase, area: a.label }, `Backlog — ${a.label}`)}
            >
              <td>{a.label}</td>
              <td className="num">{a.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 20 }}>Maiores ofensores (clientes)</h3>
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {dados.porCliente.map((c) => (
            <tr
              key={c.label}
              className="clickable-row"
              onClick={() => onAbrirLista({ ...filtroBase, cliente: c.label }, `Backlog — ${c.label}`)}
            >
              <td>{c.label}</td>
              <td className="num">{c.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
