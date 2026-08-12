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

export function fetchManutencaoCausas(opts) {
  return getJson("/api/manutencao/causas", opts);
}

export function fetchEngenharia(opts) {
  return getJson("/api/engenharia", opts);
}

export function fetchEngenhariaCausas(opts) {
  return getJson("/api/engenharia/causas", opts);
}

export function fetchIndicadoresCausas(opts) {
  return getJson("/api/indicadores/causas", opts);
}

export function fetchOrcamento(opts) {
  return getJson("/api/orcamento", opts);
}

export function fetchUfsDisponiveis() {
  return getJson("/api/ufs", {});
}

export function fetchPeriodosDisponiveis() {
  return getJson("/api/periodos", {});
}

export function fetchChamadosFiltrados(filtros) {
  return getJson("/api/chamados", filtros);
}

export function fetchDashboardChamados(filtros) {
  return getJson("/api/dashboard/chamados", filtros);
}

export function fetchResumoCliente(filtros) {
  return getJson("/api/clientes/resumo", filtros);
}

export function fetchDetalheChamado(chave, codChamado) {
  return getJson(`/api/chamados/${chave}`, { codChamado });
}

export function fetchConfiguracaoStatus() {
  return getJson("/api/configuracao/status", {});
}

export async function salvarConfiguracaoStatus(config) {
  const response = await fetch("/api/configuracao/status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao salvar configuração");
  return data;
}

export function fetchConfiguracaoEquipamentos() {
  return getJson("/api/configuracao/equipamentos", {});
}

export async function salvarConfiguracaoEquipamentos(config) {
  const response = await fetch("/api/configuracao/equipamentos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Falha ao salvar configuração de equipamentos");
  return data;
}
