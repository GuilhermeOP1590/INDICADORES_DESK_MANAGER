// frontend/src/lib/filtrosColuna.js

// Filtro por coluna estilo Excel. Cada coluna declara `valor(linha)` (o texto que o usuário
// vê) e um `tipo`: "lista" filtra por um conjunto de valores marcados (checkboxes) e "texto"
// filtra por "contém" — usado em colunas de texto livre (assunto, observação), onde uma lista
// de milhares de valores únicos não ajudaria.
//
// Formato de `filtros`: { [chave]: Set<string> } para "lista" e { [chave]: string } para "texto".
// Chave ausente (ou Set vazio / texto vazio) = coluna sem filtro.

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filtroAtivo(coluna, filtro) {
  if (filtro === undefined || filtro === null) return false;
  return coluna.tipo === "texto" ? filtro.trim() !== "" : filtro.size > 0;
}

function passaNoFiltro(linha, coluna, filtro) {
  if (!filtroAtivo(coluna, filtro)) return true;
  const valor = coluna.valor(linha);
  return coluna.tipo === "texto" ? normalizar(valor).includes(normalizar(filtro)) : filtro.has(valor);
}

// `ignorarChave` permite calcular as opções de uma coluna considerando todos os OUTROS
// filtros (filtro cruzado): ao filtrar uma loja, a lista de Grupo só mostra grupos que têm
// chamado naquela loja — sem que a própria coluna esconda suas opções.
export function aplicarFiltrosColuna(linhas, colunas, filtros, ignorarChave = null) {
  const ativas = colunas.filter((c) => c.chave !== ignorarChave && filtroAtivo(c, filtros[c.chave]));
  if (ativas.length === 0) return linhas;
  return linhas.filter((linha) => ativas.every((c) => passaNoFiltro(linha, c, filtros[c.chave])));
}

export function opcoesDaColuna(linhas, coluna) {
  const contagem = new Map();
  for (const linha of linhas) {
    const valor = coluna.valor(linha);
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  const ordenar = coluna.ordenarOpcoes ?? ((a, b) => a.localeCompare(b, "pt-BR"));
  return [...contagem.entries()]
    .map(([valor, total]) => ({ valor, total }))
    .sort((a, b) => ordenar(a.valor, b.valor));
}

export function buscaNormalizada(texto) {
  return normalizar(texto);
}
