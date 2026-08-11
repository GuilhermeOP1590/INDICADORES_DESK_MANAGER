function isFinalizado(chamado) {
  return Boolean(chamado.DataFinalizacao) && chamado.DataFinalizacao !== "0000-00-00";
}

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

function listarOperadores(chamados) {
  const porOperador = new Map();

  for (const chamado of chamados) {
    const nome = [chamado.NomeOperador, chamado.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador";
    const atual = porOperador.get(nome) || { operador: nome, total: 0, abertos: 0, fechados: 0 };
    atual.total += 1;
    if (isFinalizado(chamado)) {
      atual.fechados += 1;
    } else {
      atual.abertos += 1;
    }
    porOperador.set(nome, atual);
  }

  return [...porOperador.values()].sort((a, b) => b.total - a.total);
}

function detalheDoGrupo(chamados) {
  return {
    total: chamados.length,
    porEquipamento: contarPor(chamados, (chamado) => chamado.equipamento),
    porCliente: contarPor(chamados, (chamado) => chamado.cliente),
    operadores: listarOperadores(chamados),
  };
}

const TIPOS_MANUTENCAO = ["Preventiva", "Corretiva", "Rotina", "Outros/Não classificado"];

export function buildIndicadoresManutencao(chamadosManutencao) {
  const porTipoDetalhe = {};
  for (const tipo of TIPOS_MANUTENCAO) {
    const doTipo = chamadosManutencao.filter((chamado) => chamado.tipo === tipo);
    porTipoDetalhe[tipo] = detalheDoGrupo(doTipo);
  }

  return {
    total: chamadosManutencao.length,
    porTipo: contarPor(chamadosManutencao, (chamado) => chamado.tipo),
    porTipoDetalhe,
  };
}

export function buildIndicadoresEngenharia(chamadosEngenharia) {
  const tipos = [...new Set(chamadosEngenharia.map((chamado) => chamado.tipoAtividade))];

  const porAtividadeDetalhe = {};
  for (const tipo of tipos) {
    const doTipo = chamadosEngenharia.filter((chamado) => chamado.tipoAtividade === tipo);
    // Engenharia não tem dimensão "equipamento" — remove o campo pra não confundir o consumidor.
    const { porEquipamento, ...resto } = detalheDoGrupo(doTipo);
    porAtividadeDetalhe[tipo] = resto;
  }

  return {
    total: chamadosEngenharia.length,
    porTipoAtividade: contarPor(chamadosEngenharia, (chamado) => chamado.tipoAtividade),
    porAtividadeDetalhe,
  };
}
