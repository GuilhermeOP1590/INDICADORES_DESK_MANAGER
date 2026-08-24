// frontend/src/lib/exportExcel.js
import * as XLSX from "xlsx";

// Gera um .xlsx a partir de uma lista de objetos + definição de colunas (chave no objeto +
// título de exibição) e dispara o download no navegador — usado em toda tela de drill-down
// que o usuário navegar (lista de chamados, ranking de lojas por nível, etc).
export function exportarLinhas(linhas, colunas, nomeArquivo) {
  const linhasFormatadas = linhas.map((linha) => {
    const linhaFormatada = {};
    for (const coluna of colunas) {
      linhaFormatada[coluna.titulo] = linha[coluna.chave] ?? "";
    }
    return linhaFormatada;
  });

  const planilha = XLSX.utils.json_to_sheet(linhasFormatadas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Dados");
  XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
}
