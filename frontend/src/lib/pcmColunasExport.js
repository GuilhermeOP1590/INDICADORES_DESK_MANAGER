// frontend/src/lib/pcmColunasExport.js

// Mesmas colunas pros dois botões de exportar (grupo inteiro e pessoa) — o payload de
// /api/pcm/atribuicoes já traz todos esses campos, sem custo extra de API por chamado.
export const COLUNAS_EXPORT_PCM = [
  { chave: "codChamado", titulo: "Código" },
  { chave: "assunto", titulo: "Assunto" },
  { chave: "descricaoAbertura", titulo: "Descrição de abertura" },
  { chave: "solicitante", titulo: "Solicitante" },
  { chave: "cliente", titulo: "Loja/Cliente" },
  { chave: "uf", titulo: "UF" },
  { chave: "especialidade", titulo: "Especialidade" },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "dataCriacao", titulo: "Data de criação" },
  { chave: "status", titulo: "Status do chamado" },
  { chave: "origemLabel", titulo: "Origem da atribuição" },
  { chave: "pessoa", titulo: "Distribuição" },
  { chave: "grupo", titulo: "Grupo" },
  { chave: "urgencia", titulo: "Urgência" },
  { chave: "observacao", titulo: "Observação do PCM" },
  { chave: "dataPrevistaSolucao", titulo: "Data prevista de solução" },
  { chave: "statusPrazo", titulo: "Status de prazo" },
];

// exportarLinhas usa `linha[coluna.chave]` direto — como "origem" no payload é "pcm"/"sistema"
// (valor técnico), preparamos "origemLabel" com o texto legível antes de exportar.
export function prepararLinhasExportPcm(chamados) {
  return chamados.map((c) => ({
    ...c,
    origemLabel: c.origem === "pcm" ? "Atribuído pelo PCM" : "Distribuído pelo sistema",
  }));
}
