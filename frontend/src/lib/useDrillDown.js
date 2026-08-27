import { useState } from "react";

// pilha === null  -> modal fechado
// pilha === []    -> modal aberto, mostrando a "raiz" (gráfico ou nada)
// pilha === [...] -> navegando (lista de chamados, detalhe de um chamado)
export function useDrillDown() {
  const [pilha, setPilha] = useState(null);

  function abrir() {
    setPilha([]);
  }

  function abrirLista(filtros, titulo, fetcher) {
    setPilha([{ tipo: "lista", filtros, titulo, fetcher }]);
  }

  function abrirResumoCliente(filtros, titulo) {
    setPilha([{ tipo: "resumoCliente", filtros, titulo }]);
  }

  // Painel de detalhe (atividade + lojas) de um nível de SLA — aberto ao clicar num card do
  // SlaNiveisPanel; guarda o fetcher pra que DrillDownContent saiba qual endpoint chamar.
  function abrirNivelDetalhe(filtros, titulo, fetcher) {
    setPilha([{ tipo: "nivelDetalhe", filtros, titulo, fetcher }]);
  }

  // Resumo do backlog (chamados criados antes do período, ainda abertos) — os dados já vêm
  // prontos do backend junto com /indicadores, não precisa de fetch próprio como resumoCliente.
  function abrirResumoBacklog(dados, filtroBase, titulo) {
    setPilha([{ tipo: "resumoBacklog", dados, filtroBase, titulo }]);
  }

  // Como abrirLista, mas empilha em vez de resetar — usada pra navegar de um resumo
  // (ex: resumoCliente) para a lista de chamados de uma linha específica, com "voltar" funcionando.
  function abrirListaEmpilhada(filtros, titulo, fetcher) {
    setPilha((p) => [...(p ?? []), { tipo: "lista", filtros, titulo, fetcher }]);
  }

  // Ranking de um subconjunto (ex: equipamentos de um grupo) — os dados já vêm prontos no
  // payload (sem fetch); ao clicar numa barra o consumidor decide o que abrir a seguir
  // (normalmente abrirListaEmpilhada com o filtro certo).
  function abrirSubRanking(dados, titulo, opts = {}) {
    setPilha((p) => [...(p ?? []), { tipo: "subRanking", dados, titulo, ...opts }]);
  }

  // Resumo de orçamento por loja (Manutenção x Engenharia) — dado já pronto no payload de
  // /orcamento, sem fetch. filtroBase carrega cliente/uf/período/statusAprovacao já herdados
  // do clique anterior, pra a lista de chamados no fim nunca vazar loja errada.
  function abrirResumoLojaOrcamento(porEspecialidade, titulo, filtroBase) {
    setPilha((p) => [...(p ?? []), { tipo: "resumoLojaOrcamento", porEspecialidade, titulo, filtroBase }]);
  }

  // Resumo por categoria de custo (grupo de equipamento em Manutenção, tipoAtividade em
  // Engenharia) dentro de uma especialidade de uma loja — mesmo racional, sem fetch.
  function abrirResumoCategoriaOrcamento(porCategoria, titulo, filtroBase) {
    setPilha((p) => [...(p ?? []), { tipo: "resumoCategoriaOrcamento", porCategoria, titulo, filtroBase }]);
  }

  // Resumo por equipamento individual dentro de uma categoria — só existe pra Manutenção.
  function abrirResumoEquipamentoOrcamento(porEquipamento, titulo, filtroBase) {
    setPilha((p) => [...(p ?? []), { tipo: "resumoEquipamentoOrcamento", porEquipamento, titulo, filtroBase }]);
  }

  function abrirChamado(chamado) {
    setPilha((p) => [...(p ?? []), { tipo: "detalhe", chamado, titulo: chamado.codChamado }]);
  }

  function voltar() {
    setPilha((p) => (p && p.length > 0 ? p.slice(0, -1) : p));
  }

  function fechar() {
    setPilha(null);
  }

  const topo = pilha && pilha.length > 0 ? pilha[pilha.length - 1] : null;

  return {
    pilha,
    topo,
    abrir,
    abrirLista,
    abrirResumoCliente,
    abrirNivelDetalhe,
    abrirResumoBacklog,
    abrirListaEmpilhada,
    abrirSubRanking,
    abrirResumoLojaOrcamento,
    abrirResumoCategoriaOrcamento,
    abrirResumoEquipamentoOrcamento,
    abrirChamado,
    voltar,
    fechar,
  };
}
