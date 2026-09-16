// backend/src/services/prazo.js

// Segunda-feira da semana de calendário que contém `data` — Date.getDay() é 0=domingo,
// 1=segunda... 6=sábado, então o desvio até a segunda é (1 - dia), exceto domingo (-6).
function inicioSemana(data) {
  const dia = data.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const inicio = new Date(data);
  inicio.setDate(data.getDate() + diff);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

// "Vence esta semana" usa semana de calendário (segunda a domingo), não janela móvel de 7
// dias — decisão tomada em conversa com o usuário.
export function classificarPrazo(dataPrevistaSolucao, hoje = new Date()) {
  if (!dataPrevistaSolucao) return "sem-data";

  const prevista = new Date(`${dataPrevistaSolucao}T00:00:00`);
  const hojeSemHora = new Date(hoje);
  hojeSemHora.setHours(0, 0, 0, 0);

  if (prevista < hojeSemHora) return "atrasado";

  const inicioSemanaAtual = inicioSemana(hojeSemHora);
  const fimSemanaAtual = new Date(inicioSemanaAtual);
  fimSemanaAtual.setDate(inicioSemanaAtual.getDate() + 6);
  fimSemanaAtual.setHours(23, 59, 59, 999);

  if (prevista >= inicioSemanaAtual && prevista <= fimSemanaAtual) return "vence-semana";

  return "no-prazo";
}
