function valorDe(historicoMap, chamado) {
  return historicoMap.get(chamado.Chave)?.valorAprovacao ?? 0;
}

function somarValor(lista, historicoMap) {
  return Math.round(lista.reduce((soma, c) => soma + valorDe(historicoMap, c), 0) * 100) / 100;
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

function agruparPorLabel(lista, historicoMap, chaveFn) {
  const mapa = new Map();
  for (const c of lista) {
    const label = chaveFn(c);
    if (!label) continue;
    const atual = mapa.get(label) || { label, total: 0, valor: 0 };
    atual.total += 1;
    atual.valor += valorDe(historicoMap, c);
    mapa.set(label, atual);
  }
  return [...mapa.values()].map((item) => ({ ...item, valor: arredondar(item.valor) })).sort((a, b) => b.valor - a.valor);
}

// Agrupa aguardando+avaliados juntos por uma chave (uf ou cliente) — dá a visão "quanto de
// orçamento (pendente + já avaliado) essa região/unidade concentra", pra guiar decisão.
function agruparOrcamentoPor(aguardando, avaliados, historicoMap, nomeCampo, chaveFn, extra) {
  const mapa = new Map();

  function acumular(c, bucket) {
    const chave = chaveFn(c);
    if (!chave) return;
    const atual = mapa.get(chave) || {
      [nomeCampo]: chave,
      ...(extra ? extra(c) : {}),
      aguardandoTotal: 0,
      aguardandoValor: 0,
      avaliadosTotal: 0,
      avaliadosValor: 0,
    };
    const valor = valorDe(historicoMap, c);
    if (bucket === "aguardando") {
      atual.aguardandoTotal += 1;
      atual.aguardandoValor += valor;
    } else {
      atual.avaliadosTotal += 1;
      atual.avaliadosValor += valor;
    }
    mapa.set(chave, atual);
  }

  aguardando.forEach((c) => acumular(c, "aguardando"));
  avaliados.forEach((c) => acumular(c, "avaliados"));

  return [...mapa.values()]
    .map((item) => ({
      ...item,
      aguardandoValor: arredondar(item.aguardandoValor),
      avaliadosValor: arredondar(item.avaliadosValor),
    }))
    .sort((a, b) => b.aguardandoValor + b.avaliadosValor - (a.aguardandoValor + a.avaliadosValor));
}

// Ledger cronológico de aprovações — cada chamado que passou por Aguardando Aprovação e já
// foi avaliado, com a data/hora em que o valor foi lançado (ver historicoChamado.js).
function buildHistoricoAprovacoes(avaliados, historicoMap) {
  return avaliados
    .map((c) => {
      const h = historicoMap.get(c.Chave) ?? {};
      return {
        chave: c.Chave,
        codChamado: c.CodChamado,
        assunto: c.Assunto,
        status: c.NomeStatus,
        cliente: c.cliente,
        uf: c.uf,
        causa: h.causa ?? null,
        valor: h.valorAprovacao ?? 0,
        dataAprovacao: h.dataAprovacao ?? null,
      };
    })
    .filter((item) => item.dataAprovacao)
    .sort((a, b) => b.dataAprovacao.localeCompare(a.dataAprovacao));
}

export function buildOrcamento(chamados, historicoMap) {
  const aguardando = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação");
  const avaliados = chamados.filter(
    (c) => historicoMap.get(c.Chave)?.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação"
  );

  return {
    totalChamados: chamados.length,
    aguardando: { total: aguardando.length, valor: somarValor(aguardando, historicoMap) },
    avaliados: { total: avaliados.length, valor: somarValor(avaliados, historicoMap) },
    // causa só existe pra chamado já resolvido (registrada no fechamento) — fica avaliados-only.
    // tipo/tipoAtividade é taxonomia definida na criação do chamado, então existe pra aguardando
    // também. Engenharia não usa "tipo" (é sempre Corretiva) — o classificador real de Engenharia
    // é tipoAtividade (Elétrica, Hidráulica, Serralheria...), por isso a escolha condicional abaixo.
    porCausa: agruparPorLabel(avaliados, historicoMap, (c) => historicoMap.get(c.Chave)?.causa),
    porTipo: agruparOrcamentoPor(
      aguardando,
      avaliados,
      historicoMap,
      "tipo",
      (c) => (c.especialidade === "Engenharia" ? c.tipoAtividade : c.tipo) || "Não classificado"
    ),
    porUf: agruparOrcamentoPor(aguardando, avaliados, historicoMap, "uf", (c) => c.uf || "Não informado"),
    porCliente: agruparOrcamentoPor(
      aguardando,
      avaliados,
      historicoMap,
      "cliente",
      (c) => c.cliente || "Não informado",
      (c) => ({ uf: c.uf || null })
    ),
    historicoAprovacoes: buildHistoricoAprovacoes(avaliados, historicoMap),
  };
}
