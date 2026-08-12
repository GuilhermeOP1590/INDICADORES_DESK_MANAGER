// Agrupa chamados de Manutenção por Ic (equipamento específico do catálogo de Ativos do
// DeskManager, ex: "300 - MTZ - Empilhadeira 06") — granularidade mais fina que "grupo de
// equipamento" (configuracaoEquipamentos.js), que agrupa por categoria, não por unidade física.
// Só considera chamados cujo Ic foi preenchido na interação (historicoMap vem de
// historicoChamado.js#obterHistoricoEmLote) — nem todo chamado tem.
export function buildPorIc(chamados, historicoMap) {
  const porIc = new Map();

  for (const chamado of chamados) {
    const historico = historicoMap.get(chamado.Chave);
    const ics = historico?.ics ?? [];
    if (ics.length === 0) continue;

    const linha = {
      chave: chamado.Chave,
      codChamado: chamado.CodChamado,
      dataCriacao: chamado.DataCriacao,
      tipo: chamado.tipo,
      causa: historico?.causa ?? null,
      valorAprovacao: historico?.valorAprovacao ?? null,
      horimetro: historico?.horimetro ?? null,
      cliente: chamado.cliente ?? null,
    };

    for (const ic of ics) {
      const atual = porIc.get(ic) || { ic, chamados: [] };
      atual.chamados.push(linha);
      porIc.set(ic, atual);
    }
  }

  return [...porIc.values()]
    .map(({ ic, chamados: lista }) => {
      const ordenados = [...lista].sort((a, b) => (a.dataCriacao ?? "").localeCompare(b.dataCriacao ?? ""));
      const preventiva = ordenados.filter((c) => c.tipo === "Preventiva").length;
      const corretiva = ordenados.filter((c) => c.tipo === "Corretiva").length;
      const custoTotal = Math.round(ordenados.reduce((soma, c) => soma + (c.valorAprovacao ?? 0), 0) * 100) / 100;

      return {
        ic,
        total: ordenados.length,
        cliente: clienteMaisFrequente(ordenados),
        preventiva,
        corretiva,
        custoTotal,
        recorrenciaDias: calcularRecorrenciaDias(ordenados.map((c) => c.dataCriacao).filter(Boolean)),
        chamados: ordenados,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// Em geral o Ic pertence a 1 só cliente/loja — usa o mais frequente no histórico pra absorver
// alguma inconsistência de cadastro (ex: chamado registrado no cliente errado) sem exigir
// resolução manual.
function clienteMaisFrequente(lista) {
  const contagem = new Map();
  for (const { cliente } of lista) {
    if (!cliente) continue;
    contagem.set(cliente, (contagem.get(cliente) ?? 0) + 1);
  }
  if (contagem.size === 0) return null;
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function calcularRecorrenciaDias(datasOrdenadasIso) {
  if (datasOrdenadasIso.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < datasOrdenadasIso.length; i++) {
    const anterior = new Date(datasOrdenadasIso[i - 1]);
    const atual = new Date(datasOrdenadasIso[i]);
    gaps.push((atual.getTime() - anterior.getTime()) / (1000 * 60 * 60 * 24));
  }
  return Math.round((gaps.reduce((soma, g) => soma + g, 0) / gaps.length) * 10) / 10;
}
