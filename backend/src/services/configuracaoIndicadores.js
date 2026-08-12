import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const PASTA_DADOS = path.join(process.cwd(), "data");
const ARQUIVO = path.join(PASTA_DADOS, "configuracao-indicadores.json");

// Derivado da distribuição real de status observada em 2026-08-11 (ver Obsidian).
// "Aguardando Aprovação" fica fora de aberto/concluído de propósito — não pode contar negativamente
// enquanto o orçamento não é avaliado.
const PADRAO = {
  statusConcluido: ["Resolvido", "Recebido/Entregue"],
  statusAguardandoAprovacao: ["Aguardando Aprovação"],
  statusAberto: [
    "Aguardando Atendimento",
    "Em Andamento",
    "Em Atendimento",
    "Pendente",
    "Transferência de Chamado",
    "Aguardando Peça do Estoque",
    "Peça Enviada para Loja",
    "Aguardando Cliente",
    "Aguardando Devolução",
    "Aguardando Fornecedor",
  ],
};

export function lerConfiguracao() {
  if (!existsSync(ARQUIVO)) return PADRAO;
  try {
    const salvo = JSON.parse(readFileSync(ARQUIVO, "utf-8"));
    return { ...PADRAO, ...salvo };
  } catch {
    return PADRAO;
  }
}

export function salvarConfiguracao(config) {
  if (!existsSync(PASTA_DADOS)) mkdirSync(PASTA_DADOS, { recursive: true });
  const novaConfig = {
    statusConcluido: config.statusConcluido ?? PADRAO.statusConcluido,
    statusAguardandoAprovacao: config.statusAguardandoAprovacao ?? PADRAO.statusAguardandoAprovacao,
    statusAberto: config.statusAberto ?? PADRAO.statusAberto,
  };
  writeFileSync(ARQUIVO, JSON.stringify(novaConfig, null, 2));
  return novaConfig;
}

export function classificarStatus(status, config = lerConfiguracao()) {
  if (config.statusConcluido.includes(status)) return "concluido";
  if (config.statusAguardandoAprovacao.includes(status)) return "aguardandoAprovacao";
  if (config.statusAberto.includes(status)) return "aberto";
  return "outro";
}
