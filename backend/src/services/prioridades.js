import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const PASTA_DADOS = path.join(process.cwd(), "data");
const ARQUIVO = path.join(PASTA_DADOS, "chamados-prioritarios.json");

const PADRAO = { chamados: [] };

export function lerPrioridades() {
  if (!existsSync(ARQUIVO)) return PADRAO;
  try {
    const salvo = JSON.parse(readFileSync(ARQUIVO, "utf-8"));
    return { chamados: salvo.chamados ?? [] };
  } catch {
    return PADRAO;
  }
}

export function salvarPrioridades(config) {
  if (!existsSync(PASTA_DADOS)) mkdirSync(PASTA_DADOS, { recursive: true });
  writeFileSync(ARQUIVO, JSON.stringify(config, null, 2));
  return config;
}

// Upsert por codChamado (trim) — se já existe, só atualiza a nota (mantém adicionadoEm
// original); se não existe, adiciona no fim. Pura (não toca em disco) pra poder testar sem
// depender do arquivo real.
export function aplicarUpsert(config, codChamado, nota) {
  const codigo = codChamado.trim();
  const existente = config.chamados.find((c) => c.codChamado === codigo);

  if (existente) {
    return {
      chamados: config.chamados.map((c) => (c.codChamado === codigo ? { ...c, nota: nota ?? "" } : c)),
    };
  }

  return {
    chamados: [...config.chamados, { codChamado: codigo, nota: nota ?? "", adicionadoEm: new Date().toISOString() }],
  };
}

export function aplicarRemocao(config, codChamado) {
  return { chamados: config.chamados.filter((c) => c.codChamado !== codChamado.trim()) };
}

export function adicionarOuAtualizarPrioridade(codChamado, nota) {
  return salvarPrioridades(aplicarUpsert(lerPrioridades(), codChamado, nota));
}

export function removerPrioridade(codChamado) {
  return salvarPrioridades(aplicarRemocao(lerPrioridades(), codChamado));
}
