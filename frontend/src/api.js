export async function fetchIndicadores({ forceRefresh = false } = {}) {
  const response = await fetch(`/api/indicadores${forceRefresh ? "?refresh=true" : ""}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.erro || "Falha ao carregar indicadores");
  }

  return data;
}
