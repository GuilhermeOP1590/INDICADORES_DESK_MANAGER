// backend/src/routes/pcm.js
import { Router } from "express";
import { carregarChamadosEnriquecidos } from "../services/enriquecimento.js";
import { listarGrupos, listarPessoasGrupo, criarGrupo, definirGrupoDaPessoa } from "../services/pcmPessoas.js";

export const pcmRouter = Router();

function pessoasConhecidas(chamados) {
  const nomes = new Set();
  for (const c of chamados) {
    if (c.distribuicaoSistema) nomes.add(c.distribuicaoSistema);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

pcmRouter.get("/pcm/pessoas", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const pessoasGrupo = listarPessoasGrupo();

    const pessoas = pessoasConhecidas(chamados).map((pessoa) => ({
      pessoa,
      grupo: pessoasGrupo.get(pessoa) ?? null,
    }));

    res.json({ grupos: listarGrupos(), pessoas });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

pcmRouter.post("/pcm/grupos", async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) {
      res.status(400).json({ erro: "Nome do grupo é obrigatório" });
      return;
    }

    const grupos = await criarGrupo(nome);
    res.json({ grupos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});

pcmRouter.put("/pcm/pessoas/:pessoa", async (req, res) => {
  try {
    const { grupo } = req.body;
    if (!grupo || !listarGrupos().includes(grupo)) {
      res.status(400).json({ erro: `Grupo "${grupo}" não existe` });
      return;
    }

    const pessoasGrupo = await definirGrupoDaPessoa(req.params.pessoa, grupo);
    res.json({ pessoa: req.params.pessoa, grupo: pessoasGrupo.get(req.params.pessoa) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});
