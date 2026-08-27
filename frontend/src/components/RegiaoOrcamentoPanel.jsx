import { useState } from "react";
import { StatTile } from "./StatTile.jsx";
import { SubTabs } from "./SubTabs.jsx";
import { MaximizableChart } from "./MaximizableChart.jsx";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ABAS_ORCAMENTO = [
  { value: "aprovado", label: "Aprovado" },
  { value: "pendente", label: "Pendente" },
  { value: "reprovado", label: "Reprovado" },
  { value: "todos", label: "Todos" },
];

// Cada aba mapeia pro filtro que /chamados já entende (statusAprovacao) — clicar numa barra
// sob qualquer aba abre só os chamados daquele status, não a mistura de sempre. "todos" usa o
// filtro combinado que já existia antes desta feature (pendente + avaliado).
const STATUS_POR_ABA = { aprovado: "avaliado", pendente: "aguardando", reprovado: "reprovado", todos: "comOrcamento" };

// Achata um nó (loja ou empresa, mesmo formato { aprovado, pendente, reprovado }) pro shape que
// HorizontalBarChart espera, já considerando a aba ativa. "Todos" mantém os 3 valores
// separados pro modo empilhado; as outras abas viram uma barra simples (mesmo path de sempre).
function montarRanking(lista, aba, uf, labelKey) {
  const daRegiao = (lista ?? []).filter((n) => n.uf === uf);

  if (aba === "todos") {
    return daRegiao
      .map((n) => {
        const total = n.aprovado.valor + n.pendente.valor + n.reprovado.valor;
        const quantidade = n.aprovado.total + n.pendente.total + n.reprovado.total;
        return {
          label: n[labelKey],
          total,
          // Mesmo racional de buildOrcamento: reprovado aparece na barra e no rótulo, mas
          // fica fora do critério de ordenação (não é "custo comprometido").
          ordenarPor: n.aprovado.valor + n.pendente.valor,
          aprovadoValor: n.aprovado.valor,
          pendenteValor: n.pendente.valor,
          reprovadoValor: n.reprovado.valor,
          rotulo: `${formatBRL(total)} (${quantidade})`,
          porEspecialidade: n.porEspecialidade,
        };
      })
      .sort((a, b) => b.ordenarPor - a.ordenarPor);
  }

  return daRegiao
    .map((n) => ({
      label: n[labelKey],
      total: n[aba].valor,
      rotulo: `${formatBRL(n[aba].valor)} (${n[aba].total})`,
      porEspecialidade: n.porEspecialidade,
    }))
    .filter((n) => n.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function RegiaoOrcamentoPanel({ porUf, porLoja, porEmpresa, filtroBase }) {
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);
  const [abaCusto, setAbaCusto] = useState("aprovado");
  const [abaEmpresa, setAbaEmpresa] = useState("aprovado");
  const regioes = (porUf ?? []).filter((u) => u.uf !== "Não informado");
  if (regioes.length === 0) return null;

  const clientesDaRegiao = regiaoSelecionada ? montarRanking(porLoja, abaCusto, regiaoSelecionada, "cliente") : [];
  const empresasDaRegiao = regiaoSelecionada ? montarRanking(porEmpresa, abaEmpresa, regiaoSelecionada, "empresa") : [];

  return (
    <div className="panel full-width">
      <h2>Orçamento por região</h2>
      <p className="subtitle">Valor pendente + já avaliado por estado — clique num card pra ver por unidade</p>
      <section className="stat-grid">
        {regioes.map((u) => {
          const total = u.aguardandoValor + u.avaliadosValor;
          return (
            <StatTile
              key={u.uf}
              label={u.uf}
              value={formatBRL(total)}
              meta={`${formatBRL(u.aguardandoValor)} aguardando · ${formatBRL(u.avaliadosValor)} avaliado`}
              statusClass={regiaoSelecionada === u.uf ? "status-good" : undefined}
              onClick={() => setRegiaoSelecionada((atual) => (atual === u.uf ? null : u.uf))}
            />
          );
        })}
      </section>

      {regiaoSelecionada && (
        <>
          <SubTabs options={ABAS_ORCAMENTO} active={abaCusto} onChange={setAbaCusto} />
          {clientesDaRegiao.length > 0 ? (
            <MaximizableChart
              title={`Custo por unidade — ${regiaoSelecionada}`}
              subtitle="Valor por loja/unidade — clique numa barra pra ver os chamados"
              data={clientesDaRegiao}
              color="var(--series-6)"
              limit={10}
              filtroBase={{ ...filtroBase, uf: regiaoSelecionada, statusAprovacao: STATUS_POR_ABA[abaCusto] }}
              dimensaoFiltro="cliente"
              formatValue={formatBRL}
              labelKey="rotulo"
              stacked={abaCusto === "todos"}
              yAxisWidth={220}
            />
          ) : (
            <p className="subtitle" style={{ marginTop: 12 }}>
              Nenhum chamado {ABAS_ORCAMENTO.find((a) => a.value === abaCusto).label.toLowerCase()} em {regiaoSelecionada} nesse período.
            </p>
          )}

          <SubTabs options={ABAS_ORCAMENTO} active={abaEmpresa} onChange={setAbaEmpresa} />
          {empresasDaRegiao.length > 0 ? (
            <MaximizableChart
              title={`Ranking por empresa — ${regiaoSelecionada}`}
              subtitle="Fornecedores com maior custo em orçamentos — clique numa barra pra ver os chamados"
              data={empresasDaRegiao}
              color="var(--series-2)"
              limit={10}
              filtroBase={{ ...filtroBase, uf: regiaoSelecionada, statusAprovacao: STATUS_POR_ABA[abaEmpresa] }}
              dimensaoFiltro="empresa"
              formatValue={formatBRL}
              labelKey="rotulo"
              stacked={abaEmpresa === "todos"}
              yAxisWidth={220}
            />
          ) : (
            <p className="subtitle" style={{ marginTop: 12 }}>
              Nenhuma empresa com custo {ABAS_ORCAMENTO.find((a) => a.value === abaEmpresa).label.toLowerCase()} em {regiaoSelecionada} nesse período.
            </p>
          )}
        </>
      )}
    </div>
  );
}
