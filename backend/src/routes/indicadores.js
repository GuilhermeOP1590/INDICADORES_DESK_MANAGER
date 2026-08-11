import { Router } from "express";
import { fetchChamados } from "../services/chamados.js";
import { buildIndicadores } from "../services/indicadores.js";
import { carregarChamadosEnriquecidos } from "../services/enriquecimento.js";
import { buildIndicadoresManutencao, buildIndicadoresEngenharia } from "../services/indicadoresPorTaxonomia.js";

export const indicadoresRouter = Router();

indicadoresRouter.get("/indicadores", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { data, total, fetchedAt } = await fetchChamados({ forceRefresh });

    res.json({
      indicadores: buildIndicadores(data),
      registrosCarregados: data.length,
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
    const { chamados, totalOriginal } = await carregarChamadosEnriquecidos({ forceRefresh });

    res.json({
      totalOriginal,
      totalEnriquecido: chamados.length,
      porEspecialidade: {
        Manutenção: chamados.filter((c) => c.especialidade === "Manutenção").length,
        Engenharia: chamados.filter((c) => c.especialidade === "Engenharia").length,
      },
      amostra: chamados.slice(0, 5),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/manutencao", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const chamadosManutencao = chamados.filter((chamado) => chamado.especialidade === "Manutenção");

    res.json(buildIndicadoresManutencao(chamadosManutencao));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

indicadoresRouter.get("/engenharia", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const chamadosEngenharia = chamados.filter((chamado) => chamado.especialidade === "Engenharia");

    res.json(buildIndicadoresEngenharia(chamadosEngenharia));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
