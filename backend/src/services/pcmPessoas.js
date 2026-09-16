// backend/src/services/pcmPessoas.js
import { getSupabaseClient } from "./supabaseClient.js";

let cacheGrupos = null;
let cachePessoasGrupo = null; // Map<pessoa, grupo>

export async function inicializar() {
  const supabase = getSupabaseClient();
  const [{ data: grupos, error: erroGrupos }, { data: pessoas, error: erroPessoas }] = await Promise.all([
    supabase.from("pcm_grupos").select("nome").order("nome"),
    supabase.from("pcm_pessoas_grupo").select("chave_pessoa, grupo"),
  ]);

  if (erroGrupos) throw erroGrupos;
  if (erroPessoas) throw erroPessoas;

  cacheGrupos = grupos.map((g) => g.nome);
  cachePessoasGrupo = new Map(pessoas.map((p) => [p.chave_pessoa, p.grupo]));
  return { grupos: cacheGrupos, pessoasGrupo: cachePessoasGrupo };
}

export function listarGrupos() {
  return cacheGrupos ?? [];
}

export function listarPessoasGrupo() {
  return cachePessoasGrupo ?? new Map();
}

export function grupoDaPessoa(pessoa, pessoasGrupo = listarPessoasGrupo()) {
  if (!pessoa) return null;
  return pessoasGrupo.get(pessoa) ?? null;
}

// Pura — nome não vazio e sem duplicata exata. Mesma regra usada por adicionarGrupo() em
// ConfiguracaoEquipamentos.jsx, só que aqui persiste em tabela em vez de array num blob.
export function deveCriarGrupo(gruposAtuais, nome) {
  const nomeTrim = (nome ?? "").trim();
  return Boolean(nomeTrim) && !gruposAtuais.includes(nomeTrim);
}

export async function criarGrupo(nome) {
  if (!deveCriarGrupo(listarGrupos(), nome)) return listarGrupos();

  const nomeTrim = nome.trim();
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("pcm_grupos").insert({ nome: nomeTrim });
  if (error) throw error;

  cacheGrupos = [...listarGrupos(), nomeTrim].sort((a, b) => a.localeCompare(b));
  return cacheGrupos;
}

export async function definirGrupoDaPessoa(pessoa, grupo) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("pcm_pessoas_grupo")
    .upsert({ chave_pessoa: pessoa, grupo, atualizado_em: new Date().toISOString() });
  if (error) throw error;

  const novoMapa = new Map(listarPessoasGrupo());
  novoMapa.set(pessoa, grupo);
  cachePessoasGrupo = novoMapa;
  return cachePessoasGrupo;
}
