import { useState } from "react";
import { StatTile } from "./StatTile.jsx";
import { MaximizableChart } from "./MaximizableChart.jsx";

const formatBRL = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Um card por UF (hoje MG/BA) com o valor total em orçamento (pendente + avaliado). Clicar
// num card revela o ranking de unidades daquele estado — a "visão visual pra decisão" pedida:
// qual loja concentra mais orçamento dentro da região.
export function RegiaoOrcamentoPanel({ porUf, porLoja, filtroBase }) {
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);
  const regioes = (porUf ?? []).filter((u) => u.uf !== "Não informado");
  if (regioes.length === 0) return null;

  const clientesDaRegiao = regiaoSelecionada
    ? (porLoja ?? [])
        .filter((l) => l.uf === regiaoSelecionada)
        .map((l) => ({ label: l.cliente, total: l.aprovado.valor + l.pendente.valor, porEspecialidade: l.porEspecialidade }))
        .filter((l) => l.total > 0)
        .sort((a, b) => b.total - a.total)
    : [];

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

      {regiaoSelecionada && clientesDaRegiao.length > 0 && (
        <MaximizableChart
          title={`Custo por unidade — ${regiaoSelecionada}`}
          subtitle="Valor pendente + já avaliado, por loja/unidade — clique numa barra pra ver os chamados"
          data={clientesDaRegiao}
          color="var(--series-6)"
          limit={10}
          filtroBase={{ ...filtroBase, uf: regiaoSelecionada, statusAprovacao: "comOrcamento" }}
          dimensaoFiltro="cliente"
          formatValue={formatBRL}
        />
      )}

      {regiaoSelecionada && clientesDaRegiao.length === 0 && (
        <p className="subtitle" style={{ marginTop: 12 }}>
          Nenhum chamado com valor registrado em {regiaoSelecionada} nesse período.
        </p>
      )}
    </div>
  );
}
