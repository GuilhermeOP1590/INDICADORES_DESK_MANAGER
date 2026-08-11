import { classificarChamado } from "./taxonomia.js";
import { fetchSubCategorias } from "./subcategorias.js";
import { fetchUsuarios } from "./usuarios.js";
import { fetchChamados } from "./chamados.js";

export function enriquecerChamados(chamados, { subCategoriaIndex, clientePorUsuario }) {
  const enriquecidos = [];

  for (const chamado of chamados) {
    const classificacao = classificarChamado(chamado, subCategoriaIndex);
    if (!classificacao) continue;

    enriquecidos.push({
      ...chamado,
      ...classificacao,
      cliente: clientePorUsuario.get(chamado.ChaveUsuario) ?? null,
    });
  }

  return enriquecidos;
}

export async function carregarChamadosEnriquecidos({ forceRefresh = false } = {}) {
  const [{ data: chamados, total: totalOriginal }, subCategoriaIndex, clientePorUsuario] = await Promise.all([
    fetchChamados({ forceRefresh }),
    fetchSubCategorias({ forceRefresh }),
    fetchUsuarios({ forceRefresh }),
  ]);

  const enriquecidos = enriquecerChamados(chamados, { subCategoriaIndex, clientePorUsuario });

  return { chamados: enriquecidos, totalOriginal };
}
