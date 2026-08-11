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

// Agrupa uma série diária [{label: "AAAA-MM-DD", total}] em semana ou mês.
export function agruparSerie(serieDiaria, granularidade) {
  if (granularidade === "dia") return serieDiaria;

  const chaveFn = granularidade === "semana" ? inicioDaSemana : mesDoISO;
  const somaPorChave = new Map();

  for (const ponto of serieDiaria) {
    const chave = chaveFn(ponto.label);
    somaPorChave.set(chave, (somaPorChave.get(chave) || 0) + ponto.total);
  }

  return [...somaPorChave.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
