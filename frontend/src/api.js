async function getJson(path, { forceRefresh = false } = {}) {
  const response = await fetch(`${path}${forceRefresh ? "?refresh=true" : ""}`);
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
