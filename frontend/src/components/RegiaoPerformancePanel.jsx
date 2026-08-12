import { StatTile } from "./StatTile.jsx";

// Um card por UF (mesma lógica de "balde" aberto/concluído usada em todo o resto do app) —
// cards em vez de tabela porque hoje só existem 2-3 estados reais (MG, BA, SP), então dá
// pra comparar de relance sem precisar ler linha por linha.
export function RegiaoPerformancePanel({ porUf, onSelecionarUf }) {
  const regioes = (porUf ?? []).filter((u) => u.uf !== "Não informado");
  if (regioes.length === 0) return null;

  return (
    <div className="panel full-width">
      <h2>Performance por região (UF)</h2>
      <p className="subtitle">Resolvidos x em aberto por estado — clique num card pra ver os chamados</p>
      <section className="stat-grid">
        {regioes.map((u) => (
          <StatTile
            key={u.uf}
            label={u.uf}
            value={`${u.percentualResolucao}%`}
            meta={`${u.concluidos} resolvidos · ${u.abertos} em aberto · ${u.total} total`}
            statusClass={u.percentualResolucao >= 80 ? "status-good" : undefined}
            onClick={onSelecionarUf ? () => onSelecionarUf(u.uf) : undefined}
          />
        ))}
      </section>
    </div>
  );
}
