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

// Amplia o início do período em N meses pra trás, mantendo o fim — usado quando o filtro real é
// por uma data derivada do histórico (aprovação/inserção do orçamento), que só é conhecida
// DEPOIS de buscar o histórico: sem ampliar a janela de criação, um chamado criado antes do
// período mas decidido/lançado dentro dele nunca entraria no conjunto buscado.
export function ampliarParaTras(periodo, meses) {
  if (!periodo.dataInicio) return periodo;
  const [ano, mes, dia] = periodo.dataInicio.split("-").map(Number);
  const data = new Date(ano, mes - 1 - meses, dia);
  const pad2 = (n) => String(n).padStart(2, "0");
  const dataInicio = `${data.getFullYear()}-${pad2(data.getMonth() + 1)}-${pad2(data.getDate())}`;
  return { ...periodo, dataInicio };
}

// Filtra por uma data derivada do histórico (dataAprovacao ou dataDecisao) em vez de
// DataCriacao — mesma lógica de filtrarPorData, só que a data vem do historicoMap.
export function filtrarPorDataHistorico(chamados, historicoMap, campo, { dataInicio, dataFim } = {}) {
  if (!dataInicio && !dataFim) return chamados;
  return chamados.filter((chamado) => {
    const data = historicoMap.get(chamado.Chave)?.[campo];
    if (!data) return false;
    if (dataInicio && data < dataInicio) return false;
    if (dataFim && data > dataFim) return false;
    return true;
  });
}
