import { Router } from "express";
import { fetchChamados } from "../services/chamados.js";
import { buildIndicadores } from "../services/indicadores.js";

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
