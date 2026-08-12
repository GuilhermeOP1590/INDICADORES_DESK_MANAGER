import { StatTile } from "./StatTile.jsx";

// Resume a tabela de operadores em 4 números que cabem numa olhada — não substitui
// a tabela detalhada, é o "manchete" antes de ir pro detalhe.
// onAbrirGeral/onAbrirOperador são opcionais — sem eles os cards ficam só informativos
// (usado assim em telas que já tem outro jeito de chegar nos chamados).
export function TeamPerformanceCards({ operadores, onAbrirGeral, onAbrirOperador }) {
  const comOperador = operadores.filter((op) => op.operador !== "Sem operador");
  const totalChamados = operadores.reduce((soma, op) => soma + op.total, 0);
  const totalConcluidos = operadores.reduce((soma, op) => soma + (op.concluidos ?? 0), 0);
  const percentualMedio = totalChamados ? Math.round((totalConcluidos / totalChamados) * 1000) / 10 : 0;

  const destaqueVolume = [...comOperador].sort((a, b) => b.total - a.total)[0];
  const destaqueResolucao = [...comOperador]
    .filter((op) => op.total >= 3)
    .sort((a, b) => (b.percentualResolucao ?? 0) - (a.percentualResolucao ?? 0))[0];

  return (
    <section className="stat-grid">
      <StatTile label="Operadores ativos no período" value={comOperador.length} onClick={onAbrirGeral} />
      <StatTile
        label="% de resolução do time"
        value={`${percentualMedio}%`}
        statusClass={percentualMedio >= 80 ? "status-good" : undefined}
        onClick={onAbrirGeral}
      />
      <StatTile
        label="Maior volume"
        value={destaqueVolume ? destaqueVolume.operador : "—"}
        meta={destaqueVolume ? `${destaqueVolume.total} chamados` : undefined}
        onClick={destaqueVolume && onAbrirOperador ? () => onAbrirOperador(destaqueVolume.operador) : undefined}
      />
      <StatTile
        label="Melhor % de resolução"
        value={destaqueResolucao ? destaqueResolucao.operador : "—"}
        meta={destaqueResolucao ? `${destaqueResolucao.percentualResolucao}% (${destaqueResolucao.total} chamados)` : undefined}
        statusClass="status-good"
        onClick={destaqueResolucao && onAbrirOperador ? () => onAbrirOperador(destaqueResolucao.operador) : undefined}
      />
    </section>
  );
}
