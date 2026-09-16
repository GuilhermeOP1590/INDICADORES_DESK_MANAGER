// backend/src/routes/pcm.js
import { Router } from "express";
import { carregarChamadosEnriquecidos } from "../services/enriquecimento.js";
import { listarGrupos, listarPessoasGrupo, criarGrupo, definirGrupoDaPessoa } from "../services/pcmPessoas.js";
import { excluirCancelados } from "../services/filtros.js";
import { isFinalizado } from "../services/indicadores.js";
import { atribuicaoDoChamado, resolverAtribuicaoEfetiva, salvarAtribuicao } from "../services/pcmAtribuicoes.js";
import { classificarPrazo } from "../services/prazo.js";
import { grupoDaPessoa } from "../services/pcmPessoas.js";

export const pcmRouter = Router();

function pessoasConhecidas(chamados) {
  const nomes = new Set();
  for (const c of chamados) {
    if (c.distribuicaoSistema) nomes.add(c.distribuicaoSistema);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

const URGENCIAS = ["Crítica", "Alta", "Média", "Baixa"];

function linhaAtribuicao(chamado) {
  const atribuicaoPcm = atribuicaoDoChamado(chamado.CodChamado);
  const efetiva = resolverAtribuicaoEfetiva(chamado, atribuicaoPcm, grupoDaPessoa);

  return {
    codChamado: chamado.CodChamado,
    chave: chamado.Chave,
    assunto: chamado.Assunto,
    status: chamado.NomeStatus,
    finalizado: isFinalizado(chamado),
    dataCriacao: chamado.DataCriacao,
    solicitante: chamado.solicitante,
    cliente: chamado.cliente,
    uf: chamado.uf,
    descricaoAbertura: chamado.descricaoAbertura,
    origem: efetiva.origem,
    pessoa: efetiva.pessoa,
    grupo: efetiva.grupo,
    urgencia: efetiva.urgencia,
    observacao: efetiva.observacao,
    dataPrevistaSolucao: efetiva.dataPrevistaSolucao,
    statusPrazo: classificarPrazo(efetiva.dataPrevistaSolucao),
  };
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

pcmRouter.get("/pcm/atribuicoes", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { situacao, grupo, pessoa, urgencia } = req.query;

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    let filtrados = excluirCancelados(chamados);
    if (situacao === "aberto") filtrados = filtrados.filter((c) => !isFinalizado(c));
    if (situacao === "fechado") filtrados = filtrados.filter((c) => isFinalizado(c));

    let linhas = filtrados.map(linhaAtribuicao);
    if (grupo) linhas = linhas.filter((l) => l.grupo === grupo);
    if (pessoa) linhas = linhas.filter((l) => l.pessoa === pessoa);
    if (urgencia) linhas = linhas.filter((l) => (l.urgencia ?? "Não classificado") === urgencia);

    res.json({ chamados: linhas });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});

pcmRouter.put("/pcm/atribuicoes/:codChamado", async (req, res) => {
  try {
    const { urgencia, observacao, dataPrevistaSolucao } = req.body;

    if (urgencia && !URGENCIAS.includes(urgencia)) {
      res.status(400).json({ erro: `Urgência "${urgencia}" inválida` });
      return;
    }

    const { chamados } = await carregarChamadosEnriquecidos({});
    const chamado = chamados.find((c) => c.CodChamado === req.params.codChamado);
    if (!chamado) {
      res.status(404).json({ erro: `Chamado ${req.params.codChamado} não encontrado` });
      return;
    }

    const efetivaAtual = resolverAtribuicaoEfetiva(chamado, atribuicaoDoChamado(chamado.CodChamado), grupoDaPessoa);

    if (efetivaAtual.grupo === "Sem grupo definido") {
      res.status(400).json({
        erro: `${efetivaAtual.pessoa ?? "Essa pessoa"} ainda não tem grupo definido — mapeie na aba "Pessoas/Grupos" antes de editar este chamado`,
      });
      return;
    }

    await salvarAtribuicao(chamado.CodChamado, {
      pessoa: efetivaAtual.pessoa,
      grupo: efetivaAtual.grupo,
      urgencia: urgencia !== undefined ? urgencia : efetivaAtual.urgencia,
      observacao: observacao !== undefined ? observacao : efetivaAtual.observacao,
      dataPrevistaSolucao: dataPrevistaSolucao !== undefined ? dataPrevistaSolucao : efetivaAtual.dataPrevistaSolucao,
    });

    res.json(linhaAtribuicao(chamado));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message });
  }
});
