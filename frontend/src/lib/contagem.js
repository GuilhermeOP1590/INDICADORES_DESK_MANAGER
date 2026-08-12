// Conta ocorrências de um campo num array de itens — usado pra mostrar "(N)" ao lado de
// cada opção de filtro, pra dar visão de quantidade antes de selecionar.
export function contagemPorCampo(itens, campo) {
  const mapa = new Map();
  for (const item of itens) {
    const valor = item[campo];
    if (!valor) continue;
    mapa.set(valor, (mapa.get(valor) || 0) + 1);
  }
  return mapa;
}
