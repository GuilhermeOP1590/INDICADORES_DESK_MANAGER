function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatBR(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatHoras(horas) {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} dias`;
}

export function periodoHoje() {
  const iso = formatISO(new Date());
  return { dataInicio: iso, dataFim: iso };
}

export function periodoOntem() {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const iso = formatISO(ontem);
  return { dataInicio: iso, dataFim: iso };
}

export function periodoSemanaPassada() {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0 = domingo
  const deslocamentoSegundaAtual = diaSemana === 0 ? 6 : diaSemana - 1;

  const segundaAtual = new Date(hoje);
  segundaAtual.setDate(hoje.getDate() - deslocamentoSegundaAtual);

  const domingoPassado = new Date(segundaAtual);
  domingoPassado.setDate(segundaAtual.getDate() - 1);

  const segundaPassada = new Date(domingoPassado);
  segundaPassada.setDate(domingoPassado.getDate() - 6);

  return { dataInicio: formatISO(segundaPassada), dataFim: formatISO(domingoPassado) };
}

// Ciclo de indicador: do dia 26 do mês anterior até o dia 26 do mês atual.
export function periodoMesFiscal() {
  const hoje = new Date();
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth();

  if (hoje.getDate() < 26) {
    mes -= 1;
    if (mes < 0) {
      mes = 11;
      ano -= 1;
    }
  }

  const inicio = new Date(ano, mes, 26);
  const fim = new Date(ano, mes + 1, 25);

  return { dataInicio: formatISO(inicio), dataFim: formatISO(fim) };
}

// Desloca um período em N meses (negativo = passado) — usado pra sugerir "mês anterior"
// como período de comparação, mantendo o mesmo tamanho de janela.
export function deslocarMeses(periodo, meses) {
  function deslocar(iso) {
    const [ano, mes, dia] = iso.split("-").map(Number);
    return formatISO(new Date(ano, mes - 1 + meses, dia));
  }
  return { dataInicio: deslocar(periodo.dataInicio), dataFim: deslocar(periodo.dataFim) };
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Nomeia o mês fiscal (26 a 25) pelo mês em que ele TERMINA — é o mês que o usuário reconhece
// como "o mês de agosto", mesmo o ciclo começando em 26/07.
export function nomeMesFiscal(periodo) {
  const [ano, mes] = periodo.dataFim.split("-").map(Number);
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
}

// Lista os últimos `qtd` meses fiscais (mais recente primeiro) — pra navegar direto por nome
// em vez de calcular datas manualmente.
export function listaMesesFiscais(qtd = 15) {
  const atual = periodoMesFiscal();
  const lista = [];
  for (let i = 0; i < qtd; i++) {
    const periodo = deslocarMeses(atual, -i);
    lista.push({ ...periodo, label: nomeMesFiscal(periodo) });
  }
  return lista;
}

function inicioDaSemana(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const diaSemana = data.getDay();
  const deslocamento = diaSemana === 0 ? 6 : diaSemana - 1;
  data.setDate(data.getDate() - deslocamento);
  return formatISO(data);
}

function mesDoISO(iso) {
  const [ano, mes] = iso.split("-");
  return `${ano}-${mes}`;
}

// Agrupa uma série diária [{label: "AAAA-MM-DD", total, fechados, abertos}] em semana ou mês.
export function agruparSerie(serieDiaria, granularidade) {
  if (granularidade === "dia") return serieDiaria;

  const chaveFn = granularidade === "semana" ? inicioDaSemana : mesDoISO;
  const somaPorChave = new Map();

  for (const ponto of serieDiaria) {
    const chave = chaveFn(ponto.label);
    const atual = somaPorChave.get(chave) || { total: 0, fechados: 0, abertos: 0 };
    atual.total += ponto.total;
    atual.fechados += ponto.fechados ?? 0;
    atual.abertos += ponto.abertos ?? 0;
    somaPorChave.set(chave, atual);
  }

  return [...somaPorChave.entries()]
    .map(([label, soma]) => ({ label, ...soma }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
