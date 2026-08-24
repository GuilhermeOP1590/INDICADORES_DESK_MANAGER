import { Router } from "express";
import { fetchChamados } from "../services/chamados.js";
import { buildIndicadores, buildBacklog, buildPorCliente, isFinalizado, parseDateTime } from "../services/indicadores.js";
import { carregarChamadosEnriquecidos, anexarUf, anexarArea, anexarSlaNivel, CLIENTE_FICTICIO } from "../services/enriquecimento.js";
import { buildIndicadoresManutencao, buildIndicadoresEngenharia, listarPorCliente } from "../services/indicadoresPorTaxonomia.js";
import { buildOrcamento, buildResumoRapidoOrcamento } from "../services/orcamento.js";
import { excluirCancelados, filtrarPorData, filtrarPorUf, buscarPorTexto } from "../services/filtros.js";
import { fetchDetalheChamado } from "../services/chamadoDetalhe.js";
import { obterHistoricoEmLote } from "../services/historicoChamado.js";
import { lerConfiguracao, salvarConfiguracao, classificarStatus } from "../services/configuracaoIndicadores.js";
import {
  lerConfiguracaoEquipamentos,
  salvarConfiguracaoEquipamentos,
  grupoDoEquipamento,
  normalizarEquipamento,
} from "../services/configuracaoEquipamentos.js";
import { lerPrioridades, adicionarOuAtualizarPrioridade, removerPrioridade } from "../services/prioridades.js";
import { buildPorIc } from "../services/icsEquipamento.js";
import { buildTendenciaMensal } from "../services/tendenciaMensalManutencao.js";
import { buildTendenciaMensalPorCausa } from "../services/tendenciaMensalCausa.js";
import { fetchUsuarios, fetchCodigoClientePorUsuario } from "../services/usuarios.js";
import { fetchUfPorCodigoCliente } from "../services/clientesUf.js";
import { fetchSubCategorias } from "../services/subcategorias.js";

export const indicadoresRouter = Router();

// Dashboard é só pra Manutenção e Engenharia — outras áreas (TI, Sesmt, etc) não são
// responsabilidade desse time e não devem contar nos indicadores gerais.
function apenasManutencaoEEngenharia(chamados) {
  return chamados.filter((c) => c.area === "Manutenção" || c.area === "Engenharia");
}

function lerPeriodo(req) {
  const { dataInicio, dataFim } = req.query;
  return { dataInicio: dataInicio || undefined, dataFim: dataFim || undefined };
}

function nomeOperador(chamado) {
  return [chamado.NomeOperador, chamado.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador";
}

// Usado quando o usuário clica na barra "Outros (agregado)" de um gráfico: como ela soma
// N categorias diferentes, não dá pra filtrar por um único valor — filtra por "não está no topo".
function valorDaDimensao(chamado, dimensao) {
  switch (dimensao) {
    case "tipo":
      return chamado.tipo;
    case "tipoAtividade":
      return chamado.tipoAtividade;
    // "atividade" combina os dois: usada no Orçamento pra funcionar em Manutenção e
    // Engenharia com um único gráfico (Engenharia não usa "tipo" — é sempre Corretiva).
    case "atividade":
      return chamado.especialidade === "Engenharia" ? chamado.tipoAtividade : chamado.tipo;
    case "equipamento":
      return chamado.equipamento;
    case "grupoEquipamento":
      return grupoDoEquipamento(chamado.equipamento);
    case "status":
      return chamado.NomeStatus;
    case "cliente":
      return chamado.cliente;
    case "operador":
      return nomeOperador(chamado);
    default:
      return undefined;
  }
}

async function carregarCausas(chamados) {
  const historicoMap = await obterHistoricoEmLote(chamados);
  const comCausa = chamados.filter((c) => historicoMap.get(c.Chave)?.causa);
  const contagem = new Map();
  for (const c of comCausa) {
    const causa = historicoMap.get(c.Chave).causa;
    contagem.set(causa, (contagem.get(causa) || 0) + 1);
  }
  const porCausa = [...contagem.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);

  const aguardando = chamados.filter((c) => c.NomeStatus === "Aguardando Aprovação");
  const avaliados = chamados.filter(
    (c) => historicoMap.get(c.Chave)?.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação"
  );

  const somarValor = (lista) =>
    lista.reduce((soma, c) => soma + (historicoMap.get(c.Chave)?.valorAprovacao ?? 0), 0);

  return {
    porCausa,
    jaAvaliados: avaliados.length,
    valorAguardando: Math.round(somarValor(aguardando) * 100) / 100,
    valorAvaliado: Math.round(somarValor(avaliados) * 100) / 100,
  };
}

indicadoresRouter.get("/indicadores", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const [{ data, total, fetchedAt }, clientePorUsuario, codigoClientePorUsuario, ufPorCodigoCliente, subCategoriaIndex] =
      await Promise.all([
        fetchChamados({ forceRefresh }),
        fetchUsuarios({ forceRefresh }),
        fetchCodigoClientePorUsuario({ forceRefresh }),
        fetchUfPorCodigoCliente({ forceRefresh }),
        fetchSubCategorias({ forceRefresh }),
      ]);

    const comUf = anexarUf(data, { codigoClientePorUsuario, ufPorCodigoCliente });
    const comArea = anexarSlaNivel(apenasManutencaoEEngenharia(anexarArea(comUf, subCategoriaIndex)));
    const comCliente = comArea
      .map((c) => ({ ...c, cliente: clientePorUsuario.get(c.ChaveUsuario) ?? null }))
      .filter((c) => c.cliente !== CLIENTE_FICTICIO);
    const semCancelados = excluirCancelados(comCliente);
    const comFiltrosGlobais = filtrarPorUf(buscarPorTexto(semCancelados, req.query.q), req.query.uf);
    const noPeriodo = filtrarPorData(comFiltrosGlobais, periodo);

    res.json({
      indicadores: buildIndicadores(noPeriodo),
      backlog: buildBacklog(comFiltrosGlobais, periodo),
      totalCarregado: data.length,
      totalFiltrado: noPeriodo.length,
      totalNoDesk: total,
      atualizadoEm: new Date(fetchedAt).toISOString(),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

// Drill-down do Dashboard: usa o MESMO pipeline bruto (não-enriquecido, todos os
// departamentos) de /indicadores, pra garantir que o total sempre bate com o número do card
// que o usuário clicou — /chamados usa o dataset enriquecido (só Manutenção/Engenharia).
indicadoresRouter.get("/dashboard/chamados", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { situacaoVolume, operador, area, cliente, tipo, status, criadosAntes, q, dimensao, foraDoTopo, nivel } = req.query;

    const [{ data }, clientePorUsuario, codigoClientePorUsuario, ufPorCodigoCliente, subCategoriaIndex] = await Promise.all([
      fetchChamados({ forceRefresh }),
      fetchUsuarios({ forceRefresh }),
      fetchCodigoClientePorUsuario({ forceRefresh }),
      fetchUfPorCodigoCliente({ forceRefresh }),
      fetchSubCategorias({ forceRefresh }),
    ]);

    const comUf = anexarUf(data, { codigoClientePorUsuario, ufPorCodigoCliente });
    const comArea = anexarSlaNivel(
      apenasManutencaoEEngenharia(anexarArea(comUf, subCategoriaIndex)).filter(
        (c) => (clientePorUsuario.get(c.ChaveUsuario) ?? null) !== CLIENTE_FICTICIO
      )
    );
    const comFiltrosGlobais = filtrarPorUf(buscarPorTexto(excluirCancelados(comArea), q), req.query.uf);

    // Backlog (criadosAntes) fica FORA do período selecionado por definição — não faz
    // sentido aplicar o filtro de data do período nesse caso, o corte é feito abaixo.
    let filtrados = criadosAntes ? comFiltrosGlobais : filtrarPorData(comFiltrosGlobais, periodo);

    if (criadosAntes) filtrados = filtrados.filter((c) => c.DataCriacao && c.DataCriacao < criadosAntes);
    if (operador) filtrados = filtrados.filter((c) => nomeOperador(c) === operador);
    if (area) filtrados = filtrados.filter((c) => c.area === area);
    if (tipo) filtrados = filtrados.filter((c) => c.tipo === tipo);
    if (nivel) filtrados = filtrados.filter((c) => c.slaNivel === Number(nivel));
    if (cliente) filtrados = filtrados.filter((c) => (clientePorUsuario.get(c.ChaveUsuario) ?? null) === cliente);
    if (situacaoVolume === "aberto") filtrados = filtrados.filter((c) => !isFinalizado(c));
    if (situacaoVolume === "finalizado") filtrados = filtrados.filter((c) => isFinalizado(c));
    if (status) filtrados = filtrados.filter((c) => c.NomeStatus === status);

    if (dimensao && foraDoTopo) {
      const noTopo = new Set(foraDoTopo.split("|"));
      filtrados = filtrados.filter((c) => !noTopo.has(valorDaDimensao(c, dimensao)));
    }

    const config = lerConfiguracao();

    res.json({
      total: filtrados.length,
      chamados: filtrados.map((c) => {
        const inicio = parseDateTime(c.DataCriacao, c.HoraCriacao);
        const fim = parseDateTime(c.DataFinalizacao, c.HoraFinalizacao);
        const tempoResolucaoHoras = inicio && fim ? Math.max(0, (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60)) : null;

        return {
          chave: c.Chave,
          codChamado: c.CodChamado,
          assunto: c.Assunto,
          status: c.NomeStatus,
          situacao: classificarStatus(c.NomeStatus, config),
          prioridade: c.NomePrioridade,
          slaNivel: c.slaNivel,
          dataCriacao: c.DataCriacao,
          horaCriacao: c.HoraCriacao,
          dataFinalizacao: isFinalizado(c) ? c.DataFinalizacao : null,
          horaFinalizacao: isFinalizado(c) ? c.HoraFinalizacao : null,
          cliente: clientePorUsuario.get(c.ChaveUsuario) ?? null,
          uf: c.uf,
          area: c.area,
          tipo: c.tipo,
          operador: nomeOperador(c),
          tempoResolucaoHoras: situacaoVolume === "finalizado" ? tempoResolucaoHoras : undefined,
        };
      }),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

// Painel de drill-down de um nível de SLA: breakdown por atividade + ranking de lojas —
// mesmo pipeline/filtros de /dashboard/chamados, só que devolve os dois agregados de uma vez
// (evita 2 round-trips quando o usuário clica num card de nível).
indicadoresRouter.get("/dashboard/sla/nivel-detalhe", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { situacaoVolume, operador, area, cliente, tipo, status, q, nivel } = req.query;

    if (!nivel) {
      res.status(400).json({ erro: "Parâmetro nivel é obrigatório" });
      return;
    }

    const [{ data }, clientePorUsuario, codigoClientePorUsuario, ufPorCodigoCliente, subCategoriaIndex] = await Promise.all([
      fetchChamados({ forceRefresh }),
      fetchUsuarios({ forceRefresh }),
      fetchCodigoClientePorUsuario({ forceRefresh }),
      fetchUfPorCodigoCliente({ forceRefresh }),
      fetchSubCategorias({ forceRefresh }),
    ]);

    const comUf = anexarUf(data, { codigoClientePorUsuario, ufPorCodigoCliente });
    const comArea = anexarSlaNivel(
      apenasManutencaoEEngenharia(anexarArea(comUf, subCategoriaIndex)).filter(
        (c) => (clientePorUsuario.get(c.ChaveUsuario) ?? null) !== CLIENTE_FICTICIO
      )
    );
    const comFiltrosGlobais = filtrarPorUf(buscarPorTexto(excluirCancelados(comArea), q), req.query.uf);

    let filtrados = filtrarPorData(comFiltrosGlobais, periodo);
    filtrados = filtrados.filter((c) => c.slaNivel === Number(nivel));
    if (operador) filtrados = filtrados.filter((c) => nomeOperador(c) === operador);
    if (area) filtrados = filtrados.filter((c) => c.area === area);
    if (tipo) filtrados = filtrados.filter((c) => c.tipo === tipo);
    if (cliente) filtrados = filtrados.filter((c) => (clientePorUsuario.get(c.ChaveUsuario) ?? null) === cliente);
    if (situacaoVolume === "aberto") filtrados = filtrados.filter((c) => !isFinalizado(c));
    if (situacaoVolume === "finalizado") filtrados = filtrados.filter((c) => isFinalizado(c));
    if (status) filtrados = filtrados.filter((c) => c.NomeStatus === status);

    const comCliente = filtrados.map((c) => ({ ...c, cliente: clientePorUsuario.get(c.ChaveUsuario) ?? null }));
    const porAtividade = [...comCliente.reduce((mapa, c) => {
      const chave = valorDaDimensao(c, "atividade") || "Não informado";
      mapa.set(chave, (mapa.get(chave) || 0) + 1);
      return mapa;
    }, new Map())].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);

    res.json({
      total: filtrados.length,
      abertos: filtrados.filter((c) => !isFinalizado(c)).length,
      porAtividade,
      porCliente: buildPorCliente(comCliente),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/indicadores/causas", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const [{ data }, clientePorUsuario, codigoClientePorUsuario, ufPorCodigoCliente, subCategoriaIndex] = await Promise.all([
      fetchChamados({ forceRefresh }),
      fetchUsuarios({ forceRefresh }),
      fetchCodigoClientePorUsuario({ forceRefresh }),
      fetchUfPorCodigoCliente({ forceRefresh }),
      fetchSubCategorias({ forceRefresh }),
    ]);
    const comUf = anexarUf(data, { codigoClientePorUsuario, ufPorCodigoCliente });
    const comArea = apenasManutencaoEEngenharia(anexarArea(comUf, subCategoriaIndex)).filter(
      (c) => (clientePorUsuario.get(c.ChaveUsuario) ?? null) !== CLIENTE_FICTICIO
    );

    const noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(comArea), periodo), req.query.q), req.query.uf);
    res.json(await carregarCausas(noPeriodo));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/chamados-enriquecidos", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { chamados, totalOriginal } = await carregarChamadosEnriquecidos({ forceRefresh });

    const noPeriodo = filtrarPorData(excluirCancelados(chamados), periodo);

    res.json({
      totalOriginal,
      totalEnriquecido: noPeriodo.length,
      porEspecialidade: {
        Manutenção: noPeriodo.filter((c) => c.especialidade === "Manutenção").length,
        Engenharia: noPeriodo.filter((c) => c.especialidade === "Engenharia").length,
      },
      amostra: noPeriodo.slice(0, 5),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

async function chamadosDaEspecialidade(req, especialidade) {
  const forceRefresh = req.query.refresh === "true";
  const periodo = lerPeriodo(req);
  const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });

  const noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), req.query.q), req.query.uf);
  return noPeriodo.filter((chamado) => chamado.especialidade === especialidade);
}

indicadoresRouter.get("/manutencao", async (req, res) => {
  try {
    const chamadosManutencao = await chamadosDaEspecialidade(req, "Manutenção");
    res.json(buildIndicadoresManutencao(chamadosManutencao));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/manutencao/causas", async (req, res) => {
  try {
    const chamadosManutencao = await chamadosDaEspecialidade(req, "Manutenção");
    res.json(await carregarCausas(chamadosManutencao));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/engenharia", async (req, res) => {
  try {
    const chamadosEngenharia = await chamadosDaEspecialidade(req, "Engenharia");
    res.json(buildIndicadoresEngenharia(chamadosEngenharia));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/engenharia/causas", async (req, res) => {
  try {
    const chamadosEngenharia = await chamadosDaEspecialidade(req, "Engenharia");
    res.json(await carregarCausas(chamadosEngenharia));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

// Contraparte rápida de /orcamento — só filtra a lista de chamados já cacheada (sem buscar
// histórico de interações), pra renderizar total/aguardando na tela antes do resto do payload
// (que pode levar até 1 minuto). Ver docs/superpowers/plans/2026-08-24-orcamento-carregamento-em-camadas.md.
indicadoresRouter.get("/orcamento/resumo-rapido", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const especialidade = req.query.especialidade || "Geral";

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), req.query.q), req.query.uf);
    if (especialidade !== "Geral") {
      noPeriodo = noPeriodo.filter((c) => c.especialidade === especialidade);
    }

    res.json(buildResumoRapidoOrcamento(noPeriodo));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/orcamento", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const especialidade = req.query.especialidade || "Geral";

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), req.query.q), req.query.uf);
    if (especialidade !== "Geral") {
      noPeriodo = noPeriodo.filter((c) => c.especialidade === especialidade);
    }

    const historicoMap = await obterHistoricoEmLote(noPeriodo);
    res.json({ especialidade, ...buildOrcamento(noPeriodo, historicoMap) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/ufs", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const ufPorCodigoCliente = await fetchUfPorCodigoCliente({ forceRefresh });
    const ufs = [...new Set(ufPorCodigoCliente.values())].filter(Boolean).sort();
    res.json({ ufs });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

// Intervalo real de datas com chamados — usado pra esconder do seletor de mês fiscal os meses
// sem nenhum dado (ex: antes do sistema começar a ser usado), em vez de listar 15 meses fixos.
indicadoresRouter.get("/periodos", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { data } = await fetchChamados({ forceRefresh });
    const datas = data.map((c) => c.DataCriacao).filter((d) => d && d !== "0000-00-00");

    res.json({
      dataMinima: datas.length ? datas.reduce((min, d) => (d < min ? d : min)) : null,
      dataMaxima: datas.length ? datas.reduce((max, d) => (d > max ? d : max)) : null,
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

// Resumo de um cliente/unidade específico, aberto ao clicar numa barra do gráfico "Por
// cliente" — cruza Manutenção x Engenharia (o gráfico em si já é escopado a uma especialidade),
// pra mostrar de onde vem a demanda real daquela unidade, não só o total de uma especialidade.
indicadoresRouter.get("/clientes/resumo", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { cliente, q } = req.query;

    if (!cliente) {
      res.status(400).json({ erro: "Parâmetro cliente é obrigatório" });
      return;
    }

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), q), req.query.uf);
    const doCliente = noPeriodo.filter((c) => c.cliente === cliente);

    const config = lerConfiguracao();
    const porEspecialidade = new Map();
    for (const c of doCliente) {
      const atual = porEspecialidade.get(c.especialidade) || {
        especialidade: c.especialidade,
        total: 0,
        abertos: 0,
        fechados: 0,
        concluidos: 0,
      };
      atual.total += 1;

      const classe = classificarStatus(c.NomeStatus, config);
      if (classe === "concluido") {
        atual.concluidos += 1;
        atual.fechados += 1;
      } else if (classe === "aberto") {
        atual.abertos += 1;
      }
      // classe "outro" só soma no total, não em abertos/concluidos.

      porEspecialidade.set(c.especialidade, atual);
    }

    const lista = [...porEspecialidade.values()]
      .map((e) => {
        const avaliados = e.concluidos + e.abertos;
        return { ...e, percentualResolucao: avaliados ? Math.round((e.concluidos / avaliados) * 1000) / 10 : null };
      })
      .sort((a, b) => b.total - a.total);

    res.json({ cliente, total: doCliente.length, porEspecialidade: lista });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/chamados", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const {
      especialidade,
      tipo,
      tipoAtividade,
      atividade,
      equipamento,
      cliente,
      operador,
      status,
      situacao,
      causa,
      statusAprovacao,
      q,
      dimensao,
      foraDoTopo,
      nivel,
    } = req.query;

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let filtrados = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), q), req.query.uf);

    if (especialidade) filtrados = filtrados.filter((c) => c.especialidade === especialidade);
    if (tipo) filtrados = filtrados.filter((c) => c.tipo === tipo);
    if (tipoAtividade) filtrados = filtrados.filter((c) => c.tipoAtividade === tipoAtividade);
    if (nivel) filtrados = filtrados.filter((c) => c.slaNivel === Number(nivel));
    if (atividade) filtrados = filtrados.filter((c) => valorDaDimensao(c, "atividade") === atividade);
    if (equipamento) filtrados = filtrados.filter((c) => c.equipamento === equipamento);
    if (cliente) filtrados = filtrados.filter((c) => c.cliente === cliente);
    if (status) filtrados = filtrados.filter((c) => c.NomeStatus === status);
    if (operador) filtrados = filtrados.filter((c) => nomeOperador(c) === operador);

    // "causa" só existe no histórico de interações (assíncrono) — tratada junto com
    // causa/statusAprovacao mais abaixo. As demais dimensões já estão no chamado enriquecido.
    if (dimensao && dimensao !== "causa" && foraDoTopo) {
      const noTopo = new Set(foraDoTopo.split("|"));
      filtrados = filtrados.filter((c) => !noTopo.has(valorDaDimensao(c, dimensao)));
    }

    const config = lerConfiguracao();
    if (situacao) filtrados = filtrados.filter((c) => classificarStatus(c.NomeStatus, config) === situacao);

    const foraDoTopoCausa = dimensao === "causa" && foraDoTopo ? new Set(foraDoTopo.split("|")) : null;
    let historicoMap = null;
    if (causa || statusAprovacao || foraDoTopoCausa) {
      historicoMap = await obterHistoricoEmLote(filtrados);
      filtrados = filtrados.filter((c) => {
        const historico = historicoMap.get(c.Chave) || {};
        if (causa && historico.causa !== causa) return false;
        if (foraDoTopoCausa && foraDoTopoCausa.has(historico.causa)) return false;
        const ehAvaliado = historico.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação";
        const ehAguardando = c.NomeStatus === "Aguardando Aprovação";
        if (statusAprovacao === "aguardando" && !ehAguardando) return false;
        if (statusAprovacao === "avaliado" && !ehAvaliado) return false;
        // "comOrcamento" = pendente OU já avaliado — usado pelo drill de "Custo por unidade",
        // que soma os dois grupos; sem isso o clique numa barra mostrava TODOS os chamados
        // daquele cliente, não só os que compõem o valor exibido.
        if (statusAprovacao === "comOrcamento" && !(ehAguardando || ehAvaliado)) return false;
        return true;
      });
    }

    res.json({
      total: filtrados.length,
      chamados: filtrados.map((c) => ({
        chave: c.Chave,
        codChamado: c.CodChamado,
        assunto: c.Assunto,
        status: c.NomeStatus,
        situacao: classificarStatus(c.NomeStatus, config),
        prioridade: c.NomePrioridade,
        slaNivel: c.slaNivel,
        dataCriacao: c.DataCriacao,
        horaCriacao: c.HoraCriacao,
        dataFinalizacao: isFinalizado(c) ? c.DataFinalizacao : null,
        horaFinalizacao: isFinalizado(c) ? c.HoraFinalizacao : null,
        cliente: c.cliente,
        uf: c.uf,
        operador: nomeOperador(c),
        valorAprovacao: historicoMap ? historicoMap.get(c.Chave)?.valorAprovacao ?? null : undefined,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

// Equivalente a /dashboard/sla/nivel-detalhe, mas no pipeline enriquecido usado por
// Manutenção/Engenharia (mesmos filtros de /chamados: especialidade, tipo, tipoAtividade...).
indicadoresRouter.get("/sla/nivel-detalhe", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { especialidade, tipo, tipoAtividade, cliente, operador, status, q, nivel } = req.query;

    if (!nivel) {
      res.status(400).json({ erro: "Parâmetro nivel é obrigatório" });
      return;
    }

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let filtrados = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), q), req.query.uf);

    filtrados = filtrados.filter((c) => c.slaNivel === Number(nivel));
    if (especialidade) filtrados = filtrados.filter((c) => c.especialidade === especialidade);
    if (tipo) filtrados = filtrados.filter((c) => c.tipo === tipo);
    if (tipoAtividade) filtrados = filtrados.filter((c) => c.tipoAtividade === tipoAtividade);
    if (cliente) filtrados = filtrados.filter((c) => c.cliente === cliente);
    if (status) filtrados = filtrados.filter((c) => c.NomeStatus === status);
    if (operador) filtrados = filtrados.filter((c) => nomeOperador(c) === operador);

    const porAtividade = [...filtrados.reduce((mapa, c) => {
      const chave = valorDaDimensao(c, "atividade") || "Não informado";
      mapa.set(chave, (mapa.get(chave) || 0) + 1);
      return mapa;
    }, new Map())].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);

    res.json({
      total: filtrados.length,
      abertos: filtrados.filter((c) => !isFinalizado(c)).length,
      porAtividade,
      porCliente: listarPorCliente(filtrados),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/chamados/:chave", async (req, res) => {
  try {
    const { chave } = req.params;
    const { codChamado } = req.query;

    if (!codChamado) {
      res.status(400).json({ erro: "Parâmetro codChamado é obrigatório" });
      return;
    }

    const resultado = await fetchDetalheChamado({ chave: Number(chave), codChamado });
    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/configuracao/status", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { data } = await fetchChamados({ forceRefresh });
    const statusDisponiveis = [...new Set(data.map((c) => c.NomeStatus))].sort();

    res.json({ config: lerConfiguracao(), statusDisponiveis });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.put("/configuracao/status", async (req, res) => {
  try {
    const config = await salvarConfiguracao(req.body);
    res.json({ config });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});

indicadoresRouter.get("/configuracao/equipamentos", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });

    const porChaveNormalizada = new Map();
    for (const c of chamados) {
      if (!c.equipamento) continue;
      const chave = normalizarEquipamento(c.equipamento);
      const atual = porChaveNormalizada.get(chave) || { label: c.equipamento, total: 0 };
      atual.total += 1;
      porChaveNormalizada.set(chave, atual);
    }

    const equipamentosDisponiveis = [...porChaveNormalizada.values()].sort((a, b) => b.total - a.total);

    res.json({ config: lerConfiguracaoEquipamentos(), equipamentosDisponiveis });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.put("/configuracao/equipamentos", async (req, res) => {
  try {
    const config = await salvarConfiguracaoEquipamentos(req.body);
    res.json({ config });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});

// Junta a lista salva (código + nota) com o dataset já enriquecido (Manutenção + Engenharia)
// — mesmo pipeline usado por /manutencao, /engenharia, /orcamento etc. Se um código salvo não
// bater com nenhum chamado do dataset atual (ex: saiu do escopo depois de marcado), a linha
// ainda aparece, só com status "Não encontrado", em vez de sumir ou quebrar a rota.
async function buildPrioritarios({ forceRefresh = false } = {}) {
  const { chamados: salvos } = lerPrioridades();
  const { chamados: enriquecidos } = await carregarChamadosEnriquecidos({ forceRefresh });
  const porCodigo = new Map(enriquecidos.map((c) => [c.CodChamado, c]));

  const linhas = salvos.map((prioridade) => {
    const chamado = porCodigo.get(prioridade.codChamado);

    if (!chamado) {
      return {
        codChamado: prioridade.codChamado,
        chave: null,
        assunto: null,
        status: "Não encontrado",
        cliente: null,
        uf: null,
        especialidade: null,
        finalizado: false,
        diasEmAberto: null,
        tempoResolucaoHoras: null,
        nota: prioridade.nota,
        adicionadoEm: prioridade.adicionadoEm,
        encontrado: false,
      };
    }

    const finalizado = isFinalizado(chamado);
    const inicio = parseDateTime(chamado.DataCriacao, chamado.HoraCriacao);
    let diasEmAberto = null;
    let tempoResolucaoHoras = null;

    if (finalizado) {
      const fim = parseDateTime(chamado.DataFinalizacao, chamado.HoraFinalizacao);
      tempoResolucaoHoras = inicio && fim ? Math.max(0, (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60)) : null;
    } else {
      diasEmAberto = inicio ? Math.round((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24)) : null;
    }

    return {
      codChamado: chamado.CodChamado,
      chave: chamado.Chave,
      assunto: chamado.Assunto,
      status: chamado.NomeStatus,
      cliente: chamado.cliente,
      uf: chamado.uf,
      especialidade: chamado.especialidade,
      finalizado,
      diasEmAberto,
      tempoResolucaoHoras,
      nota: prioridade.nota,
      adicionadoEm: prioridade.adicionadoEm,
      encontrado: true,
    };
  });

  // Grupo 0 = aberto (mais antigo primeiro — parado há mais tempo pede mais atenção),
  // grupo 1 = fechado, grupo 2 = não encontrado (sem dado confiável pra ordenar por tempo).
  const grupo = (c) => (!c.encontrado ? 2 : c.finalizado ? 1 : 0);
  linhas.sort((a, b) => {
    if (grupo(a) !== grupo(b)) return grupo(a) - grupo(b);
    if (grupo(a) === 0) return (b.diasEmAberto ?? 0) - (a.diasEmAberto ?? 0);
    return new Date(b.adicionadoEm).getTime() - new Date(a.adicionadoEm).getTime();
  });

  const abertos = linhas.filter((c) => c.encontrado && !c.finalizado);
  const fechados = linhas.filter((c) => c.encontrado && c.finalizado);
  const tempoMedioAbertoDias = abertos.length
    ? Math.round((abertos.reduce((soma, c) => soma + (c.diasEmAberto ?? 0), 0) / abertos.length) * 10) / 10
    : null;

  return {
    resumo: { total: linhas.length, abertos: abertos.length, fechados: fechados.length, tempoMedioAbertoDias },
    chamados: linhas,
  };
}

indicadoresRouter.get("/prioritarios", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    res.json(await buildPrioritarios({ forceRefresh }));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.post("/prioritarios", async (req, res) => {
  try {
    const { codChamado, nota } = req.body;
    if (!codChamado || !codChamado.trim()) {
      res.status(400).json({ erro: "Código do chamado é obrigatório" });
      return;
    }

    const { chamados: enriquecidos } = await carregarChamadosEnriquecidos({});
    const existe = enriquecidos.some((c) => c.CodChamado === codChamado.trim());
    if (!existe) {
      res.status(400).json({ erro: `Chamado ${codChamado.trim()} não encontrado` });
      return;
    }

    await adicionarOuAtualizarPrioridade(codChamado, nota ?? "");
    res.json(await buildPrioritarios({}));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});

indicadoresRouter.delete("/prioritarios/:codChamado", async (req, res) => {
  try {
    await removerPrioridade(req.params.codChamado);
    res.json(await buildPrioritarios({}));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});

indicadoresRouter.get("/configuracao/equipamentos/por-ic", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    if (!periodo.dataInicio || !periodo.dataFim) {
      res.status(400).json({ erro: "Período (dataInicio e dataFim) é obrigatório" });
      return;
    }
    const { tipo } = req.query;

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const noPeriodo = filtrarPorData(excluirCancelados(chamados), periodo).filter((c) => c.especialidade === "Manutenção");

    // Busca o histórico (Ics/horímetro/causa) sobre o período inteiro, não sobre o já filtrado por
    // tipo, pra reaproveitar o mesmo cache de 15min usado por Orçamento e outras abas.
    const historicoMap = await obterHistoricoEmLote(noPeriodo);
    const filtrados = tipo ? noPeriodo.filter((c) => c.tipo === tipo) : noPeriodo;
    const ics = buildPorIc(filtrados, historicoMap);

    const totalComIc = filtrados.filter((c) => (historicoMap.get(c.Chave)?.ics?.length ?? 0) > 0).length;

    res.json({ ics, totalChamados: filtrados.length, totalComIc, totalSemIc: filtrados.length - totalComIc });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/manutencao/tendencia-mensal", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    if (!periodo.dataInicio || !periodo.dataFim) {
      res.status(400).json({ erro: "Período (dataInicio e dataFim) é obrigatório" });
      return;
    }

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const noPeriodo = filtrarPorData(excluirCancelados(chamados), periodo).filter((c) => c.especialidade === "Manutenção");

    const historicoMap = await obterHistoricoEmLote(noPeriodo);
    const tendencia = buildTendenciaMensal(noPeriodo, historicoMap);

    res.json({ tendencia, totalChamados: noPeriodo.length });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

// Mesmo padrão de /manutencao/tendencia-mensal: cálculo caro (histórico de interações),
// self-service com período próprio no frontend — não faz parte do payload principal de
// /orcamento pra não deixar o carregamento inicial da aba ainda mais lento.
indicadoresRouter.get("/orcamento/tendencia-mensal-causa", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    if (!periodo.dataInicio || !periodo.dataFim) {
      res.status(400).json({ erro: "Período (dataInicio e dataFim) é obrigatório" });
      return;
    }
    const especialidade = req.query.especialidade || "Geral";

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), req.query.q), req.query.uf);
    if (especialidade !== "Geral") {
      noPeriodo = noPeriodo.filter((c) => c.especialidade === especialidade);
    }

    const historicoMap = await obterHistoricoEmLote(noPeriodo);
    const avaliados = noPeriodo.filter(
      (c) => historicoMap.get(c.Chave)?.passouPorAguardandoAprovacao && c.NomeStatus !== "Aguardando Aprovação"
    );
    const tendencia = buildTendenciaMensalPorCausa(avaliados, historicoMap);

    res.json({ ...tendencia, totalChamados: noPeriodo.length, totalAvaliados: avaliados.length });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
