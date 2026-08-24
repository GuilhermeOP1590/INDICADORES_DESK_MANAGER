// frontend/src/components/SlaNiveisPanel.jsx
import { StatTile } from "./StatTile.jsx";

const NIVEIS_ORDEM = [1, 2, 3, 4, 5];

export function SlaNiveisPanel({ porNivel, onSelecionarNivel }) {
  const porNivelMap = new Map((porNivel ?? []).map((n) => [n.nivel, n]));

  return (
    <section className="panel full-width">
      <h2>Chamados por nível de SLA</h2>
      <p className="subtitle">Nível 1 = mais crítico, nível 5 = planejado — clique num nível pra ver atividade e lojas</p>
      <div className="stat-grid">
        {NIVEIS_ORDEM.map((nivel) => {
          const dados = porNivelMap.get(nivel);
          return (
            <StatTile
              key={nivel}
              className={`sla-nivel-${nivel}`}
              label={dados ? `Nível ${nivel} — ${dados.label}` : `Nível ${nivel}`}
              value={dados?.abertos ?? 0}
              meta="Em aberto"
              onClick={dados ? () => onSelecionarNivel(nivel, dados.label) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
