const ESPECIALIDADES_EM_ESCOPO = new Set(["Manutenção", "Engenharia"]);

const PREFIXO_PREVENTIVA = "Preventiva - ";
const PREFIXO_ROTINA = "Rotinas - ";
const PREFIXO_SEGURANCA = "Segurança - ";

// "Outros" (subcategoria exata) e "Segurança - " têm regra própria abaixo — não entram
// mais nesse catch-all "Outros/Não classificado".
const NAO_EQUIPAMENTO = ["Sesmt - ", "Transporte - ", "Tranporte - ", "TESTE-DUPLO"];

function primeiroSegmento(categoria) {
  return categoria.split(" - ")[0].trim();
}

function restoSegmentos(categoria) {
  return categoria.split(" - ").slice(1).join(" - ").trim();
}

function ehNaoEquipamento(nomeSubCategoria) {
  return NAO_EQUIPAMENTO.some(
    (prefixo) => nomeSubCategoria === prefixo || nomeSubCategoria.startsWith(prefixo)
  );
}

export function classificarChamado(chamado, subCategoriaIndex) {
  const sub = subCategoriaIndex.get(chamado.SequenciaSubCategoria);
  if (!sub) return null;

  const especialidade = primeiroSegmento(sub.Categoria);
  if (!ESPECIALIDADES_EM_ESCOPO.has(especialidade)) return null;

  if (especialidade === "Engenharia") {
    return {
      especialidade,
      tipo: "Corretiva",
      tipoAtividade: restoSegmentos(sub.Categoria),
      equipamento: null,
    };
  }

  // especialidade === "Manutenção"
  const nomeSub = sub.SubCategoria;

  if (sub.Categoria === "Manutenção - Rotinas") {
    return { especialidade, tipo: "Rotina", tipoAtividade: null, equipamento: nomeSub };
  }

  if (nomeSub.startsWith(PREFIXO_PREVENTIVA)) {
    return {
      especialidade,
      tipo: "Preventiva",
      tipoAtividade: null,
      equipamento: nomeSub.slice(PREFIXO_PREVENTIVA.length),
    };
  }

  if (nomeSub.startsWith(PREFIXO_ROTINA)) {
    return {
      especialidade,
      tipo: "Rotina",
      tipoAtividade: null,
      equipamento: nomeSub.slice(PREFIXO_ROTINA.length),
    };
  }

  if (nomeSub.startsWith(PREFIXO_SEGURANCA)) {
    return {
      especialidade,
      tipo: "Segurança",
      tipoAtividade: null,
      equipamento: nomeSub.slice(PREFIXO_SEGURANCA.length),
    };
  }

  if (ehNaoEquipamento(nomeSub)) {
    return { especialidade, tipo: "Outros/Não classificado", tipoAtividade: null, equipamento: nomeSub };
  }

  return { especialidade, tipo: "Corretiva", tipoAtividade: null, equipamento: nomeSub };
}
