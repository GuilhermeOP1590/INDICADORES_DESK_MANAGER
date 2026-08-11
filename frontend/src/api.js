async function getJson(path, opts = {}) {
  const { forceRefresh, ...rest } = opts;
  const params = new URLSearchParams();
  if (forceRefresh) params.set("refresh", "true");

  for (const [chave, valor] of Object.entries(rest)) {
    if (valor !== undefined && valor !== null && valor !== "") {
      params.set(chave, valor);
    }
  }

  const qs = params.toString();
  const response = await fetch(`${path}${qs ? `?${qs}` : ""}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.erro || `Falha ao carregar ${path}`);
  }

  return data;
}

export function fetchIndicadores(opts) {
  return getJson("/api/indicadores", opts);
}

export function fetchManutencao(opts) {
  return getJson("/api/manutencao", opts);
}

export function fetchEngenharia(opts) {
  return getJson("/api/engenharia", opts);
}

export function fetchChamadosFiltrados(filtros) {
  return getJson("/api/chamados", filtros);
}

export function fetchDetalheChamado(chave, codChamado) {
  return getJson(`/api/chamados/${chave}`, { codChamado });
}
