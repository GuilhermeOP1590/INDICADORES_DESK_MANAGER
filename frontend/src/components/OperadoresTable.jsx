export function OperadoresTable({ data }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Operador</th>
          <th className="num">Total</th>
          <th className="num">Abertos</th>
          <th className="num">Fechados</th>
        </tr>
      </thead>
      <tbody>
        {data.map((op) => (
          <tr key={op.operador}>
            <td>{op.operador}</td>
            <td className="num">{op.total}</td>
            <td className="num">{op.abertos}</td>
            <td className="num">{op.fechados}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
