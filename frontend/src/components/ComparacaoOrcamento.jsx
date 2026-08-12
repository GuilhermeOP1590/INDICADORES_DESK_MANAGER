const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function variacao(atual, anterior) {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export function ComparacaoOrcamento({ atual, anterior, labelAtual, labelAnterior }) {
  const totalAtual = atual.aguardando.valor + atual.avaliados.valor;
  const totalAnterior = anterior.aguardando.valor + anterior.avaliados.valor;

  const linhas = [
    { label: "Aguardando Aprovação", a: atual.aguardando.valor, b: anterior.aguardando.valor },
    { label: "Já avaliados", a: atual.avaliados.valor, b: anterior.avaliados.valor },
    { label: "Total em orçamento", a: totalAtual, b: totalAnterior },
  ];

  return (
    <div className="panel full-width">
      <h2>Comparação entre períodos</h2>
      <p className="subtitle">
        {labelAtual} x {labelAnterior}
      </p>
      <table>
        <thead>
          <tr>
            <th></th>
            <th className="num">{labelAtual}</th>
            <th className="num">{labelAnterior}</th>
            <th className="num">Variação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const delta = variacao(linha.a, linha.b);
            const cor = delta === null ? undefined : delta > 0 ? "var(--status-warning)" : delta < 0 ? "var(--status-good)" : undefined;
            return (
              <tr key={linha.label}>
                <td>{linha.label}</td>
                <td className="num">{formatBRL(linha.a)}</td>
                <td className="num">{formatBRL(linha.b)}</td>
                <td className="num" style={{ color: cor, fontWeight: 600 }}>
                  {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
