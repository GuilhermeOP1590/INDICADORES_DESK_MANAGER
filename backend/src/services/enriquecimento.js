import { classificarChamado } from "./taxonomia.js";
import { fetchSubCategorias } from "./subcategorias.js";
import { fetchUsuarios, fetchCodigoClientePorUsuario } from "./usuarios.js";
import { fetchUfPorCodigoCliente } from "./clientesUf.js";
import { fetchChamados } from "./chamados.js";

// "APROVADORES" é um cliente/unidade fictício, criado só pra testar o fluxo de aprovação de
// orçamento no DeskManager — não é uma unidade real, não deve aparecer em nenhum indicador.
export const CLIENTE_FICTICIO = "APROVADORES";

// ChaveUsuario -> CodigoCliente (usuarios.js) -> Uf (clientesUf.js). Ver
// decisoes/uf-do-chamado.md no Obsidian pra a origem desse encadeamento.
export function ufDoChamado(chamado, { codigoClientePorUsuario, ufPorCodigoCliente }) {
  return ufPorCodigoCliente.get(codigoClientePorUsuario.get(chamado.ChaveUsuario)) || null;
}

export function anexarUf(chamados, contexto) {
  return chamados.map((chamado) => ({ ...chamado, uf: ufDoChamado(chamado, contexto) }));
}

// Reaproveita a mesma classificação de taxonomia usada em Manutenção/Engenharia, mas sem
// descartar quem fica de fora do escopo (Sesmt, Transporte...) — essas viram "Outras áreas"
// em vez de sumir, já que aqui (Dashboard) o objetivo é enxergar TODOS os departamentos.
// Também anexa "tipo" (Preventiva/Corretiva/Rotina/Segurança) — mesma chamada de
// classificarChamado, sem custo extra — pra dar filtro por tipo nos painéis do Dashboard.
export function anexarArea(chamados, subCategoriaIndex) {
  return chamados.map((chamado) => {
    const classificacao = classificarChamado(chamado, subCategoriaIndex);
    return { ...chamado, area: classificacao?.especialidade ?? "Outras áreas", tipo: classificacao?.tipo ?? null };
  });
}

export function enriquecerChamados(chamados, { subCategoriaIndex, clientePorUsuario, codigoClientePorUsuario, ufPorCodigoCliente }) {
  const enriquecidos = [];

  for (const chamado of chamados) {
    const classificacao = classificarChamado(chamado, subCategoriaIndex);
    if (!classificacao) continue;

    const cliente = clientePorUsuario.get(chamado.ChaveUsuario) ?? null;
    if (cliente === CLIENTE_FICTICIO) continue;

    enriquecidos.push({
      ...chamado,
      ...classificacao,
      cliente,
      uf: ufDoChamado(chamado, { codigoClientePorUsuario, ufPorCodigoCliente }),
    });
  }

  return enriquecidos;
}

export async function carregarChamadosEnriquecidos({ forceRefresh = false } = {}) {
  const [{ data: chamados, total: totalOriginal }, subCategoriaIndex, clientePorUsuario, codigoClientePorUsuario, ufPorCodigoCliente] =
    await Promise.all([
      fetchChamados({ forceRefresh }),
      fetchSubCategorias({ forceRefresh }),
      fetchUsuarios({ forceRefresh }),
      fetchCodigoClientePorUsuario({ forceRefresh }),
      fetchUfPorCodigoCliente({ forceRefresh }),
    ]);

  const enriquecidos = enriquecerChamados(chamados, {
    subCategoriaIndex,
    clientePorUsuario,
    codigoClientePorUsuario,
    ufPorCodigoCliente,
  });

  return { chamados: enriquecidos, totalOriginal };
}
