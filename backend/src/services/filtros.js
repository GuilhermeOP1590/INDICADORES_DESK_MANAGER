export function excluirCancelados(chamados) {
  return chamados.filter((chamado) => chamado.NomeStatus !== "Cancelado");
}

export function filtrarPorData(chamados, { dataInicio, dataFim } = {}) {
  if (!dataInicio && !dataFim) return chamados;

  return chamados.filter((chamado) => {
    const data = chamado.DataCriacao;
    if (!data) return false;
    if (dataInicio && data < dataInicio) return false;
    if (dataFim && data > dataFim) return false;
    return true;
  });
}

export function filtrarPorUf(chamados, uf) {
  if (!uf) return chamados;
  return chamados.filter((chamado) => chamado.uf === uf);
}

export function buscarPorTexto(chamados, q) {
  if (!q) return chamados;

  const termo = q.toLowerCase();
  return chamados.filter((chamado) => {
    const campos = [chamado.Assunto, chamado.equipamento, chamado.CodChamado];
    return campos.some((campo) => campo && campo.toLowerCase().includes(termo));
  });
}
