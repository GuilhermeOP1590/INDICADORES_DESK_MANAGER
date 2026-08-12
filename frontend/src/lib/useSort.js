import { useMemo, useState } from "react";

export function useSort(data, chaveInicial = null, direcaoInicial = "desc") {
  const [sortKey, setSortKey] = useState(chaveInicial);
  const [sortDir, setSortDir] = useState(direcaoInicial);

  function toggleSort(chave) {
    if (chave === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(chave);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const fator = sortDir === "asc" ? 1 : -1;

    return [...data].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === undefined || va === null) return 1;
      if (vb === undefined || vb === null) return -1;
      if (typeof va === "string") return va.localeCompare(vb, "pt-BR") * fator;
      return (va - vb) * fator;
    });
  }, [data, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggleSort };
}
