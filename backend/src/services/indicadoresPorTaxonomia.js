import { classificarStatus, lerConfiguracao } from "./configuracaoIndicadores.js";
import { grupoDoEquipamento, lerConfiguracaoEquipamentos } from "./configuracaoEquipamentos.js";
import { buildPorNivel } from "./slaNivel.js";
import { diasEmAberto } from "./indicadores.js";

function contarPor(chamados, keyFn) {
  const contagem = new Map();
  for (const chamado of chamados) {
    const chave = keyFn(chamado) ?? "Não informado";
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return [...contagem.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

export function agruparEquipamentos(chamados, config = lerConfiguracaoEquipamentos()) {
  const porGrupo = new Map();

  for (const chamado of chamados) {
    if (!chamado.equipamento) continue;
    const grupo = grupoDoEquipamento(chamado.equipamento, config);
    const atual = porGrupo.get(grupo) || { label: grupo, total: 0, itensMap: new Map() };
    atual.total += 1;
    atual.itensMap.set(chamado.equipamento, (atual.itensMap.get(chamado.equipamento) || 0) + 1);
    porGrupo.set(grupo, atual);
  }

  return [...porGrupo.values()]
    .map(({ label, total, itensMap }) => ({
      label,
      total,
      itens: [...itensMap.entries()]
        .map(([itemLabel, itemTotal]) => ({ label: itemLabel, total: itemTotal }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

function listarOperadores(chamados) {
  const config = lerConfiguracao();
  const porOperador = new Map();

  for (const chamado of chamados) {
    const nome = [chamado.NomeOperador, chamado.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador";
    const atual = porOperador.get(nome) || { operador: nome, total: 0, abertos: 0, fechados: 0, concluidos: 0 };
    atual.total += 1;

    const classe = classificarStatus(chamado.NomeStatus, config);
    if (classe === "concluido") {
      atual.concluidos += 1;
      atual.fechados += 1;
    } else if (classe === "aberto") {
      atual.abertos += 1;
    }
    // classe "outro" (status marcado como "Ignorar" em Configurações > Status) só soma no
    // total, não em abertos/concluidos — não pode nem ajudar nem prejudicar percentualResolucao.

    porOperador.set(nome, atual);
  }

  return [...porOperador.values()]
    .map((op) => {
      const avaliados = op.concluidos + op.abertos;
      return { ...op, percentualResolucao: avaliados ? Math.round((op.concluidos / avaliados) * 1000) / 10 : null };
    })
    .sort((a, b) => b.total - a.total);
}

function listarPorUf(chamados) {
  const config = lerConfiguracao();
  const porUf = new Map();

  for (const chamado of chamados) {
    const uf = chamado.uf || "Não informado";
    const atual = porUf.get(uf) || { uf, total: 0, abertos: 0, fechados: 0, concluidos: 0 };
    atual.total += 1;

    const classe = classificarStatus(chamado.NomeStatus, config);
    if (classe === "concluido") {
      atual.concluidos += 1;
      atual.fechados += 1;
    } else if (classe === "aberto") {
      atual.abertos += 1;
    }
    // classe "outro" só soma no total, não em abertos/concluidos.

    porUf.set(uf, atual);
  }

  return [...porUf.values()]
    .map((u) => {
      const avaliados = u.concluidos + u.abertos;
      return { ...u, percentualResolucao: avaliados ? Math.round((u.concluidos / avaliados) * 1000) / 10 : null };
    })
    .sort((a, b) => b.total - a.total);
}

export function listarPorCliente(chamados) {
  const config = lerConfiguracao();
  const porCliente = new Map();

  for (const chamado of chamados) {
    const cliente = chamado.cliente || "Não informado";
    const atual = porCliente.get(cliente) || { cliente, total: 0, abertos: 0, fechados: 0, concluidos: 0 };
    atual.total += 1;

    const classe = classificarStatus(chamado.NomeStatus, config);
    if (classe === "concluido") {
      atual.concluidos += 1;
      atual.fechados += 1;
    } else if (classe === "aberto") {
      atual.abertos += 1;
    }
    // classe "outro" só soma no total, não em abertos/concluidos.

    porCliente.set(cliente, atual);
  }

  return [...porCliente.values()]
    .map((c) => {
      const avaliados = c.concluidos + c.abertos;
      return { ...c, percentualResolucao: avaliados ? Math.round((c.concluidos / avaliados) * 1000) / 10 : null };
    })
    .sort((a, b) => b.total - a.total);
}

// Status real do Desk pra equipamento condenado (avaliado e reprovado pra uso, com laudo
// técnico anexado) — precisa de card e filtro próprios, direto (não passa pelos 3 baldes de
// classificarStatus, que são só sobre "resolvido/aberto/aguardando aprovação").
export const STATUS_CONDENADO = "Condenado e Laudo Anexo (Atenção)";

// Os 2 status do Desk que significam "chamado parado esperando peça" — mesmo par usado em
// historicoChamado.js#STATUS_AGUARDANDO_PECA pra medir tempo parado (aqui só contamos quantos
// chamados estão, agora, em um desses status — não quanto tempo levou).
export const STATUS_AGUARDANDO_PECA = ["Aguardando Peça do Estoque", "Peça Enviada para Loja"];

// Lista "achatada" de condenados pendentes — usada pela página /condenados, que não tem
// filtro de período (o objetivo é nunca perder de vista um condenado antigo). Ordena do mais
// parado pro mais recente: quem está esperando tratamento há mais tempo aparece primeiro.
export function buildCondenados(chamados, historicoMap, { hoje = new Date() } = {}) {
  const condenados = chamados.filter((c) => c.NomeStatus === STATUS_CONDENADO);

  const itens = condenados
    .map((c) => {
      const historico = historicoMap.get(c.Chave);
      return {
        chave: c.Chave,
        codChamado: c.CodChamado,
        assunto: c.Assunto,
        cliente: c.cliente ?? null,
        especialidade: c.especialidade ?? null,
        uf: c.uf ?? null,
        operador: [c.NomeOperador, c.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador",
        dataCriacao: c.DataCriacao,
        diasParado: diasEmAberto(c.DataCriacao, hoje),
        causa: historico?.causa ?? null,
        ics: historico?.ics ?? [],
      };
    })
    .sort((a, b) => (b.diasParado ?? 0) - (a.diasParado ?? 0));

  return {
    total: itens.length,
    diasParadoMaisAntigo: itens[0]?.diasParado ?? null,
    itens,
  };
}

// porCausa e aguardandoAprovacao.jaAvaliados só existem quando o chamado foi enriquecido
// com histórico de interações (campo `causa`/`passouPorAguardandoAprovacao`) — ver historicoChamado.js.
// Sem esse enriquecimento (rota rápida, sem custo de N chamadas ao MCP), ambos ficam null.
function detalheDoGrupo(chamados) {
  const temHistorico = chamados.some((c) => c.passouPorAguardandoAprovacao !== undefined);
  const aguardando = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação").length;
  const condenado = chamados.filter((c) => c.NomeStatus === STATUS_CONDENADO).length;
  const aguardandoPeca = chamados.filter((c) => STATUS_AGUARDANDO_PECA.includes(c.NomeStatus)).length;

  return {
    total: chamados.length,
    porEquipamento: contarPor(chamados, (chamado) => chamado.equipamento),
    porGrupoEquipamento: agruparEquipamentos(chamados),
    porCliente: contarPor(chamados, (chamado) => chamado.cliente),
    porNivel: buildPorNivel(chamados),
    porCausa: temHistorico ? contarPor(chamados.filter((c) => c.causa), (chamado) => chamado.causa) : null,
    condenado,
    aguardandoPeca,
    aguardandoAprovacao: {
      aguardando,
      jaAvaliados: temHistorico
        ? chamados.filter((c) => c.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação").length
        : null,
    },
    operadores: listarOperadores(chamados),
    porUf: listarPorUf(chamados),
    // Versão com abertos/fechados/% (igual porUf) — porCliente acima fica só {label,total}
    // porque já é consumido pelo gráfico "Por cliente" nessa forma.
    porClienteDetalhado: listarPorCliente(chamados),
  };
}

const TIPOS_MANUTENCAO = ["Preventiva", "Corretiva", "Rotina", "Segurança", "Outros/Não classificado"];

export function buildIndicadoresManutencao(chamadosManutencao) {
  const porTipoDetalhe = {};
  for (const tipo of TIPOS_MANUTENCAO) {
    const doTipo = chamadosManutencao.filter((chamado) => chamado.tipo === tipo);
    porTipoDetalhe[tipo] = detalheDoGrupo(doTipo);
  }

  return {
    total: chamadosManutencao.length,
    porTipo: contarPor(chamadosManutencao, (chamado) => chamado.tipo),
    geral: detalheDoGrupo(chamadosManutencao),
    porTipoDetalhe,
  };
}

export function buildIndicadoresEngenharia(chamadosEngenharia) {
  const tipos = [...new Set(chamadosEngenharia.map((chamado) => chamado.tipoAtividade))];

  const porAtividadeDetalhe = {};
  for (const tipo of tipos) {
    const doTipo = chamadosEngenharia.filter((chamado) => chamado.tipoAtividade === tipo);
    // Engenharia não tem dimensão "equipamento" — remove os campos pra não confundir o consumidor.
    const { porEquipamento, porGrupoEquipamento, ...resto } = detalheDoGrupo(doTipo);
    porAtividadeDetalhe[tipo] = resto;
  }

  const { porEquipamento, porGrupoEquipamento, ...geral } = detalheDoGrupo(chamadosEngenharia);

  return {
    total: chamadosEngenharia.length,
    porTipoAtividade: contarPor(chamadosEngenharia, (chamado) => chamado.tipoAtividade),
    geral,
    porAtividadeDetalhe,
  };
}
