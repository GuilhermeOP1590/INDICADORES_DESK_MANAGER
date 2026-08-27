import { ChamadosList } from "./ChamadosList.jsx";
import { ChamadoDetalhe } from "./ChamadoDetalhe.jsx";
import { ClienteResumoTable } from "./ClienteResumoTable.jsx";
import { BacklogResumoTable } from "./BacklogResumoTable.jsx";
import { HorizontalBarChart } from "./HorizontalBarChart.jsx";
import { NivelDetalhePanel } from "./NivelDetalhePanel.jsx";
import { RankingTable } from "./RankingTable.jsx";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLUNAS_ORCAMENTO = [
  { header: "Aprovado", render: (d) => formatBRL(d.aprovadoValor), sortKeyName: "aprovadoValor" },
  { header: "Pendente", render: (d) => formatBRL(d.pendenteValor), sortKeyName: "pendenteValor" },
  { header: "Reprovado", render: (d) => (d.reprovadoValor > 0 ? formatBRL(d.reprovadoValor) : "—"), sortKeyName: "reprovadoValor" },
];

// Achata um nó {aprovado:{valor}, pendente:{valor}, reprovado:{valor}} do payload de
// buildPorLojaOrcamento pro formato flat que RankingTable/colunasExtras esperam.
function linhaOrcamento(no, label) {
  return {
    label,
    total: no.aprovado.valor + no.pendente.valor,
    aprovadoValor: no.aprovado.valor,
    pendenteValor: no.pendente.valor,
    reprovadoValor: no.reprovado.valor,
  };
}

export function DrillDownContent({ topo, onAbrirChamado, onAbrirLista, onAbrirResumoCategoria, onAbrirResumoEquipamento }) {
  if (topo?.tipo === "resumoCliente") {
    return (
      <ClienteResumoTable
        filtros={topo.filtros}
        onSelecionarEspecialidade={(especialidade) =>
          onAbrirLista({ ...topo.filtros, especialidade }, `${topo.titulo} — ${especialidade}`)
        }
      />
    );
  }

  if (topo?.tipo === "resumoBacklog") {
    return <BacklogResumoTable dados={topo.dados} filtroBase={topo.filtroBase} onAbrirLista={onAbrirLista} />;
  }

  // Ranking de um subconjunto (ex: equipamentos de um grupo) — dados já prontos, sem fetch;
  // clicar numa barra abre a lista de chamados filtrada por aquele item específico.
  if (topo?.tipo === "subRanking") {
    const altura = Math.max(220, Math.min(topo.dados.length, 30) * 26);
    return (
      <HorizontalBarChart
        data={topo.dados}
        color={topo.color}
        limit={topo.dados.length}
        height={altura}
        formatValue={topo.formatValue}
        agregarOutros={false}
        onBarClick={(label) => onAbrirLista({ ...topo.filtroBase, equipamento: label }, label, topo.fetcher)}
      />
    );
  }

  // Orçamento por loja: 1º nível — Especialidade (Manutenção/Engenharia) de uma loja. Dado já
  // pronto no payload de /orcamento (ver buildPorLojaOrcamento), sem fetch.
  if (topo?.tipo === "resumoLojaOrcamento") {
    const linhas = topo.porEspecialidade.map((e) => ({ ...linhaOrcamento(e, e.especialidade), porCategoria: e.porCategoria }));
    return (
      <RankingTable
        data={linhas}
        nomeColuna="Especialidade"
        formatValue={formatBRL}
        colunasExtras={COLUNAS_ORCAMENTO}
        onSelecionar={(_label, _agregado, linha) =>
          onAbrirResumoCategoria(linha.porCategoria, `${topo.titulo} — ${linha.label}`, { ...topo.filtroBase, especialidade: linha.label })
        }
      />
    );
  }

  // Orçamento por loja: 2º nível — Categoria de custo dentro de uma especialidade. Se a
  // categoria tiver porEquipamento (só Manutenção), desce mais um nível; senão (Engenharia,
  // tipoAtividade já é o mais fino) vai direto pra lista de chamados.
  if (topo?.tipo === "resumoCategoriaOrcamento") {
    const linhas = topo.porCategoria.map((c) => ({ ...linhaOrcamento(c, c.categoria), porEquipamento: c.porEquipamento }));
    return (
      <RankingTable
        data={linhas}
        nomeColuna="Categoria de custo"
        formatValue={formatBRL}
        colunasExtras={COLUNAS_ORCAMENTO}
        onSelecionar={(_label, _agregado, linha) =>
          linha.porEquipamento
            ? onAbrirResumoEquipamento(linha.porEquipamento, `${topo.titulo} — ${linha.label}`, topo.filtroBase)
            : onAbrirLista({ ...topo.filtroBase, tipoAtividade: linha.label }, linha.label)
        }
      />
    );
  }

  // Orçamento por loja: 3º nível (só Manutenção) — Equipamento individual. Clicar abre a
  // lista de chamados de verdade (GET /api/chamados).
  if (topo?.tipo === "resumoEquipamentoOrcamento") {
    const linhas = topo.porEquipamento.map((e) => linhaOrcamento(e, e.equipamento));
    return (
      <RankingTable
        data={linhas}
        nomeColuna="Equipamento"
        formatValue={formatBRL}
        colunasExtras={COLUNAS_ORCAMENTO}
        onSelecionar={(label) => onAbrirLista({ ...topo.filtroBase, equipamento: label }, label)}
      />
    );
  }

  if (topo?.tipo === "nivelDetalhe") {
    return (
      <NivelDetalhePanel
        filtros={topo.filtros}
        fetcher={topo.fetcher}
        onAbrirLista={(extra, titulo) => onAbrirLista({ ...topo.filtros, ...extra }, titulo)}
      />
    );
  }

  if (topo?.tipo === "lista") {
    return <ChamadosList filtros={topo.filtros} onAbrirChamado={onAbrirChamado} fetcher={topo.fetcher} />;
  }

  if (topo?.tipo === "detalhe") {
    return <ChamadoDetalhe chave={topo.chamado.chave} codChamado={topo.chamado.codChamado} />;
  }

  return null;
}
