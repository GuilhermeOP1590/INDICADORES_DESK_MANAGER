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
