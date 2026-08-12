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
    ...config,
    statusConcluido: config.statusConcluido.filter((s) => s !== status),
    statusAguardandoAprovacao: config.statusAguardandoAprovacao.filter((s) => s !== status),
    statusAberto: config.statusAberto.filter((s) => s !== status),
  };

  if (novoBucket === "concluido") limpo.statusConcluido.push(status);
  if (novoBucket === "aguardandoAprovacao") limpo.statusAguardandoAprovacao.push(status);
  if (novoBucket === "aberto") limpo.statusAberto.push(status);

  return limpo;
}

export default function ConfiguracaoStatus() {
  const [state, setState] = useState({ status: "loading", config: null, statusDisponiveis: [], error: null });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [novoStatus, setNovoStatus] = useState("");

  useEffect(() => {
    fetchConfiguracaoStatus()
      .then(({ config, statusDisponiveis }) => setState({ status: "ready", config, statusDisponiveis, error: null }))
      .catch((error) => setState({ status: "error", config: null, statusDisponiveis: [], error: error.message }));
  }, []);

  function handleMudarStatus(status, novoBucket) {
    setState((s) => ({ ...s, config: moverStatus(s.config, status, novoBucket) }));
    setSalvo(false);
  }

  // Cadastra um status pelo nome antes dele ter aparecido em qualquer chamado carregado — só
  // guarda o nome pra manter a linha visível/editável com antecedência; a classificação em si
  // (aberto/concluído/etc) é escolhida do mesmo jeito, pelo select da linha.
  function handleAdicionarStatus() {
    const nome = novoStatus.trim();
    if (!nome) return;
    setState((s) => ({
      ...s,
      config: {
        ...s.config,
        statusExtrasConhecidos: [...new Set([...(s.config.statusExtrasConhecidos ?? []), nome])],
      },
    }));
    setNovoStatus("");
    setSalvo(false);
  }

  function handleRemoverExtra(status) {
    setState((s) => ({
      ...s,
      config: {
        statusConcluido: s.config.statusConcluido.filter((x) => x !== status),
        statusAguardandoAprovacao: s.config.statusAguardandoAprovacao.filter((x) => x !== status),
        statusAberto: s.config.statusAberto.filter((x) => x !== status),
        statusExtrasConhecidos: (s.config.statusExtrasConhecidos ?? []).filter((x) => x !== status),
      },
    }));
    setSalvo(false);
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const { config } = await salvarConfiguracaoStatus(state.config);
      setState((s) => ({ ...s, config, error: null }));
      setSalvo(true);
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
      setSalvo(false);
    } finally {
      setSalvando(false);
    }
  }

  if (state.status === "loading") return <p className="subtitle">Carregando configuração...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar configuração: {state.error}</div>;

  const statusExtras = state.config.statusExtrasConhecidos ?? [];
  const todosStatus = [...new Set([...state.statusDisponiveis, ...statusExtras])].sort((a, b) => a.localeCompare(b, "pt-BR"));

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

      {state.error && <div className="state-banner error">Erro ao salvar: {state.error}</div>}

      <div className="panel full-width">
        <h2>Cadastrar status com antecedência</h2>
        <p className="subtitle">
          Só aparecem acima os status que já ocorreram em algum chamado carregado. Se você sabe o nome de um status do DeskManager que
          ainda não apareceu (ex: "Orçamento Reprovado"), cadastre aqui pra já deixar classificado antes dele acontecer.
        </p>
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Nome exato do status no DeskManager..."
            value={novoStatus}
            onChange={(e) => setNovoStatus(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdicionarStatus()}
          />
          <button className="refresh-btn" onClick={handleAdicionarStatus} disabled={!novoStatus.trim()}>
            Adicionar
          </button>
        </div>
      </div>

      <div className="panel full-width">
        {todosStatus.map((status) => {
          const aindaNaoVisto = !state.statusDisponiveis.includes(status);
          return (
            <div key={status} className="config-status-row">
              <span>
                {status}
                {aindaNaoVisto && <span className="meta"> — ainda não visto em nenhum chamado</span>}
              </span>
              <select value={classificarStatus(status, state.config)} onChange={(e) => handleMudarStatus(status, e.target.value)}>
                {BUCKETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              {aindaNaoVisto && (
                <button className="remove-btn" onClick={() => handleRemoverExtra(status)}>
                  Remover
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
