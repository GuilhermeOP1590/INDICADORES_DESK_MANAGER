import { classificarStatus, lerConfiguracao } from "./configuracaoIndicadores.js";

export function isFinalizado(chamado) {
  return Boolean(chamado.DataFinalizacao) && chamado.DataFinalizacao !== "0000-00-00";
}

export function parseDateTime(data, hora) {
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

// Cada ponto do dia mostra a composição do que foi criado naquele dia: quantos já foram
// resolvidos até agora (fechados) e quantos ainda seguem pendentes (abertos) — soma sempre
// bate com o total criado, então dá pra empilhar as duas séries num só gráfico.
function buildVolumePorDia(chamados) {
  const porDia = new Map();
  for (const c of chamados) {
    const key = c.DataCriacao || "Não informado";
    const atual = porDia.get(key) || { label: key, total: 0, fechados: 0, abertos: 0 };
    atual.total += 1;
    if (isFinalizado(c)) atual.fechados += 1;
    else atual.abertos += 1;
    porDia.set(key, atual);
  }
  return [...porDia.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function buildVolume(chamados) {
  const abertos = chamados.filter((c) => !isFinalizado(c)).length;
  const fechados = chamados.length - abertos;

  return {
    total: chamados.length,
    abertos,
    fechados,
    porDia: buildVolumePorDia(chamados),
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
  const config = lerConfiguracao();
  const porOperador = new Map();

  for (const c of chamados) {
    const nome = [c.NomeOperador, c.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador";
    const atual = porOperador.get(nome) || {
      operador: nome,
      total: 0,
      abertos: 0,
      fechados: 0,
      concluidos: 0,
      aguardandoAprovacao: 0,
    };
    atual.total += 1;

    const classe = classificarStatus(c.NomeStatus, config);
    if (classe === "concluido") {
      atual.concluidos += 1;
      atual.fechados += 1;
    } else if (classe === "aguardandoAprovacao") {
      atual.aguardandoAprovacao += 1;
    } else {
      atual.abertos += 1;
    }

    porOperador.set(nome, atual);
  }

  return [...porOperador.values()]
    .map((op) => {
      const avaliados = op.concluidos + op.abertos;
      return { ...op, percentualResolucao: avaliados ? Math.round((op.concluidos / avaliados) * 1000) / 10 : null };
    })
    .sort((a, b) => b.total - a.total);
}

function buildPorUf(chamados) {
  const config = lerConfiguracao();
  const porUf = new Map();

  for (const c of chamados) {
    const uf = c.uf || "Não informado";
    const atual = porUf.get(uf) || { uf, total: 0, abertos: 0, fechados: 0, concluidos: 0 };
    atual.total += 1;

    const classe = classificarStatus(c.NomeStatus, config);
    if (classe === "concluido") {
      atual.concluidos += 1;
      atual.fechados += 1;
    } else if (classe !== "aguardandoAprovacao") {
      atual.abertos += 1;
    }

    porUf.set(uf, atual);
  }

  return [...porUf.values()]
    .map((u) => {
      const avaliados = u.concluidos + u.abertos;
      return { ...u, percentualResolucao: avaliados ? Math.round((u.concluidos / avaliados) * 1000) / 10 : null };
    })
    .sort((a, b) => b.total - a.total);
}

function buildPorCliente(chamados) {
  const config = lerConfiguracao();
  const porCliente = new Map();

  for (const c of chamados) {
    const cliente = c.cliente || "Não informado";
    const atual = porCliente.get(cliente) || { cliente, total: 0, abertos: 0, fechados: 0, concluidos: 0 };
    atual.total += 1;

    const classe = classificarStatus(c.NomeStatus, config);
    if (classe === "concluido") {
      atual.concluidos += 1;
      atual.fechados += 1;
    } else if (classe !== "aguardandoAprovacao") {
      atual.abertos += 1;
    }

    porCliente.set(cliente, atual);
  }

  return [...porCliente.values()]
    .map((c) => {
      const avaliados = c.concluidos + c.abertos;
      return { ...c, percentualResolucao: avaliados ? Math.round((c.concluidos / avaliados) * 1000) / 10 : null };
    })
    .sort((a, b) => b.total - a.total);
}

function buildCategorias(chamados) {
  return {
    porGrupo: groupCount(chamados, (c) => c.NomeGrupo),
    porPrioridade: groupCount(chamados, (c) => c.NomePrioridade),
    porTipo: groupCount(chamados, (c) => c.NomeTipo),
  };
}

// Espera o campo "area" já anexado (ver enriquecimento.js#anexarArea) — usa a mesma
// classificação de taxonomia de Manutenção/Engenharia, só que sem descartar quem fica de
// fora do escopo (esses viram "Outras áreas" em vez de sumir).
function buildAreas(chamados) {
  const porArea = new Map();
  for (const c of chamados) {
    const area = c.area || "Outras áreas";
    const atual = porArea.get(area) || { area, total: 0, fechados: 0, abertos: 0 };
    atual.total += 1;
    if (isFinalizado(c)) atual.fechados += 1;
    else atual.abertos += 1;
    porArea.set(area, atual);
  }
  return [...porArea.values()].sort((a, b) => b.total - a.total);
}

// Backlog: chamados criados ANTES do início do período selecionado que ainda seguem em
// aberto — o que "sobrou" de ciclos anteriores e não aparece nos indicadores do período
// atual (esses já filtram por DataCriacao dentro do período). Recebe a lista já sem
// cancelados/filtros de uf/busca, mas SEM o corte por período (esse corte é feito aqui).
export function buildBacklog(chamados, periodo) {
  if (!periodo?.dataInicio) return { total: 0, porArea: [], porCliente: [] };

  const pendentes = chamados.filter(
    (c) => c.DataCriacao && c.DataCriacao !== "0000-00-00" && c.DataCriacao < periodo.dataInicio && !isFinalizado(c)
  );

  return {
    total: pendentes.length,
    porArea: groupCount(pendentes, (c) => c.area),
    porCliente: groupCount(pendentes, (c) => c.cliente).slice(0, 10),
  };
}

// "tipo" só existe pra chamados de Manutenção (ver enriquecimento.js#anexarArea) — Engenharia
// e "Outras áreas" ficam de fora dos baldes abaixo, então os cards que usam isso pra filtrar
// (ex: performance por cliente) representam só a fatia de Manutenção quando um tipo é escolhido.
const TIPOS_FILTRAVEIS = ["Preventiva", "Corretiva", "Rotina", "Segurança"];

function buildPorClientePorTipo(chamados) {
  const porTipo = {};
  for (const tipo of TIPOS_FILTRAVEIS) {
    porTipo[tipo] = buildPorCliente(chamados.filter((c) => c.tipo === tipo));
  }
  return porTipo;
}

export function buildIndicadores(chamados) {
  return {
    volume: buildVolume(chamados),
    sla: buildSla(chamados),
    operadores: buildOperadores(chamados),
    categorias: buildCategorias(chamados),
    porUf: buildPorUf(chamados),
    porCliente: buildPorCliente(chamados),
    porClientePorTipo: buildPorClientePorTipo(chamados),
    areas: buildAreas(chamados),
  };
}
