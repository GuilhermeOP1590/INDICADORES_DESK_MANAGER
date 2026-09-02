import { callDeskMcpTool } from "./deskMcp.js";
import { isFinalizado } from "./indicadores.js";

const TTL_MS_ABERTO = 15 * 60 * 1000;
// Uma vez finalizado, causa/valor/dataAprovacao do chamado não mudam mais (foram lançados e
// fechados) — cachear por muito mais tempo evita reconsultar o Desk toda vez que alguém reabre
// um período já visto antes (Orçamento, Tendência Mensal, ICs...). Não é "pra sempre": se o
// chamado for reaberto (DataFinalizacao volta a vazio), a próxima leitura já entra como "aberto"
// e usa o TTL curto de novo.
const TTL_MS_FINALIZADO = 30 * 24 * 60 * 60 * 1000;
const cache = new Map(); // chave -> { expiresAt, historico }

export function ttlPara(finalizado) {
  return finalizado ? TTL_MS_FINALIZADO : TTL_MS_ABERTO;
}

// "_8575" e "_9637" não são documentados — são os campos extras "Valor (R$)" e "Orçamento/Custo"
// (Tipo: Interações), descobertos via engenharia reversa do parâmetro Colunas da tool MCP
// dados_da_interacao_do_chamados. Ver docs/superpowers/... para o processo de descoberta.
const CAMPO_EXTRA_VALOR = "_8575";
const CAMPO_EXTRA_ORCAMENTO_CONFIRMADO = "_9637";

// "_9293" é o campo extra "Horímetro" (Tipo: Interações), descoberto via lista_de_campos_extras.
// "ICs" é uma coluna NATIVA (não um campo extra numérico) — devolve o(s) ativo(s) do catálogo
// de ICs do DeskManager vinculado(s) àquela interação (ex: "300 - MTZ - Empilhadeira 06"),
// descoberta por tentativa/erro direto no parâmetro Colunas. Ver
// docs/superpowers/specs/2026-08-12-equipamentos-por-ic-design.md.
const CAMPO_EXTRA_HORIMETRO = "_9293";
const CAMPO_ICS = "ICs";

// "_19465" é o campo extra "NOME DA EMPRESA" (Tipo: Interações), descoberto via
// lista_de_campos_extras — mesma interação que carrega o valor (_8575): é o nome do
// fornecedor/prestador que forneceu o orçamento (ex: "Mesquita", "I9 Geradores"), NÃO a razão
// social da loja/cliente (esses são conceitos diferentes no Desk).
const CAMPO_EXTRA_NOME_EMPRESA = "_19465";

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
        [CAMPO_EXTRA_HORIMETRO]: "on",
        [CAMPO_EXTRA_NOME_EMPRESA]: "on",
        [CAMPO_ICS]: "on",
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

// Mesmo padrão de extrairValorAprovacao — nome do fornecedor lançado na mesma interação do
// pedido de orçamento.
export function extrairNomeEmpresa(interacoes) {
  const comEmpresa = interacoes.find((interacao) => interacao[CAMPO_EXTRA_NOME_EMPRESA]);
  return comEmpresa ? comEmpresa[CAMPO_EXTRA_NOME_EMPRESA] : null;
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

// Pega a data em que o chamado DEIXOU "Aguardando Aprovação" pela primeira vez — é a decisão
// real (aprovado ou reprovado), diferente de dataAprovacao (que é quando o valor foi lançado,
// pedindo aprovação — pode ser dias antes da decisão em si). Interações vêm da mais recente pra
// mais antiga; inverte pra varrer em ordem cronológica, mesmo padrão de
// extrairTempoAguardandoPecaDias.
export function extrairDataDecisao(interacoes) {
  const cronologico = [...interacoes].reverse();
  let passouPorAguardando = false;
  for (const interacao of cronologico) {
    const status = interacao.Status?.[0]?.text;
    if (status === "Aguardando Aprovação") {
      passouPorAguardando = true;
      continue;
    }
    if (passouPorAguardando && interacao.DataAcao) {
      return paraIso(interacao.DataAcao);
    }
  }
  return null;
}

// Junta os Ics de TODAS as interações da chamada (não só a mais recente) — o mesmo chamado
// pode referenciar o equipamento em ações diferentes ao longo do atendimento. O formato
// observado é um valor só; a separação por vírgula/ponto-e-vírgula é proteção defensiva caso
// apareça mais de um Ic na mesma interação.
export function extrairIcs(interacoes) {
  const nomes = new Set();
  for (const interacao of interacoes) {
    const bruto = interacao[CAMPO_ICS];
    if (!bruto) continue;
    for (const nome of bruto.split(/[,;]/)) {
      const limpo = nome.trim();
      if (limpo) nomes.add(limpo);
    }
  }
  return [...nomes];
}

// Mesmo padrão de extrairValorAprovacao: interações vêm da mais recente pra mais antiga, o
// horímetro "vale" é o da última interação que o preencheu.
export function extrairHorimetro(interacoes) {
  const comHorimetro = interacoes.find((interacao) => interacao[CAMPO_EXTRA_HORIMETRO]);
  return comHorimetro ? comHorimetro[CAMPO_EXTRA_HORIMETRO] : null;
}

const STATUS_AGUARDANDO_PECA = new Set(["Aguardando Peça do Estoque", "Peça Enviada para Loja"]);

// Interações vêm da mais recente pra mais antiga — inverte pra varrer em ordem cronológica.
// Funde entradas consecutivas nos 2 status de espera de peça como um único período parado
// (trocar de um status pro outro não fecha o período — a peça só resolve quando instalada).
// Se o período mais recente ainda não fechou (chamado segue parado nesse status), conta até
// agora, pra refletir travas em andamento, não só as já resolvidas.
export function extrairTempoAguardandoPecaDias(interacoes) {
  const cronologico = [...interacoes].reverse();
  let diasTotal = 0;
  let entradaEm = null;

  for (const interacao of cronologico) {
    if (!interacao.DataAcao) continue;
    const data = new Date(paraIso(interacao.DataAcao));
    const status = interacao.Status?.[0]?.text;
    const aguardandoPeca = STATUS_AGUARDANDO_PECA.has(status);

    if (aguardandoPeca && entradaEm === null) {
      entradaEm = data;
    } else if (!aguardandoPeca && entradaEm !== null) {
      diasTotal += (data.getTime() - entradaEm.getTime()) / (1000 * 60 * 60 * 24);
      entradaEm = null;
    }
  }

  if (entradaEm !== null) {
    diasTotal += (Date.now() - entradaEm.getTime()) / (1000 * 60 * 60 * 24);
  }

  return Math.round(diasTotal * 10) / 10;
}

export async function obterHistoricoChamado({ chave, codChamado, finalizado = false }, { forceRefresh = false } = {}) {
  const cacheado = cache.get(chave);
  if (!forceRefresh && cacheado && cacheado.expiresAt > Date.now()) {
    return cacheado.historico;
  }

  const interacoes = await fetchInteracoes({ chave, codChamado });
  const historico = {
    causa: extrairCausa(interacoes),
    passouPorAguardandoAprovacao: extrairPassouPorAguardandoAprovacao(interacoes),
    valorAprovacao: extrairValorAprovacao(interacoes),
    nomeEmpresa: extrairNomeEmpresa(interacoes),
    dataAprovacao: extrairDataAprovacao(interacoes),
    dataDecisao: extrairDataDecisao(interacoes),
    ics: extrairIcs(interacoes),
    horimetro: extrairHorimetro(interacoes),
    tempoAguardandoPecaDias: extrairTempoAguardandoPecaDias(interacoes),
  };

  cache.set(chave, { historico, expiresAt: Date.now() + ttlPara(finalizado) });
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
    obterHistoricoChamado(
      { chave: chamado.Chave, codChamado: chamado.CodChamado, finalizado: isFinalizado(chamado) },
      { forceRefresh }
    ).catch(() => ({
      causa: null,
      passouPorAguardandoAprovacao: false,
      valorAprovacao: null,
      nomeEmpresa: null,
      dataAprovacao: null,
      dataDecisao: null,
      ics: [],
      horimetro: null,
      tempoAguardandoPecaDias: 0,
    }))
  );

  const porChave = new Map();
  chamados.forEach((chamado, indice) => porChave.set(chamado.Chave, historicos[indice]));
  return porChave;
}
