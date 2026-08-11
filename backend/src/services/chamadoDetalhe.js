import { deskPost } from "./deskApi.js";
import { callDeskMcpTool } from "./deskMcp.js";

async function fetchInteracoes({ chave, codChamado }) {
  const data = await callDeskMcpTool("dados_da_interacao_do_chamados", {
    body: { Chave: chave, CodChamado: codChamado, Solicitante: true },
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
