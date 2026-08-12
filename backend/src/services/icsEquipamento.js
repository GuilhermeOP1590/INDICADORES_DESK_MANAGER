import { parseDateTime } from "./indicadores.js";

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
      horaCriacao: chamado.HoraCriacao ?? null,
      dataFinalizacao: chamado.DataFinalizacao ?? null,
      horaFinalizacao: chamado.HoraFinalizacao ?? null,
      tipo: chamado.tipo,
      causa: historico?.causa ?? null,
      valorAprovacao: historico?.valorAprovacao ?? null,
      horimetro: historico?.horimetro ?? null,
      cliente: chamado.cliente ?? null,
      status: chamado.NomeStatus ?? null,
      tempoAguardandoPecaDias: historico?.tempoAguardandoPecaDias ?? 0,
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
      const decomposicaoMttr = calcularDecomposicaoMttr(ordenados.filter((c) => c.tipo === "Corretiva"));

      return {
        ic,
        total: ordenados.length,
        cliente: clienteMaisFrequente(ordenados),
        preventiva,
        corretiva,
        custoTotal,
        recorrenciaDias: calcularRecorrenciaDias(ordenados.map((c) => c.dataCriacao).filter(Boolean)),
        mttfHoras: calcularMttfHoras(ordenados.filter((c) => c.tipo === "Corretiva")),
        mttrHoras: decomposicaoMttr?.mttrHoras ?? null,
        mttrAguardandoPecaHoras: decomposicaoMttr?.mttrAguardandoPecaHoras ?? null,
        mttrReparoHoras: decomposicaoMttr?.mttrReparoHoras ?? null,
        tempoAguardandoPecaDiasTotal:
          Math.round(ordenados.reduce((soma, c) => soma + (c.tempoAguardandoPecaDias ?? 0), 0) * 10) / 10,
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

// Horímetro é cumulativo — uma leitura menor que a anterior é erro de cadastro, não o
// equipamento "voltando no tempo". Descarta a leitura inteira (não só o delta), senão o
// próximo delta também sai errado. `corretivas` já vem ordenado por data (herda a ordem de
// `ordenados`).
function calcularMttfHoras(corretivas) {
  const leituras = [];
  for (const c of corretivas) {
    if (c.horimetro === null) continue;
    const valor = Number(c.horimetro);
    if (Number.isNaN(valor)) continue;
    if (leituras.length === 0 || valor > leituras[leituras.length - 1]) {
      leituras.push(valor);
    }
  }

  if (leituras.length < 2) return null;

  const deltas = [];
  for (let i = 1; i < leituras.length; i++) {
    deltas.push(leituras[i] - leituras[i - 1]);
  }
  return Math.round((deltas.reduce((soma, d) => soma + d, 0) / deltas.length) * 10) / 10;
}

// Não desconta tempo em "Aguardando Aprovação" — abertura→finalização direto, mesmo padrão de
// tempoResolucaoHoras usado no resto do backend. Além do total (mttrHoras, igual antes),
// decompõe em espera de peça x reparo de fato, usando o tempoAguardandoPecaDias que cada
// `linha` já carrega desde a feature de MTTF/MTTR.
function calcularDecomposicaoMttr(corretivas) {
  const partes = [];
  for (const c of corretivas) {
    if (!c.dataFinalizacao || c.dataFinalizacao === "0000-00-00") continue;
    const inicio = parseDateTime(c.dataCriacao, c.horaCriacao);
    const fim = parseDateTime(c.dataFinalizacao, c.horaFinalizacao);
    if (!inicio || !fim) continue;
    const totalHoras = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    if (totalHoras < 0) continue;
    // min() protege contra tempoAguardandoPecaDias maior que o total do chamado (inconsistência
    // de dados) gerar reparoHoras negativo.
    const esperaPecaHoras = Math.min((c.tempoAguardandoPecaDias ?? 0) * 24, totalHoras);
    partes.push({ totalHoras, esperaPecaHoras, reparoHoras: totalHoras - esperaPecaHoras });
  }

  if (partes.length === 0) return null;

  const media = (campo) => Math.round((partes.reduce((soma, p) => soma + p[campo], 0) / partes.length) * 10) / 10;
  return {
    mttrHoras: media("totalHoras"),
    mttrAguardandoPecaHoras: media("esperaPecaHoras"),
    mttrReparoHoras: media("reparoHoras"),
  };
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
