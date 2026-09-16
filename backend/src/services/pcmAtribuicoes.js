// backend/src/services/pcmAtribuicoes.js
import { getSupabaseClient } from "./supabaseClient.js";

let cacheAtribuicoes = null; // Map<codChamado, {grupo, pessoa, urgencia, observacao, dataPrevistaSolucao}>

export async function inicializar() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pcm_atribuicoes_chamados")
    .select("cod_chamado, grupo, pessoa, urgencia, observacao, data_prevista_solucao");
  if (error) throw error;

  cacheAtribuicoes = new Map(
    data.map((a) => [
      a.cod_chamado,
      {
        grupo: a.grupo,
        pessoa: a.pessoa,
        urgencia: a.urgencia,
        observacao: a.observacao ?? "",
        dataPrevistaSolucao: a.data_prevista_solucao,
      },
    ])
  );
  return cacheAtribuicoes;
}

export function listarAtribuicoes() {
  return cacheAtribuicoes ?? new Map();
}

export function atribuicaoDoChamado(codChamado) {
  return listarAtribuicoes().get(codChamado) ?? null;
}

// Pura — decide quem "está com" o chamado hoje: a atribuição manual do PCM (se existir) tem
// prioridade; senão, usa a distribuição automática do sistema (distribuicaoSistema, já
// anexada ao chamado enriquecido) e resolve o grupo dessa pessoa via grupoDaPessoaFn.
export function resolverAtribuicaoEfetiva(chamado, atribuicaoPcm, grupoDaPessoaFn) {
  if (atribuicaoPcm) {
    return {
      origem: "pcm",
      pessoa: atribuicaoPcm.pessoa,
      grupo: atribuicaoPcm.grupo,
      urgencia: atribuicaoPcm.urgencia,
      observacao: atribuicaoPcm.observacao ?? "",
      dataPrevistaSolucao: atribuicaoPcm.dataPrevistaSolucao ?? null,
    };
  }

  const pessoa = chamado.distribuicaoSistema ?? null;
  return {
    origem: "sistema",
    pessoa,
    grupo: pessoa ? grupoDaPessoaFn(pessoa) ?? "Sem grupo definido" : "Sem grupo definido",
    urgencia: null,
    observacao: "",
    dataPrevistaSolucao: null,
  };
}

export async function salvarAtribuicao(codChamado, { grupo, pessoa, urgencia, observacao, dataPrevistaSolucao }) {
  const supabase = getSupabaseClient();
  const payload = {
    cod_chamado: codChamado,
    grupo,
    pessoa,
    urgencia,
    observacao: observacao ?? "",
    data_prevista_solucao: dataPrevistaSolucao ?? null,
    atualizado_em: new Date().toISOString(),
  };

  const { error } = await supabase.from("pcm_atribuicoes_chamados").upsert(payload);
  if (error) throw error;

  const novoMapa = new Map(listarAtribuicoes());
  novoMapa.set(codChamado, {
    grupo,
    pessoa,
    urgencia,
    observacao: observacao ?? "",
    dataPrevistaSolucao: dataPrevistaSolucao ?? null,
  });
  cacheAtribuicoes = novoMapa;
  return cacheAtribuicoes.get(codChamado);
}

const URGENCIAS_ORDEM = ["Crítica", "Alta", "Média", "Baixa", "Não classificado"];

function porUrgenciaVazio() {
  return Object.fromEntries(URGENCIAS_ORDEM.map((u) => [u, 0]));
}

// Consome linhas já no formato de `linhaAtribuicao` (ver pcm.js) — {grupo, pessoa, urgencia}.
export function buildIndicadorPorGrupo(linhas) {
  const porGrupo = new Map();

  for (const linha of linhas) {
    const atual =
      porGrupo.get(linha.grupo) || { grupo: linha.grupo, pessoas: new Set(), total: 0, porUrgencia: porUrgenciaVazio() };
    atual.total += 1;
    if (linha.pessoa) atual.pessoas.add(linha.pessoa);
    atual.porUrgencia[linha.urgencia ?? "Não classificado"] += 1;
    porGrupo.set(linha.grupo, atual);
  }

  return [...porGrupo.values()]
    .map((g) => ({ grupo: g.grupo, totalPessoas: g.pessoas.size, total: g.total, porUrgencia: g.porUrgencia }))
    .sort((a, b) => b.total - a.total);
}

export function buildIndicadorPorPessoa(linhas, grupo) {
  const porPessoa = new Map();

  for (const linha of linhas) {
    if (linha.grupo !== grupo) continue;
    const chave = linha.pessoa ?? "Sem pessoa";
    const atual = porPessoa.get(chave) || { pessoa: chave, total: 0, porUrgencia: porUrgenciaVazio() };
    atual.total += 1;
    atual.porUrgencia[linha.urgencia ?? "Não classificado"] += 1;
    porPessoa.set(chave, atual);
  }

  return [...porPessoa.values()].sort((a, b) => b.total - a.total);
}
