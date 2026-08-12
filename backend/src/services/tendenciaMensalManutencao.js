// Agrega chamados de Manutenção por mês de criação (AAAA-MM) — diferente de icsEquipamento.js,
// que agrupa por Ic e só olha o subconjunto com Ic identificado, aqui é TODO chamado do período,
// pra dar o quadro completo de custo/tempo aguardando peça (base pra cobrar o time de suprimentos).
export function buildTendenciaMensal(chamados, historicoMap) {
  const porMes = new Map();

  for (const chamado of chamados) {
    if (!chamado.DataCriacao) continue;
    const mes = chamado.DataCriacao.slice(0, 7);
    const historico = historicoMap.get(chamado.Chave);
    const valor = historico?.valorAprovacao ?? 0;
    const tempoAguardandoPeca = historico?.tempoAguardandoPecaDias ?? 0;

    const atual = porMes.get(mes) || { mes, valorPreventiva: 0, valorCorretiva: 0, tempoAguardandoPecaDias: 0 };
    if (chamado.tipo === "Preventiva") atual.valorPreventiva += valor;
    if (chamado.tipo === "Corretiva") atual.valorCorretiva += valor;
    atual.tempoAguardandoPecaDias += tempoAguardandoPeca;
    porMes.set(mes, atual);
  }

  return [...porMes.values()]
    .map((item) => ({
      ...item,
      valorPreventiva: Math.round(item.valorPreventiva * 100) / 100,
      valorCorretiva: Math.round(item.valorCorretiva * 100) / 100,
      tempoAguardandoPecaDias: Math.round(item.tempoAguardandoPecaDias * 10) / 10,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}
