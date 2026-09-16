// frontend/src/components/PcmPessoasTab.jsx
import { useEffect, useState } from "react";
import { fetchPcmPessoas, criarPcmGrupo, salvarPcmPessoaGrupo } from "../api.js";

export function PcmPessoasTab() {
  const [state, setState] = useState({ status: "loading", grupos: [], pessoas: [], error: null });
  const [novoGrupo, setNovoGrupo] = useState("");

  async function carregar() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const { grupos, pessoas } = await fetchPcmPessoas();
      setState({ status: "ready", grupos, pessoas, error: null });
    } catch (error) {
      setState({ status: "error", grupos: [], pessoas: [], error: error.message });
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleCriarGrupo(e) {
    e.preventDefault();
    if (!novoGrupo.trim()) return;
    try {
      const { grupos } = await criarPcmGrupo(novoGrupo.trim());
      setState((s) => ({ ...s, grupos, error: null }));
      setNovoGrupo("");
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    }
  }

  async function handleMudarGrupo(pessoa, grupo) {
    try {
      await salvarPcmPessoaGrupo(pessoa, grupo);
      setState((s) => ({
        ...s,
        error: null,
        pessoas: s.pessoas.map((p) => (p.pessoa === pessoa ? { ...p, grupo } : p)),
      }));
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    }
  }

  if (state.status === "loading") return <p className="subtitle">Carregando pessoas...</p>;
  if (state.status === "error") return <div className="state-banner error">Erro ao carregar pessoas: {state.error}</div>;

  const semGrupo = state.pessoas.filter((p) => !p.grupo);
  const comGrupo = state.pessoas.filter((p) => p.grupo);

  return (
    <div>
      <form className="filter-bar" onSubmit={handleCriarGrupo}>
        <input
          type="text"
          className="search-input"
          style={{ maxWidth: 220 }}
          placeholder="Nome do novo grupo..."
          value={novoGrupo}
          onChange={(e) => setNovoGrupo(e.target.value)}
        />
        <button className="refresh-btn" type="submit" disabled={!novoGrupo.trim()}>
          + Novo grupo
        </button>
      </form>

      {state.error && <div className="state-banner error">{state.error}</div>}

      {semGrupo.length > 0 && (
        <div className="state-banner warning">
          {semGrupo.length} pessoa(s) apareceram na distribuição do Desk mas ainda não têm grupo definido — classifique
          abaixo.
        </div>
      )}

      <div className="panel full-width">
        <table>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Grupo</th>
            </tr>
          </thead>
          <tbody>
            {[...semGrupo, ...comGrupo].map((p) => (
              <tr key={p.pessoa}>
                <td>{p.pessoa}</td>
                <td>
                  <select value={p.grupo ?? ""} onChange={(e) => handleMudarGrupo(p.pessoa, e.target.value)}>
                    <option value="" disabled>
                      Selecione um grupo...
                    </option>
                    {state.grupos.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {state.pessoas.length === 0 && (
              <tr>
                <td colSpan={2} className="meta">
                  Nenhuma pessoa encontrada na distribuição de chamados de Manutenção/Engenharia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
