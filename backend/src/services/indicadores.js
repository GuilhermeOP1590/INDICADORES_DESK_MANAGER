function isFinalizado(chamado) {
  return Boolean(chamado.DataFinalizacao) && chamado.DataFinalizacao !== "0000-00-00";
}

function parseDateTime(data, hora) {
  if (!data || data === "0000-00-00") return null;
  const parsed = new Date(`${data}T${hora || "00:00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function groupCount(chamados, keyFn) {
  const counts = new Map();
  for (const chamado of chamados) {
    const key = keyFn(chamado) || "Não informado";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function buildVolume(chamados) {
  const abertos = chamados.filter((c) => !isFinalizado(c)).length;
  const fechados = chamados.length - abertos;

  return {
    total: chamados.length,
    abertos,
    fechados,
    porDia: groupCount(chamados, (c) => c.DataCriacao).sort((a, b) => a.label.localeCompare(b.label)),
    porStatus: groupCount(chamados, (c) => c.NomeStatus),
  };
}

function buildSla(chamados) {
  const finalizados = chamados.filter(isFinalizado);

  const temposResolucaoHoras = finalizados
    .map((c) => {
      const inicio = parseDateTime(c.DataCriacao, c.HoraCriacao);
      const fim = parseDateTime(c.DataFinalizacao, c.HoraFinalizacao);
      if (!inicio || !fim) return null;
      return (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    })
    .filter((horas) => horas !== null && horas >= 0);

  const tempoMedioResolucaoHoras = temposResolucaoHoras.length
    ? temposResolucaoHoras.reduce((sum, h) => sum + h, 0) / temposResolucaoHoras.length
    : null;

  const comSla1 = chamados.filter((c) => c.Sla1Expirado === "N" || c.Sla1Expirado === "S");
  const comSla2 = chamados.filter((c) => c.Sla2Expirado === "N" || c.Sla2Expirado === "S");

  const sla1CumpridoPct = comSla1.length
    ? (comSla1.filter((c) => c.Sla1Expirado === "N").length / comSla1.length) * 100
    : null;

  const sla2CumpridoPct = comSla2.length
    ? (comSla2.filter((c) => c.Sla2Expirado === "N").length / comSla2.length) * 100
    : null;

  return {
    tempoMedioResolucaoHoras,
    sla1CumpridoPct,
    sla2CumpridoPct,
    amostraTempoResolucao: temposResolucaoHoras.length,
  };
}

function buildOperadores(chamados) {
  const porOperador = new Map();

  for (const c of chamados) {
    const nome = [c.NomeOperador, c.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador";
    const atual = porOperador.get(nome) || { operador: nome, total: 0, abertos: 0, fechados: 0 };
    atual.total += 1;
    if (isFinalizado(c)) {
      atual.fechados += 1;
    } else {
      atual.abertos += 1;
    }
    porOperador.set(nome, atual);
  }

  return [...porOperador.values()].sort((a, b) => b.total - a.total);
}

function buildCategorias(chamados) {
  return {
    porGrupo: groupCount(chamados, (c) => c.NomeGrupo),
    porPrioridade: groupCount(chamados, (c) => c.NomePrioridade),
    porTipo: groupCount(chamados, (c) => c.NomeTipo),
  };
}

export function buildIndicadores(chamados) {
  return {
    volume: buildVolume(chamados),
    sla: buildSla(chamados),
    operadores: buildOperadores(chamados),
    categorias: buildCategorias(chamados),
  };
}
