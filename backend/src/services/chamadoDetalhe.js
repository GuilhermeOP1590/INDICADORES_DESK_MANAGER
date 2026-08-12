import { deskPost } from "./deskApi.js";
import { callDeskMcpTool } from "./deskMcp.js";

// "_8575"/"_9637" são os campos extras "Valor (R$)"/"Orçamento/Custo" — ver
// docs/fontes-de-dados/interacoes-do-chamado.md pra como isso foi descoberto.
async function fetchInteracoes({ chave, codChamado }) {
  const data = await callDeskMcpTool("dados_da_interacao_do_chamados", {
    body: {
      Chave: chave,
      CodChamado: codChamado,
      Solicitante: true,
      Colunas: {
        Chave: "on",
        Descricao: "on",
        Status: "on",
        Operador: "on",
        CodCausa: "on",
        DataCriacao: "on",
        HoraCriacao: "on",
        TotalHoras: "on",
        _8575: "on",
        _9637: "on",
      },
    },
  });

  return data.root ?? [];
}

export async function fetchDetalheChamado({ chave, codChamado }) {
  const [detalheResp, interacoes] = await Promise.all([
    deskPost("/ChamadosSuporte", { Chave: chave, CodChamado: codChamado, Solicitante: true }),
    fetchInteracoes({ chave, codChamado }),
  ]);

  return {
    detalhe: detalheResp.TChamado,
    interacoes,
  };
}
