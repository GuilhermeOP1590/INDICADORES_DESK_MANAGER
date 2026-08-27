import { grupoDoEquipamento, lerConfiguracaoEquipamentos } from "./configuracaoEquipamentos.js";

// O valor (_8575) é lançado na interação em que o técnico PEDE aprovação — continua lá mesmo
// se o aprovador rejeitar o pedido depois. Sem essa checagem, um orçamento reprovado (negado,
// nunca gasto) somava junto com os aprovados em toda soma de "valor aprovado"/custo.
const STATUS_ORCAMENTO_REPROVADO = "Orçamento Reprovado";

export function foiReprovado(chamado) {
  return chamado.NomeStatus === STATUS_ORCAMENTO_REPROVADO;
}

function valorDe(historicoMap, chamado) {
  return historicoMap.get(chamado.Chave)?.valorAprovacao ?? 0;
}

function somarValor(lista, historicoMap) {
  return Math.round(lista.reduce((soma, c) => soma + valorDe(historicoMap, c), 0) * 100) / 100;
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

function agruparPorLabel(lista, historicoMap, chaveFn) {
  const mapa = new Map();
  for (const c of lista) {
    const label = chaveFn(c);
    if (!label) continue;
    const atual = mapa.get(label) || { label, total: 0, valor: 0 };
    atual.total += 1;
    atual.valor += valorDe(historicoMap, c);
    mapa.set(label, atual);
  }
  return [...mapa.values()].map((item) => ({ ...item, valor: arredondar(item.valor) })).sort((a, b) => b.valor - a.valor);
}

// Agrupa aguardando+avaliados juntos por uma chave (uf ou cliente) — dá a visão "quanto de
// orçamento (pendente + já avaliado) essa região/unidade concentra", pra guiar decisão.
function agruparOrcamentoPor(aguardando, avaliados, historicoMap, nomeCampo, chaveFn, extra) {
  const mapa = new Map();

  function acumular(c, bucket) {
    const chave = chaveFn(c);
    if (!chave) return;
    const atual = mapa.get(chave) || {
      [nomeCampo]: chave,
      ...(extra ? extra(c) : {}),
      aguardandoTotal: 0,
      aguardandoValor: 0,
      avaliadosTotal: 0,
      avaliadosValor: 0,
    };
    const valor = valorDe(historicoMap, c);
    if (bucket === "aguardando") {
      atual.aguardandoTotal += 1;
      atual.aguardandoValor += valor;
    } else {
      atual.avaliadosTotal += 1;
      atual.avaliadosValor += valor;
    }
    mapa.set(chave, atual);
  }

  aguardando.forEach((c) => acumular(c, "aguardando"));
  avaliados.forEach((c) => acumular(c, "avaliados"));

  return [...mapa.values()]
    .map((item) => ({
      ...item,
      aguardandoValor: arredondar(item.aguardandoValor),
      avaliadosValor: arredondar(item.avaliadosValor),
    }))
    .sort((a, b) => b.aguardandoValor + b.avaliadosValor - (a.aguardandoValor + a.avaliadosValor));
}

// Ledger cronológico de aprovações — cada chamado que passou por Aguardando Aprovação e já
// foi avaliado, com a data/hora em que o valor foi lançado (ver historicoChamado.js).
function buildHistoricoAprovacoes(avaliados, historicoMap) {
  return avaliados
    .map((c) => {
      const h = historicoMap.get(c.Chave) ?? {};
      return {
        chave: c.Chave,
        codChamado: c.CodChamado,
        assunto: c.Assunto,
        status: c.NomeStatus,
        cliente: c.cliente,
        uf: c.uf,
        causa: h.causa ?? null,
        valor: h.valorAprovacao ?? 0,
        dataAprovacao: h.dataAprovacao ?? null,
      };
    })
    .filter((item) => item.dataAprovacao)
    .sort((a, b) => b.dataAprovacao.localeCompare(a.dataAprovacao));
}

// Parte "rápida" do orçamento: só olha NomeStatus, não depende de obterHistoricoEmLote (a
// busca cara, por chamado, no Desk) — pra poder aparecer na tela antes do resto do payload.
export function buildResumoRapidoOrcamento(chamados) {
  const aguardandoTotal = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação").length;
  return { totalChamados: chamados.length, aguardandoTotal };
}

function chaveCategoria(chamado, equipConfig) {
  if (chamado.especialidade === "Engenharia") return chamado.tipoAtividade || "Não classificado";
  return grupoDoEquipamento(chamado.equipamento, equipConfig);
}

function bucketVazio() {
  return { total: 0, valor: 0 };
}

function novoNo(camposExtra) {
  return { ...camposExtra, aprovado: bucketVazio(), pendente: bucketVazio(), reprovado: bucketVazio() };
}

function acumularBucket(no, bucket, chamado, historicoMap) {
  no[bucket].total += 1;
  no[bucket].valor += valorDe(historicoMap, chamado);
}

// Some do custo "real": aprovado + pendente. Reprovado fica de fora do total usado pra
// ordenar (mesmo racional de buildOrcamento/icsEquipamento — visível, mas não comprometido).
function totalNo(no) {
  return no.aprovado.valor + no.pendente.valor;
}

function arredondarNo(no) {
  return {
    ...no,
    aprovado: { ...no.aprovado, valor: arredondar(no.aprovado.valor) },
    pendente: { ...no.pendente, valor: arredondar(no.pendente.valor) },
    reprovado: { ...no.reprovado, valor: arredondar(no.reprovado.valor) },
  };
}

// Navegação Loja -> Especialidade -> Categoria de custo -> Equipamento (só Manutenção) usada
// pelo painel "Orçamento por região" — cada nível traz aprovado/pendente/reprovado separados
// (mesmo racional de icsEquipamento.js). Engenharia não tem "equipamento": sua categoria
// (tipoAtividade) já é o nível mais fino.
export function buildPorLojaOrcamento(chamados, historicoMap, equipConfig = lerConfiguracaoEquipamentos()) {
  const aguardando = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação");
  const avaliadosBrutos = chamados.filter(
    (c) => historicoMap.get(c.Chave)?.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação"
  );
  const aprovados = avaliadosBrutos.filter((c) => !foiReprovado(c));
  const reprovados = avaliadosBrutos.filter(foiReprovado);

  const lojas = new Map();

  function processar(lista, bucket) {
    for (const c of lista) {
      const cliente = c.cliente || "Não informado";
      const especialidade = c.especialidade || "Não informado";
      const categoria = chaveCategoria(c, equipConfig);

      const noLoja = lojas.get(cliente) ?? novoNo({ cliente, uf: c.uf || null, porEspecialidade: new Map() });
      lojas.set(cliente, noLoja);
      acumularBucket(noLoja, bucket, c, historicoMap);

      const noEsp = noLoja.porEspecialidade.get(especialidade) ?? novoNo({ especialidade, porCategoria: new Map() });
      noLoja.porEspecialidade.set(especialidade, noEsp);
      acumularBucket(noEsp, bucket, c, historicoMap);

      const noCat = noEsp.porCategoria.get(categoria) ?? novoNo({ categoria });
      noEsp.porCategoria.set(categoria, noCat);
      acumularBucket(noCat, bucket, c, historicoMap);

      if (especialidade === "Manutenção") {
        const equipamento = c.equipamento || "Não informado";
        noCat.porEquipamento = noCat.porEquipamento ?? new Map();
        const noEquip = noCat.porEquipamento.get(equipamento) ?? novoNo({ equipamento });
        noCat.porEquipamento.set(equipamento, noEquip);
        acumularBucket(noEquip, bucket, c, historicoMap);
      }
    }
  }

  processar(aguardando, "pendente");
  processar(aprovados, "aprovado");
  processar(reprovados, "reprovado");

  return [...lojas.values()]
    .map((loja) => ({
      ...arredondarNo(loja),
      porEspecialidade: [...loja.porEspecialidade.values()]
        .map((esp) => ({
          ...arredondarNo(esp),
          porCategoria: [...esp.porCategoria.values()]
            .map((cat) => ({
              ...arredondarNo(cat),
              ...(cat.porEquipamento
                ? { porEquipamento: [...cat.porEquipamento.values()].map(arredondarNo).sort((a, b) => totalNo(b) - totalNo(a)) }
                : {}),
            }))
            .sort((a, b) => totalNo(b) - totalNo(a)),
        }))
        .sort((a, b) => totalNo(b) - totalNo(a)),
    }))
    .sort((a, b) => totalNo(b) - totalNo(a));
}

export function buildOrcamento(chamados, historicoMap) {
  const aguardando = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação");
  const avaliadosBrutos = chamados.filter(
    (c) => historicoMap.get(c.Chave)?.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação"
  );
  // "avaliados" = passou pela aprovação E foi aceito. Reprovado é um bucket à parte — não some
  // do payload, só não entra em nenhuma soma que representa dinheiro aprovado/gasto.
  const avaliados = avaliadosBrutos.filter((c) => !foiReprovado(c));
  const reprovados = avaliadosBrutos.filter(foiReprovado);

  return {
    totalChamados: chamados.length,
    aguardando: { total: aguardando.length, valor: somarValor(aguardando, historicoMap) },
    avaliados: { total: avaliados.length, valor: somarValor(avaliados, historicoMap) },
    reprovados: { total: reprovados.length, valor: somarValor(reprovados, historicoMap) },
    // causa só existe pra chamado já resolvido (registrada no fechamento) — fica avaliados-only.
    // tipo/tipoAtividade é taxonomia definida na criação do chamado, então existe pra aguardando
    // também. Engenharia não usa "tipo" (é sempre Corretiva) — o classificador real de Engenharia
    // é tipoAtividade (Elétrica, Hidráulica, Serralheria...), por isso a escolha condicional abaixo.
    porCausa: agruparPorLabel(avaliados, historicoMap, (c) => historicoMap.get(c.Chave)?.causa),
    porTipo: agruparOrcamentoPor(
      aguardando,
      avaliados,
      historicoMap,
      "tipo",
      (c) => (c.especialidade === "Engenharia" ? c.tipoAtividade : c.tipo) || "Não classificado"
    ),
    porUf: agruparOrcamentoPor(aguardando, avaliados, historicoMap, "uf", (c) => c.uf || "Não informado"),
    porCliente: agruparOrcamentoPor(
      aguardando,
      avaliados,
      historicoMap,
      "cliente",
      (c) => c.cliente || "Não informado",
      (c) => ({ uf: c.uf || null })
    ),
    historicoAprovacoes: buildHistoricoAprovacoes(avaliados, historicoMap),
    porLoja: buildPorLojaOrcamento(chamados, historicoMap),
  };
}
