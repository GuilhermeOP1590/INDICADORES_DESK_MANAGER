# Filtro de período por data de aprovação / inserção do orçamento — design

## Contexto

A tela de Orçamento (`Orcamento.jsx`) filtra hoje os chamados só pela
**data de criação** (`chamado.DataCriacao`), usando um ciclo fiscal de 26
do mês anterior a 25 do mês atual (`periodoMesFiscal`/`nomeMesFiscal` em
`lib/datas.js`, aplicado em `filtrarPorData` no backend). Isso é o único
eixo de tempo disponível: dá pra saber "quanto custo foi gerado por
chamados criados em agosto", mas não "quanto foi decidido (aprovado ou
reprovado) em agosto" nem "quanto valor foi lançado/pedido em agosto" —
um chamado criado em julho e aprovado em setembro nunca aparece no filtro
de setembro hoje.

Pedido: acrescentar dois eixos de tempo novos — **mês de aprovação**
(quando a decisão de aprovar/reprovar foi tomada) e **mês em que o
orçamento foi inserido** (quando o valor foi lançado no chamado, pedindo
aprovação) — cada um como **mês cheio** (dia 01 ao último dia do mês),
diferente do ciclo fiscal usado pra criação. Interface: minicards
clicáveis (mesmo padrão já usado pra selecionar UF em
`RegiaoOrcamentoPanel`), sem submenus adicionais, pra não pesar o
carregamento.

Decisões tomadas em conversa:

- **Mês de criação continua exatamente como hoje** (ciclo fiscal 26→25,
  dropdown atual) — zero mudança de comportamento nesse modo.
- **Aprovação** e **Orçamento inserido** são dois eixos de tempo
  DIFERENTES, não sinônimos: já existe uma data derivada
  (`historico.dataAprovacao`, calculada da interação em que o campo extra
  "Valor (R$)" foi lançado) — ela vira a base do modo **Orçamento
  inserido** (é literalmente esse evento). O modo **Aprovação** é dado
  novo: a data em que o status do chamado sai de "Aguardando Aprovação"
  pra outra coisa (aprovado ou "Orçamento Reprovado").
- Os 3 modos são um **seletor único** (mutuamente exclusivo), não um
  filtro combinável dos três ao mesmo tempo — a pergunta é "por qual data
  eu quero fatiar o período", não "e se eu quiser as três juntas".
- Janela de busca ampliada em **3 meses pra trás** do início do período
  escolhido, só nos modos Aprovação/Inserção (ver seção Backend) — decisão
  explícita do usuário, aceitando o trade-off de carregamento mais lento
  nesses 2 modos na primeira consulta (cache em memória de
  `historicoChamado.js` amortiza consultas repetidas do mesmo período).
- Resumo rápido (contagem que aparece antes do restante do payload
  carregar) fica indisponível nos modos Aprovação/Inserção — não dá pra
  mantê-lo rápido sem o histórico, que é exatamente o dado caro que esses
  2 modos precisam buscar mais cedo.

Fora de escopo: mudar a tabela "Histórico de aprovações" (continua usando
`dataAprovacao`/rótulo "Data da aprovação" como já é hoje — não é o
público-alvo desta feature); qualquer persistência em banco (o dado
continua derivado do Desk em tempo real, com cache em memória).

## Arquitetura

### Backend

**`backend/src/services/historicoChamado.js`** ganha uma extração nova,
`extrairDataDecisao`, no mesmo padrão cronológico já usado por
`extrairTempoAguardandoPecaDias` (interações vêm mais recentes primeiro,
inverte pra varrer em ordem cronológica):

```js
// Pega a data em que o chamado DEIXOU "Aguardando Aprovação" pela primeira vez — é a decisão
// real (aprovado ou reprovado), diferente de dataAprovacao (que é quando o valor foi lançado,
// pedindo aprovação — pode ser dias antes da decisão em si).
function extrairDataDecisao(interacoes) {
  const cronologico = [...interacoes].reverse();
  let passouPorAguardando = false;
  for (const interacao of cronologico) {
    const status = interacao.Status?.[0]?.text;
    if (status === "Aguardando Aprovação") {
      passouPorAguardando = true;
      continue;
    }
    if (passouPorAguardando && interacao.DataAcao) {
      return paraIso(interacao.DataAcao);
    }
  }
  return null;
}
```

`obterHistoricoChamado` e o catch de `obterHistoricoEmLote` ganham
`dataDecisao: extrairDataDecisao(interacoes)` / `dataDecisao: null` no
objeto de histórico retornado. Sem custo de rede extra — mesmas
interações já buscadas para `dataAprovacao`/`causa`/etc.

**`backend/src/services/filtros.js`** ganha 2 funções novas:

```js
// Amplia o início do período em N meses pra trás, mantendo o fim — usado quando o filtro real
// é por uma data derivada do histórico (aprovação/inserção), que só é conhecida DEPOIS de buscar
// o histórico: sem ampliar a janela de criação, um chamado criado antes do período mas decidido
// dentro dele nunca entraria no conjunto buscado.
export function ampliarParaTras(periodo, meses) {
  if (!periodo.dataInicio) return periodo;
  const [ano, mes, dia] = periodo.dataInicio.split("-").map(Number);
  const data = new Date(ano, mes - 1 - meses, dia);
  const pad2 = (n) => String(n).padStart(2, "0");
  const dataInicio = `${data.getFullYear()}-${pad2(data.getMonth() + 1)}-${pad2(data.getDate())}`;
  return { ...periodo, dataInicio };
}

// Filtra por uma data derivada do histórico (dataAprovacao ou dataDecisao) em vez de
// DataCriacao — mesma lógica de filtrarPorData, só que a data vem do historicoMap.
export function filtrarPorDataHistorico(chamados, historicoMap, campo, { dataInicio, dataFim } = {}) {
  if (!dataInicio && !dataFim) return chamados;
  return chamados.filter((chamado) => {
    const data = historicoMap.get(chamado.Chave)?.[campo];
    if (!data) return false;
    if (dataInicio && data < dataInicio) return false;
    if (dataFim && data > dataFim) return false;
    return true;
  });
}
```

**`backend/src/routes/indicadores.js`**, rota `GET /orcamento` (só essa —
`/orcamento/resumo-rapido` não ganha o parâmetro, ver decisão acima):

```js
const MESES_LOOKBACK_HISTORICO = 3;
const CAMPO_HISTORICO_POR_MODO = { aprovacao: "dataDecisao", insercao: "dataAprovacao" };

indicadoresRouter.get("/orcamento", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const periodo = lerPeriodo(req);
    const especialidade = req.query.especialidade || "Geral";
    const modoData = req.query.modoData || "criacao"; // "criacao" | "aprovacao" | "insercao"

    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const periodoBusca = modoData === "criacao" ? periodo : ampliarParaTras(periodo, MESES_LOOKBACK_HISTORICO);
    let candidatos = filtrarPorUf(buscarPorTexto(filtrarPorData(excluirCancelados(chamados), periodoBusca), req.query.q), req.query.uf);
    if (especialidade !== "Geral") {
      candidatos = candidatos.filter((c) => c.especialidade === especialidade);
    }

    const historicoMap = await obterHistoricoEmLote(candidatos);
    const noPeriodo =
      modoData === "criacao" ? candidatos : filtrarPorDataHistorico(candidatos, historicoMap, CAMPO_HISTORICO_POR_MODO[modoData], periodo);

    res.json({ especialidade, modoData, ...buildOrcamento(noPeriodo, historicoMap) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

Nenhuma outra rota muda. `buildOrcamento`/`buildPorLojaOrcamento`/
`buildPorEmpresaOrcamento` continuam recebendo `(noPeriodo, historicoMap)`
sem alteração — já funcionam com qualquer subconjunto de chamados.

### Frontend

**`frontend/src/lib/datas.js`** ganha o equivalente calendário do que já
existe pra mês fiscal:

```js
// Mês calendário cheio (dia 01 ao último dia) — diferente do ciclo fiscal (26→25) usado pro
// modo "Criação". `deslocamento` em meses (negativo = passado), mesmo padrão de deslocarMeses.
export function periodoMesCalendario(deslocamento = 0) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento + 1, 0);
  return { dataInicio: formatISO(inicio), dataFim: formatISO(fim) };
}

export function nomeMesCalendario(periodo) {
  const [ano, mes] = periodo.dataInicio.split("-").map(Number);
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
}

export function listaMesesCalendario(qtd = 15) {
  const lista = [];
  for (let i = 0; i < qtd; i++) {
    const periodo = periodoMesCalendario(-i);
    lista.push({ ...periodo, label: nomeMesCalendario(periodo) });
  }
  return lista;
}
```

**`frontend/src/lib/useMesesCalendarioDisponiveis.js`** (arquivo novo,
espelha `useMesesFiscaisDisponiveis.js` linha por linha, trocando
`listaMesesFiscais` por `listaMesesCalendario`):

```js
import { useEffect, useState } from "react";
import { fetchPeriodosDisponiveis } from "../api.js";
import { listaMesesCalendario } from "./datas.js";

export function useMesesCalendarioDisponiveis() {
  const [meses, setMeses] = useState(listaMesesCalendario());

  useEffect(() => {
    fetchPeriodosDisponiveis()
      .then(({ dataMinima, dataMaxima }) => {
        if (!dataMinima || !dataMaxima) return;
        setMeses(listaMesesCalendario().filter((mes) => mes.dataInicio <= dataMaxima && mes.dataFim >= dataMinima));
      })
      .catch(() => {});
  }, []);

  return meses;
}
```

**`frontend/src/components/DateFilterBar.jsx`** ganha uma prop nova,
`modo` (default `"criacao"`), que decide se lista meses fiscais ou
calendário — reescrita completa:

```jsx
import { useState } from "react";
import { periodoHoje, periodoOntem, periodoSemanaPassada, nomeMesFiscal, nomeMesCalendario } from "../lib/datas.js";
import { useMesesFiscaisDisponiveis } from "../lib/useMesesFiscaisDisponiveis.js";
import { useMesesCalendarioDisponiveis } from "../lib/useMesesCalendarioDisponiveis.js";

const PRESETS = [
  { key: "hoje", label: "Hoje", calcular: periodoHoje },
  { key: "ontem", label: "Ontem", calcular: periodoOntem },
  { key: "semana", label: "Semana passada", calcular: periodoSemanaPassada },
  { key: "personalizado", label: "Personalizado", calcular: null },
];

export function DateFilterBar({ periodo, onChange, modo = "criacao" }) {
  const [presetAtivo, setPresetAtivo] = useState("mes");
  const mesesFiscais = useMesesFiscaisDisponiveis();
  const mesesCalendario = useMesesCalendarioDisponiveis();
  const ehFiscal = modo === "criacao";
  const meses = ehFiscal ? mesesFiscais : mesesCalendario;
  const nomeMes = ehFiscal ? nomeMesFiscal : nomeMesCalendario;

  function selecionarPreset(preset) {
    setPresetAtivo(preset.key);
    if (preset.calcular) {
      onChange(preset.calcular());
    }
  }

  function selecionarMes(e) {
    const mes = meses.find((m) => m.label === e.target.value);
    if (!mes) return;
    setPresetAtivo("mes");
    onChange({ dataInicio: mes.dataInicio, dataFim: mes.dataFim });
  }

  return (
    <div className="date-filter-bar">
      <select
        className={`date-filter-select ${presetAtivo === "mes" ? "active" : ""}`}
        value={presetAtivo === "mes" ? nomeMes(periodo) : ""}
        onChange={selecionarMes}
      >
        <option value="" disabled>
          {ehFiscal ? "Mês fiscal (26 a 25)" : "Mês (01 ao fim)"}
        </option>
        {meses.map((mes) => (
          <option key={mes.label} value={mes.label}>
            {mes.label}
          </option>
        ))}
      </select>
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          className={`date-filter-btn ${presetAtivo === preset.key ? "active" : ""}`}
          onClick={() => selecionarPreset(preset)}
        >
          {preset.label}
        </button>
      ))}
      {presetAtivo === "personalizado" && (
        <span className="date-filter-custom">
          <input type="date" value={periodo.dataInicio ?? ""} onChange={(e) => onChange({ ...periodo, dataInicio: e.target.value })} />
          <span>até</span>
          <input type="date" value={periodo.dataFim ?? ""} onChange={(e) => onChange({ ...periodo, dataFim: e.target.value })} />
        </span>
      )}
    </div>
  );
}
```

Nota: quando `modo` muda (troca de minicard), `periodo` no componente pai
já é resetado pro mês correspondente ANTES de re-renderizar (ver
`Orcamento.jsx` abaixo) — `DateFilterBar` só reage ao `modo`/`periodo` que
recebe, não decide sozinho quando resetar.

**`frontend/src/pages/Orcamento.jsx`**: estado novo `modoData`, minicards
de seleção (reaproveitando `StatTile`, mesmo padrão de clique/destaque já
usado pra UF em `RegiaoOrcamentoPanel`), período resetado ao trocar de
modo, parâmetro `modoData` passado pras 2 chamadas de API, e resumo rápido
pulado fora do modo "criacao":

```jsx
import { periodoMesFiscal, periodoMesCalendario, deslocarMeses, formatBR } from "../lib/datas.js";
// ...

const MODOS_DATA = [
  { value: "criacao", label: "Criação", calcularPeriodo: periodoMesFiscal },
  { value: "aprovacao", label: "Aprovação", calcularPeriodo: () => periodoMesCalendario(0) },
  { value: "insercao", label: "Orçamento inserido", calcularPeriodo: () => periodoMesCalendario(0) },
];

export default function Orcamento() {
  const [modoData, setModoData] = useState("criacao");
  const [aba, setAba] = useState("Geral");
  const [periodo, setPeriodo] = useState(periodoMesFiscal());
  // ...resto do estado sem mudança

  function selecionarModoData(modo) {
    if (modo === modoData) return;
    setModoData(modo);
    setPeriodo(MODOS_DATA.find((m) => m.value === modo).calcularPeriodo());
  }

  async function carregarResumoRapido(forceRefresh = false) {
    if (modoData !== "criacao") return; // resumo rápido não busca histórico — não dá pra ficar rápido nesses 2 modos
    // ...resto sem mudança
  }

  async function load(forceRefresh = false) {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const payload = await fetchOrcamento({
        forceRefresh,
        especialidade: aba,
        modoData,
        ...periodo,
        q: busca || undefined,
        uf: uf || undefined,
      });
      setState({ status: "ready", payload, error: null });
    } catch (error) {
      setState({ status: "error", payload: null, error: error.message });
    }
  }

  useEffect(() => {
    carregarResumoRapido();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, modoData, periodo.dataInicio, periodo.dataFim, busca, uf]);

  // ...

  return (
    <div>
      <section className="stat-grid stat-grid-modo">
        {MODOS_DATA.map((m) => (
          <StatTile
            key={m.value}
            value={m.label}
            statusClass={modoData === m.value ? "status-good" : undefined}
            onClick={() => selecionarModoData(m.value)}
          />
        ))}
      </section>

      <div className="page-toolbar">
        <DateFilterBar periodo={periodo} onChange={setPeriodo} modo={modoData} />
        {/* ...botão Atualizar agora sem mudança */}
      </div>

      {modoData !== "criacao" && (
        <p className="subtitle" style={{ marginTop: -8, marginBottom: 12 }}>
          Filtrando por {modoData === "aprovacao" ? "mês de aprovação" : "mês em que o orçamento foi inserido"} — a busca
          inicial pode levar mais tempo (procura chamados criados um pouco antes do período também).
        </p>
      )}
      {/* ...resto sem mudança, exceto resumoRapido.dados só existir quando modoData === "criacao" */}
    </div>
  );
}
```

`frontend/src/api.js`: `fetchOrcamento` já repassa todo objeto de opções
como query string (padrão existente) — só precisa aceitar `modoData` no
objeto de entrada, sem mudança de assinatura (confirmar na implementação
que a função não filtra chaves específicas antes de montar a query).

## Testes

- `backend/src/services/historicoChamado.test.js`: `extrairDataDecisao` —
  retorna a data da primeira interação após "Aguardando Aprovação"; chamado
  que nunca passou por "Aguardando Aprovação" retorna `null`; chamado ainda
  "Aguardando Aprovação" (não decidido) retorna `null`; funciona igual pra
  aprovado e pra reprovado (não filtra por status final, só pela transição).
- `backend/src/services/filtros.test.js` (criar se não existir, seguindo
  padrão de `filtros.js`): `ampliarParaTras` — desloca `dataInicio` em N
  meses, mantém `dataFim`; `filtrarPorDataHistorico` — filtra pelo campo
  do historicoMap indicado, chamado sem entrada no historicoMap fica de
  fora, sem `dataInicio`/`dataFim` retorna tudo.
- Sem teste de rota automatizado (mesmo padrão já usado no projeto) —
  verificação manual via curl: `GET /orcamento?modoData=aprovacao&...`
  comparando com `modoData=criacao` no mesmo período, conferindo que um
  chamado criado no mês anterior mas aprovado no período aparece só no
  modo aprovação.
- Frontend sem framework de teste (mesmo padrão do projeto) — verificação
  manual: `npm run build` limpo, clicar nos 3 minicards, conferir que o
  dropdown de mês troca entre fiscal/calendário, que o período reseta ao
  trocar de modo, e que o resumo rápido desaparece fora do modo criação.

## Fluxo de dados (resumo)

```
GET /api/orcamento?modoData=aprovacao&dataInicio=2026-09-01&dataFim=2026-09-30&...
  periodoBusca = ampliarParaTras(periodo, 3)   // 2026-06-01 a 2026-09-30
  candidatos = chamados criados em periodoBusca (+ uf/texto/especialidade)
  historicoMap = obterHistoricoEmLote(candidatos)   // já busca dataDecisao junto
  noPeriodo = filtrarPorDataHistorico(candidatos, historicoMap, "dataDecisao", periodo)
  → buildOrcamento(noPeriodo, historicoMap)   // sem mudança nele mesmo

Orcamento.jsx:
  minicard "Aprovação" clicado → modoData="aprovacao", periodo reseta pro mês calendário atual
  DateFilterBar modo="aprovacao" → dropdown lista meses calendário (não fiscal)
  fetchOrcamento({ modoData, ...periodo, ... }) → payload já filtrado certo, sem mudança no
  resto da tela (RegiaoOrcamentoPanel, gráficos, tabelas seguem recebendo o mesmo formato)
```
