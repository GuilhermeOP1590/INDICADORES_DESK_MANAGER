// backend/src/services/tendenciaMensalCausa.js

// Agrega o valor aprovado por mês DA APROVAÇÃO (não da criação do chamado) e por causa — dá a
// série mensal de "quanto custou cada causa" (ex: Mau uso), complementar ao total acumulado do
// período que buildOrcamento#porCausa já cobre.
export function buildTendenciaMensalPorCausa(chamados, historicoMap) {
  const porMesCausa = new Map(); // "AAAA-MM|causa" -> {mes, causa, valor, total}
  const causasSet = new Set();

  for (const c of chamados) {
    const h = historicoMap.get(c.Chave);
    const causa = h?.causa;
    const dataAprovacao = h?.dataAprovacao;
    if (!causa || !dataAprovacao) continue;

    causasSet.add(causa);
    const mes = dataAprovacao.slice(0, 7);
    const chave = `${mes}|${causa}`;
    const atual = porMesCausa.get(chave) || { mes, causa, valor: 0, total: 0 };
    atual.valor += h.valorAprovacao ?? 0;
    atual.total += 1;
    porMesCausa.set(chave, atual);
  }

  return {
    causas: [...causasSet].sort(),
    porMes: [...porMesCausa.values()]
      .map((item) => ({ ...item, valor: Math.round(item.valor * 100) / 100 }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}
