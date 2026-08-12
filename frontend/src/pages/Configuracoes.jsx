import { useEffect, useState } from "react";
import { fetchConfiguracaoStatus, salvarConfiguracaoStatus } from "../api.js";

const BUCKETS = [
  { value: "concluido", label: "Concluído" },
  { value: "aguardandoAprovacao", label: "Aguardando Aprovação (não conta como aberto)" },
  { value: "aberto", label: "Em aberto" },
  { value: "outro", label: "Ignorar (não entra nos indicadores de status)" },
];

function classificarStatus(status, config) {
  if (config.statusConcluido.includes(status)) return "concluido";
  if (config.statusAguardandoAprovacao.includes(status)) return "aguardandoAprovacao";
  if (config.statusAberto.includes(status)) return "aberto";
  return "outro";
}

function moverStatus(config, status, novoBucket) {
  const limpo = {
    statusConcluido: config.statusConcluido.filter((s) => s !== status),
    statusAguardandoAprovacao: config.statusAguardandoAprovacao.filter((s) => s !== status),
    statusAberto: config.statusAberto.filter((s) => s !== status),
  };

  if (novoBucket === "concluido") limpo.statusConcluido.push(status);
  if (novoBucket === "aguardandoAprovacao") limpo.statusAguardandoAprovacao.push(status);
  if (novoBucket === "aberto") limpo.statusAberto.push(status);

  return limpo;
}

export default function Configuracoes() {
  const [state, setState] = useState({ status: "loading", config: null, statusDisponiveis: [], error: null });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetchConfiguracaoStatus()
      .then(({ config, statusDisponiveis }) => setState({ status: "ready", config, statusDisponiveis, error: null }))
      .catch((error) => setState({ status: "error", config: null, statusDisponiveis: [], error: error.message }));
  }, []);

  function handleMudarStatus(status, novoBucket) {
    setState((s) => ({ ...s, config: moverStatus(s.config, status, novoBucket) }));
    setSalvo(false);
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const { config } = await salvarConfiguracaoStatus(state.config);
      setState((s) => ({ ...s, config }));
      setSalvo(true);
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    } finally {
      setSalvando(false);
    }
  }

  if (state.status === "loading") return <p className="subtitle">Carregando configuração...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar configuração: {state.error}</div>;

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Classificação de status</h2>
          <p className="subtitle">
            Define quais status contam como concluído, em aberto ou aguardando aprovação nos indicadores (% de resolução, contagem de
            abertos, etc). Chamados "Aguardando Aprovação" ficam separados de propósito — não contam negativamente enquanto o
            orçamento não é avaliado.
          </p>
        </div>
        <button className="refresh-btn" onClick={handleSalvar} disabled={salvando}>
          {salvando ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar alterações"}
        </button>
      </div>

      <div className="panel full-width">
        {state.statusDisponiveis.map((status) => (
          <div key={status} className="config-status-row">
            <span>{status}</span>
            <select value={classificarStatus(status, state.config)} onChange={(e) => handleMudarStatus(status, e.target.value)}>
              {BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
