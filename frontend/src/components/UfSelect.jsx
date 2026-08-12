// Filtro de estado (UF) — vive junto da busca por texto no topo da página,
// filtrando os dados antes de chegar em qualquer tabela/gráfico daquela página.
export function UfSelect({ value, onChange, ufs }) {
  if (ufs.length === 0) return null;

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todos os estados</option>
      {ufs.map((uf) => (
        <option key={uf} value={uf}>
          {uf}
        </option>
      ))}
    </select>
  );
}
