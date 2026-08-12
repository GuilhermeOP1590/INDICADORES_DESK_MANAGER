import { callDeskMcpTool } from "./deskMcp.js";

const TTL_MS = 15 * 60 * 1000;
const cache = new Map(); // chave -> { expiresAt, historico }

// "_8575" e "_9637" não são documentados — são os campos extras "Valor (R$)" e "Orçamento/Custo"
// (Tipo: Interações), descobertos via engenharia reversa do parâmetro Colunas da tool MCP
// dados_da_interacao_do_chamados. Ver docs/superpowers/... para o processo de descoberta.
const CAMPO_EXTRA_VALOR = "_8575";
const CAMPO_EXTRA_ORCAMENTO_CONFIRMADO = "_9637";

async function fetchInteracoes({ chave, codChamado }) {
  const data = await callDeskMcpTool("dados_da_interacao_do_chamados", {
    body: {
      Chave: chave,
      CodChamado: codChamado,
      Solicitante: true,
      Colunas: {
        Status: "on",
        CodCausa: "on",
        DataAcao: "on",
        [CAMPO_EXTRA_VALOR]: "on",
        [CAMPO_EXTRA_ORCAMENTO_CONFIRMADO]: "on",
      },
    },
  });
  return data.root ?? [];
}

// Interações vêm da mais recente pra mais antiga — a causa "vale" é a da última interação que a preencheu.
function extrairCausa(interacoes) {
  for (const interacao of interacoes) {
    const causa = interacao.CodCausa?.[0]?.text;
    if (causa) return causa;
  }
  return null;
}

function extrairPassouPorAguardandoAprovacao(interacoes) {
  return interacoes.some((interacao) => interacao.Status?.[0]?.text === "Aguardando Aprovação");
}

// "1.216,40" (formato BR) -> 1216.4
function parseValorBR(texto) {
  if (!texto) return null;
  const normalizado = texto.replace(/\./g, "").replace(",", ".");
  const valor = Number.parseFloat(normalizado);
  return Number.isNaN(valor) ? null : valor;
}

function extrairValorAprovacao(interacoes) {
  const comValor = interacoes.find((interacao) => interacao[CAMPO_EXTRA_VALOR]);
  return comValor ? parseValorBR(comValor[CAMPO_EXTRA_VALOR]) : null;
}

// "11-08-2026" (DataAcao, formato BR sem hora — a API não expõe hora por ação) -> "2026-08-11"
function paraIso(dataBR) {
  const [dia, mes, ano] = dataBR.split("-");
  return `${ano}-${mes}-${dia}`;
}

// Mesma interação que carrega o valor (_8575) — é onde o valor foi lançado/aprovado,
// então sua data vira a "data de aprovação" pro histórico. Sem custo extra de rede.
function extrairDataAprovacao(interacoes) {
  const comValor = interacoes.find((interacao) => interacao[CAMPO_EXTRA_VALOR]);
  if (!comValor || !comValor.DataAcao) return null;
  return paraIso(comValor.DataAcao);
}

export async function obterHistoricoChamado({ chave, codChamado }, { forceRefresh = false } = {}) {
  const cacheado = cache.get(chave);
  if (!forceRefresh && cacheado && cacheado.expiresAt > Date.now()) {
    return cacheado.historico;
  }

  const interacoes = await fetchInteracoes({ chave, codChamado });
  const historico = {
    causa: extrairCausa(interacoes),
    passouPorAguardandoAprovacao: extrairPassouPorAguardandoAprovacao(interacoes),
    valorAprovacao: extrairValorAprovacao(interacoes),
    dataAprovacao: extrairDataAprovacao(interacoes),
  };

  cache.set(chave, { historico, expiresAt: Date.now() + TTL_MS });
  return historico;
}

async function mapComConcorrencia(itens, limite, fn) {
  const resultado = new Array(itens.length);
  let indice = 0;

  async function worker() {
    while (indice < itens.length) {
      const atual = indice++;
      resultado[atual] = await fn(itens[atual]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker));
  return resultado;
}

export async function obterHistoricoEmLote(chamados, { concorrencia = 60, forceRefresh = false } = {}) {
  const historicos = await mapComConcorrencia(chamados, concorrencia, (chamado) =>
    obterHistoricoChamado({ chave: chamado.Chave, codChamado: chamado.CodChamado }, { forceRefresh }).catch(() => ({
      causa: null,
      passouPorAguardandoAprovacao: false,
      valorAprovacao: null,
      dataAprovacao: null,
    }))
  );

  const porChave = new Map();
  chamados.forEach((chamado, indice) => porChave.set(chamado.Chave, historicos[indice]));
  return porChave;
}
