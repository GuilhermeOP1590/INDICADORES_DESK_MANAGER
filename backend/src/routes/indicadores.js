import { Router } from "express";
import { fetchChamados } from "../services/chamados.js";
import { buildIndicadores } from "../services/indicadores.js";
import { carregarChamadosEnriquecidos } from "../services/enriquecimento.js";
import { buildIndicadoresManutencao, buildIndicadoresEngenharia } from "../services/indicadoresPorTaxonomia.js";
import { excluirCancelados, filtrarPorData } from "../services/filtros.js";
import { fetchDetalheChamado } from "../services/chamadoDetalhe.js";

export const indicadoresRouter = Router();

function lerPeriodo(req) {
  const { dataInicio, dataFim } = req.query;
  return { dataInicio: dataInicio || undefined, dataFim: dataFim || undefined };
}

indicadoresRouter.get("/indicadores", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { data, total, fetchedAt } = await fetchChamados({ forceRefresh });

    const semCancelados = excluirCancelados(data);
    const noPeriodo = filtrarPorData(semCancelados, periodo);

    res.json({
      indicadores: buildIndicadores(noPeriodo),
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

indicadoresRouter.get("/manutencao", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });

    const noPeriodo = filtrarPorData(excluirCancelados(chamados), periodo);
    const chamadosManutencao = noPeriodo.filter((chamado) => chamado.especialidade === "Manutenção");

    res.json(buildIndicadoresManutencao(chamadosManutencao));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/engenharia", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });

    const noPeriodo = filtrarPorData(excluirCancelados(chamados), periodo);
    const chamadosEngenharia = noPeriodo.filter((chamado) => chamado.especialidade === "Engenharia");

    res.json(buildIndicadoresEngenharia(chamadosEngenharia));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

function nomeOperador(chamado) {
  return [chamado.NomeOperador, chamado.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador";
}

indicadoresRouter.get("/chamados", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const { especialidade, tipo, tipoAtividade, equipamento, cliente, operador, status } = req.query;

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let filtrados = filtrarPorData(excluirCancelados(chamados), periodo);

    if (especialidade) filtrados = filtrados.filter((c) => c.especialidade === especialidade);
    if (tipo) filtrados = filtrados.filter((c) => c.tipo === tipo);
    if (tipoAtividade) filtrados = filtrados.filter((c) => c.tipoAtividade === tipoAtividade);
    if (equipamento) filtrados = filtrados.filter((c) => c.equipamento === equipamento);
    if (cliente) filtrados = filtrados.filter((c) => c.cliente === cliente);
    if (status) filtrados = filtrados.filter((c) => c.NomeStatus === status);
    if (operador) filtrados = filtrados.filter((c) => nomeOperador(c) === operador);

    res.json({
      total: filtrados.length,
      chamados: filtrados.map((c) => ({
        chave: c.Chave,
        codChamado: c.CodChamado,
        assunto: c.Assunto,
        status: c.NomeStatus,
        prioridade: c.NomePrioridade,
        dataCriacao: c.DataCriacao,
        horaCriacao: c.HoraCriacao,
        cliente: c.cliente,
        operador: nomeOperador(c),
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
