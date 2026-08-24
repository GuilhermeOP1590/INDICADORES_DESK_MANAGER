// backend/src/services/slaNivel.js
import { classificarStatus, lerConfiguracao } from "./configuracaoIndicadores.js";

// NomePrioridade do DeskManager já vem formatado como "N - Nome" (ex: "1 - Muito Alta",
// "4 - Baixa") — o dígito inicial É o nível de SLA (1 = mais crítico, 5 = menos crítico),
// confirmado com o usuário. Não existe nenhum outro campo de prazo/vencimento no Desk.
export function parseSlaNivel(nomePrioridade) {
  if (!nomePrioridade) return { slaNivel: null, slaNivelLabel: null };

  const match = /^(\d+)\s*-\s*(.+)$/.exec(nomePrioridade.trim());
  if (!match) return { slaNivel: null, slaNivelLabel: null };

  return { slaNivel: Number(match[1]), slaNivelLabel: match[2].trim() };
}

export function buildPorNivel(chamados) {
  const config = lerConfiguracao();
  const porNivel = new Map();

  for (const c of chamados) {
    if (c.slaNivel == null) continue;

    const atual = porNivel.get(c.slaNivel) || {
      nivel: c.slaNivel,
      label: c.slaNivelLabel,
      total: 0,
      abertos: 0,
      fechados: 0,
      concluidos: 0,
    };
    atual.total += 1;

    const classe = classificarStatus(c.NomeStatus, config);
    if (classe === "concluido") {
      atual.concluidos += 1;
      atual.fechados += 1;
    } else if (classe === "aberto") {
      atual.abertos += 1;
    }
    // classe "outro" (status marcado como "Ignorar") só soma no total, não em abertos/concluidos.

    porNivel.set(c.slaNivel, atual);
  }

  return [...porNivel.values()]
    .map((n) => {
      const avaliados = n.concluidos + n.abertos;
      return { ...n, percentualResolucao: avaliados ? Math.round((n.concluidos / avaliados) * 1000) / 10 : null };
    })
    .sort((a, b) => a.nivel - b.nivel);
}
