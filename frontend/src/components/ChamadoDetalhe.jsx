import { useEffect, useState } from "react";
import { fetchDetalheChamado } from "../api.js";
import { formatBR } from "../lib/datas.js";

function campoRef(campo) {
  return campo?.[0]?.text ?? "—";
}

export function ChamadoDetalhe({ chave, codChamado }) {
  const [state, setState] = useState({ status: "loading", dados: null, error: null });

  useEffect(() => {
    let cancelado = false;
    setState({ status: "loading", dados: null, error: null });

    fetchDetalheChamado(chave, codChamado)
      .then((dados) => {
        if (!cancelado) setState({ status: "ready", dados, error: null });
      })
      .catch((error) => {
        if (!cancelado) setState({ status: "error", dados: null, error: error.message });
      });

    return () => {
      cancelado = true;
    };
  }, [chave, codChamado]);

  if (state.status === "loading") return <p className="subtitle">Carregando chamado...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar chamado: {state.error}</div>;

  const { detalhe, interacoes } = state.dados;

  return (
    <div className="chamado-detalhe">
      <div className="chamado-cabecalho">
        <h3>
          {detalhe.CodChamado} — {detalhe.Assunto}
        </h3>
        <div className="chamado-campos">
          <span>
            <b>Status:</b> {detalhe.NomeStatus}
          </span>
          <span>
            <b>Solicitante:</b> {campoRef(detalhe.CodUsuario)}
          </span>
          <span>
            <b>Cliente:</b> {campoRef(detalhe.CodCliente)}
          </span>
          <span>
            <b>Operador:</b> {campoRef(detalhe.CodOperador)}
          </span>
          <span>
            <b>Prioridade:</b> {campoRef(detalhe.CodPrioridadeAtual)}
          </span>
          <span>
            <b>Criado em:</b> {formatBR(detalhe.DataCriacao)} {detalhe.HoraCriacao}
          </span>
          {detalhe.DataFinalizacao && detalhe.DataFinalizacao !== "0000-00-00" && (
            <span>
              <b>Finalizado em:</b> {formatBR(detalhe.DataFinalizacao)} {detalhe.HoraFinalizacao}
            </span>
          )}
        </div>
        <div className="chamado-descricao" dangerouslySetInnerHTML={{ __html: detalhe.Descricao }} />
      </div>

      <h4>Interações ({interacoes.length})</h4>
      <div className="interacoes-lista">
        {interacoes.length === 0 && <p className="subtitle">Sem interações registradas.</p>}
        {interacoes.map((interacao) => (
          <div key={interacao.Chave} className="interacao-card">
            <div className="interacao-meta">
              <span>
                {formatBR(interacao.DataCriacao)} {interacao.HoraCriacao}
              </span>
              <span className="interacao-status">{interacao.Status?.[0]?.text}</span>
              <span>{campoRef(interacao.Operador)}</span>
            </div>
            <div className="interacao-texto" dangerouslySetInnerHTML={{ __html: interacao.Descricao }} />
            {interacao.NomeCausa && (
              <div className="interacao-extra">
                Causa: {interacao.NomeCausa} · Total de horas: {interacao.TotalHoras}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
