import { Router } from "express";
import { fetchChamados } from "../services/chamados.js";
import { buildIndicadores, buildBacklog, isFinalizado, parseDateTime } from "../services/indicadores.js";
import { carregarChamadosEnriquecidos, anexarUf, anexarArea } from "../services/enriquecimento.js";
import { buildIndicadoresManutencao, buildIndicadoresEngenharia } from "../services/indicadoresPorTaxonomia.js";
import { buildOrcamento } from "../services/orcamento.js";
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
import { fetchUsuarios, fetchCodigoClientePorUsuario } from "../services/usuarios.js";
import { fetchUfPorCodigoCliente } from "../services/clientesUf.js";
import { fetchSubCategorias } from "../services/subcategorias.js";

export const indicadoresRouter = Router();

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
    const comArea = anexarArea(comUf, subCategoriaIndex);
    const comCliente = comArea.map((c) => ({ ...c, cliente: clientePorUsuario.get(c.ChaveUsuario) ?? null }));
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
    const { situacaoVolume, operador, area, cliente, tipo, criadosAntes, q } = req.query;

    const [{ data }, clientePorUsuario, codigoClientePorUsuario, ufPorCodigoCliente, subCategoriaIndex] = await Promise.all([
      fetchChamados({ forceRefresh }),
      fetchUsuarios({ forceRefresh }),
      fetchCodigoClientePorUsuario({ forceRefresh }),
      fetchUfPorCodigoCliente({ forceRefresh }),
      fetchSubCategorias({ forceRefresh }),
    ]);

    const comUf = anexarUf(data, { codigoClientePorUsuario, ufPorCodigoCliente });
    const comArea = anexarArea(comUf, subCategoriaIndex);
    const comFiltrosGlobais = filtrarPorUf(buscarPorTexto(excluirCancelados(comArea), q), req.query.uf);

    // Backlog (criadosAntes) fica FORA do período selecionado por definição — não faz
    // sentido aplicar o filtro de data do período nesse caso, o corte é feito abaixo.
    let filtrados = criadosAntes ? comFiltrosGlobais : filtrarPorData(comFiltrosGlobais, periodo);

    if (criadosAntes) filtrados = filtrados.filter((c) => c.DataCriacao && c.DataCriacao < criadosAntes);
    if (operador) filtrados = filtrados.filter((c) => nomeOperador(c) === operador);
    if (area) filtrados = filtrados.filter((c) => c.area === area);
    if (tipo) filtrados = filtrados.filter((c) => c.tipo === tipo);
    if (cliente) filtrados = filtrados.filter((c) => (clientePorUsuario.get(c.ChaveUsuario) ?? null) === cliente);
    if (situacaoVolume === "aberto") filtrados = filtrados.filter((c) => !isFinalizado(c));
    if (situacaoVolume === "finalizado") filtrados = filtrados.filter((c) => isFinalizado(c));

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

indicadoresRouter.get("/indicadores/causas", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const [{ data }, codigoClientePorUsuario, ufPorCodigoCliente] = await Promise.all([
      fetchChamados({ forceRefresh }),
      fetchCodigoClientePorUsuario({ forceRefresh }),
      fetchUfPorCodigoCliente({ forceRefresh }),
    ]);
    const comUf = anexarUf(data, { codigoClientePorUsuario, ufPorCodigoCliente });

    const noPeriodo = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(comUf), periodo), req.query.q), req.query.uf);
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
      } else if (classe !== "aguardandoAprovacao") {
        atual.abertos += 1;
      }

      porEspecialidade.set(c.especialidade, atual);
    }

    const lista = [...porEspecialidade.values()]
      .map((e) => {
        const avaliados = e.concluidos + e.abertos;
        return { ...e, percentualResolucao: avaliados ? Math.round((e.concluidos / avaliados) * 1000) / 10 : 100 };
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
    } = req.query;

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let filtrados = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodo), q), req.query.uf);

    if (especialidade) filtrados = filtrados.filter((c) => c.especialidade === especialidade);
    if (tipo) filtrados = filtrados.filter((c) => c.tipo === tipo);
    if (tipoAtividade) filtrados = filtrados.filter((c) => c.tipoAtividade === tipoAtividade);
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

indicadoresRouter.put("/configuracao/status", (req, res) => {
  try {
    const config = salvarConfiguracao(req.body);
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

indicadoresRouter.put("/configuracao/equipamentos", (req, res) => {
  try {
    const config = salvarConfiguracaoEquipamentos(req.body);
    res.json({ config });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});
