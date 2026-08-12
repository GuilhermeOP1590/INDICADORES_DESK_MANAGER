import { StatTile } from "./StatTile.jsx";

// Resume a tabela de clientes em alguns números que cabem numa olhada — mesmo racional do
// TeamPerformanceCards, só que por cliente: quem gera mais demanda e quem está pior/melhor
// em resolução, pra apontar onde vale a pena investigar primeiro.
export function ClientePerformancePanel({ porCliente, onAbrirGeral, onAbrirCliente }) {
  const clientes = (porCliente ?? []).filter((c) => c.cliente !== "Não informado");
  if (clientes.length === 0) return null;

  const totalChamados = clientes.reduce((soma, c) => soma + c.total, 0);
  const totalConcluidos = clientes.reduce((soma, c) => soma + (c.concluidos ?? 0), 0);
  const percentualMedio = totalChamados ? Math.round((totalConcluidos / totalChamados) * 1000) / 10 : 0;

  const destaqueVolume = [...clientes].sort((a, b) => b.total - a.total)[0];
  const comAmostra = clientes.filter((c) => c.total >= 3 && c.percentualResolucao !== null);
  const melhorResolucao = [...comAmostra].sort((a, b) => (b.percentualResolucao ?? 0) - (a.percentualResolucao ?? 0))[0];
  const piorResolucao = [...comAmostra].sort((a, b) => (a.percentualResolucao ?? 0) - (b.percentualResolucao ?? 0))[0];

  return (
    <div className="panel full-width">
      <h2>Performance por cliente</h2>
      <p className="subtitle">Resumo de demanda e resolução por cliente — clique num card pra ver os chamados</p>
      <section className="stat-grid">
        <StatTile label="Clientes ativos no período" value={clientes.length} onClick={onAbrirGeral} />
        <StatTile
          label="% de resolução médio"
          value={`${percentualMedio}%`}
          statusClass={percentualMedio >= 80 ? "status-good" : undefined}
          onClick={onAbrirGeral}
        />
        <StatTile
          label="Maior volume"
          value={destaqueVolume ? destaqueVolume.cliente : "—"}
          meta={destaqueVolume ? `${destaqueVolume.total} chamados` : undefined}
          onClick={destaqueVolume && onAbrirCliente ? () => onAbrirCliente(destaqueVolume.cliente) : undefined}
        />
        <StatTile
          label="Melhor % de resolução"
          value={melhorResolucao ? melhorResolucao.cliente : "—"}
          meta={melhorResolucao ? `${melhorResolucao.percentualResolucao}% (${melhorResolucao.total} chamados)` : undefined}
          statusClass="status-good"
          onClick={melhorResolucao && onAbrirCliente ? () => onAbrirCliente(melhorResolucao.cliente) : undefined}
        />
        <StatTile
          label="Pior % de resolução"
          value={piorResolucao ? piorResolucao.cliente : "—"}
          meta={piorResolucao ? `${piorResolucao.percentualResolucao}% (${piorResolucao.total} chamados)` : undefined}
          statusClass={piorResolucao && piorResolucao.percentualResolucao < 50 ? "status-warning" : undefined}
          onClick={piorResolucao && onAbrirCliente ? () => onAbrirCliente(piorResolucao.cliente) : undefined}
        />
      </section>
    </div>
  );
}
