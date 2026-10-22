// frontend/src/components/ColumnFilterTh.jsx
import { useEffect, useRef, useState } from "react";
import { buscaNormalizada, filtroAtivo } from "../lib/filtrosColuna.js";

function IconeFunil() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 2h13l-5 6.2V13l-3 1.5V8.2z" fill="currentColor" />
    </svg>
  );
}

function FiltroLista({ opcoes, selecionados, onChange }) {
  const [busca, setBusca] = useState("");
  const termo = buscaNormalizada(busca);
  const visiveis = termo ? opcoes.filter((o) => buscaNormalizada(o.valor).includes(termo)) : opcoes;

  function alternar(valor) {
    const novo = new Set(selecionados);
    if (novo.has(valor)) novo.delete(valor);
    else novo.add(valor);
    onChange(novo);
  }

  function marcarVisiveis() {
    onChange(new Set([...selecionados, ...visiveis.map((o) => o.valor)]));
  }

  return (
    <>
      <input
        type="text"
        className="search-input"
        placeholder="Buscar..."
        value={busca}
        autoFocus
        onChange={(e) => setBusca(e.target.value)}
      />
      <div className="col-filter-acoes">
        <button type="button" onClick={marcarVisiveis} disabled={visiveis.length === 0}>
          Marcar {termo ? "encontrados" : "todos"}
        </button>
        <button type="button" onClick={() => onChange(new Set())} disabled={selecionados.size === 0}>
          Limpar
        </button>
      </div>
      <ul className="col-filter-lista">
        {visiveis.map((o) => (
          <li key={o.valor}>
            <label>
              <input type="checkbox" checked={selecionados.has(o.valor)} onChange={() => alternar(o.valor)} />
              <span className="col-filter-valor">{o.valor}</span>
              <span className="meta">{o.total}</span>
            </label>
          </li>
        ))}
        {visiveis.length === 0 && <li className="meta">Nada encontrado.</li>}
      </ul>
      <p className="meta col-filter-dica">Nada marcado = mostra todos.</p>
    </>
  );
}

function FiltroTexto({ valor, onChange }) {
  return (
    <>
      <input
        type="text"
        className="search-input"
        placeholder="Contém..."
        value={valor}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="col-filter-acoes">
        <button type="button" onClick={() => onChange("")} disabled={!valor}>
          Limpar
        </button>
      </div>
    </>
  );
}

// Cabeçalho de tabela com ordenação (clique no título) + filtro da coluna (clique no funil).
// O filtro aplica na hora — não tem botão "OK" pra esquecer de apertar.
export function ColumnFilterTh({ coluna, filtro, opcoes, onChange, sortKey, sortDir, onSort, alinharDireita }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const ativo = filtroAtivo(coluna, filtro);
  const ordenando = sortKey === coluna.chave;

  useEffect(() => {
    if (!aberto) return undefined;
    function fecharSeFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    function fecharNoEsc(e) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fecharSeFora);
    document.addEventListener("keydown", fecharNoEsc);
    return () => {
      document.removeEventListener("mousedown", fecharSeFora);
      document.removeEventListener("keydown", fecharNoEsc);
    };
  }, [aberto]);

  // Um valor marcado que sumiu das opções (por causa de outro filtro) continua aparecendo
  // na lista com 0, senão o usuário não teria como desmarcá-lo.
  const opcoesComSelecionados =
    coluna.tipo === "lista" && ativo
      ? [
          ...opcoes,
          ...[...filtro].filter((v) => !opcoes.some((o) => o.valor === v)).map((valor) => ({ valor, total: 0 })),
        ]
      : opcoes;

  return (
    <th ref={ref} className="col-filter-th">
      <div className="col-filter-cabecalho">
        <span className="sortable-label" onClick={() => onSort(coluna.chave)}>
          {coluna.titulo}
          <span className="sort-arrow">{ordenando ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</span>
        </span>
        <button
          type="button"
          className={`col-filter-botao ${ativo ? "ativo" : ""}`}
          title={`Filtrar ${coluna.titulo}`}
          onClick={() => setAberto((a) => !a)}
        >
          <IconeFunil />
          {ativo && coluna.tipo === "lista" && <span className="col-filter-contador">{filtro.size}</span>}
        </button>
      </div>

      {aberto && (
        <div className={`col-filter-popover ${alinharDireita ? "direita" : ""}`}>
          {coluna.tipo === "texto" ? (
            <FiltroTexto valor={filtro ?? ""} onChange={onChange} />
          ) : (
            <FiltroLista opcoes={opcoesComSelecionados} selecionados={filtro ?? new Set()} onChange={onChange} />
          )}
        </div>
      )}
    </th>
  );
}
