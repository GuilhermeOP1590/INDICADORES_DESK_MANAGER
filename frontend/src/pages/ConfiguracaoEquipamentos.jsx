import { useEffect, useMemo, useState } from "react";
import { fetchConfiguracaoEquipamentos, salvarConfiguracaoEquipamentos } from "../api.js";

function normalizarChave(texto) {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function ConfiguracaoEquipamentos() {
  const [state, setState] = useState({ status: "loading", config: null, equipamentosDisponiveis: [], error: null });
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [grupoParaAplicar, setGrupoParaAplicar] = useState("");
  const [novoGrupo, setNovoGrupo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetchConfiguracaoEquipamentos()
      .then(({ config, equipamentosDisponiveis }) => setState({ status: "ready", config, equipamentosDisponiveis, error: null }))
      .catch((error) => setState({ status: "error", config: null, equipamentosDisponiveis: [], error: error.message }));
  }, []);

  const equipamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return state.equipamentosDisponiveis;
    return state.equipamentosDisponiveis.filter((e) => e.label.toLowerCase().includes(termo));
  }, [state.equipamentosDisponiveis, busca]);

  const resumoPorGrupo = useMemo(() => {
    if (!state.config) return [];
    const contagem = new Map();
    for (const e of state.equipamentosDisponiveis) {
      const grupo = state.config.atribuicoes[normalizarChave(e.label)] ?? "Não classificado";
      contagem.set(grupo, (contagem.get(grupo) || 0) + e.total);
    }
    return [...contagem.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  }, [state.config, state.equipamentosDisponiveis]);

  function toggleSelecionado(label) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(label)) novo.delete(label);
      else novo.add(label);
      return novo;
    });
  }

  function aplicarGrupo() {
    if (!grupoParaAplicar || selecionados.size === 0) return;
    setState((s) => {
      const atribuicoes = { ...s.config.atribuicoes };
      for (const label of selecionados) {
        atribuicoes[normalizarChave(label)] = grupoParaAplicar;
      }
      return { ...s, config: { ...s.config, atribuicoes } };
    });
    setSelecionados(new Set());
    setGrupoParaAplicar("");
    setSalvo(false);
  }

  function adicionarGrupo() {
    const nome = novoGrupo.trim();
    if (!nome || state.config.grupos.includes(nome)) return;
    setState((s) => ({ ...s, config: { ...s.config, grupos: [...s.config.grupos, nome] } }));
    setNovoGrupo("");
    setSalvo(false);
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const { config } = await salvarConfiguracaoEquipamentos(state.config);
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
          <h2 style={{ margin: 0, fontSize: 16 }}>Classificação de equipamentos</h2>
          <p className="subtitle">
            Agrupa os valores de equipamento em categorias (Movimentação, Refrigeração, etc) usadas no painel "Por tipo de
            equipamento" de Manutenção. Marque um ou mais itens e atribua um grupo em lote.
          </p>
        </div>
        <button className="refresh-btn" onClick={handleSalvar} disabled={salvando}>
          {salvando ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar alterações"}
        </button>
      </div>

      <div className="equip-summary">
        {resumoPorGrupo.map((g) => (
          <span key={g.label} className="equip-summary-chip">
            {g.label}: <strong>{g.total}</strong>
          </span>
        ))}
      </div>

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar equipamento..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <input
          type="text"
          className="search-input"
          style={{ maxWidth: 220 }}
          placeholder="Nome do novo grupo..."
          value={novoGrupo}
          onChange={(e) => setNovoGrupo(e.target.value)}
        />
        <button className="refresh-btn" onClick={adicionarGrupo} disabled={!novoGrupo.trim()}>
          + Novo grupo
        </button>
      </div>

      <div className="equip-bulk-bar">
        <span className="meta">{selecionados.size} selecionado(s)</span>
        <select value={grupoParaAplicar} onChange={(e) => setGrupoParaAplicar(e.target.value)}>
          <option value="">Atribuir grupo...</option>
          {state.config.grupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="Não classificado">Não classificado</option>
        </select>
        <button className="refresh-btn" onClick={aplicarGrupo} disabled={!grupoParaAplicar || selecionados.size === 0}>
          Aplicar
        </button>
      </div>

      <div className="panel full-width equip-list">
        {equipamentosFiltrados.map((e) => {
          const grupoAtual = state.config.atribuicoes[normalizarChave(e.label)] ?? "Não classificado";
          return (
            <label key={e.label} className="equip-row">
              <input type="checkbox" checked={selecionados.has(e.label)} onChange={() => toggleSelecionado(e.label)} />
              <span>{e.label}</span>
              <span className="meta">{e.total} chamados</span>
              <span className={`equip-grupo-badge ${grupoAtual === "Não classificado" ? "sem-grupo" : ""}`}>{grupoAtual}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
