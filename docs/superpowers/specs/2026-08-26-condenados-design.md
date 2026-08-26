# Condenados (equipamento com laudo) — design

## Contexto

O status real do Desk `"Condenado e Laudo Anexo (Atenção)"` marca um
equipamento avaliado e reprovado pra uso, com laudo técnico anexado —
normalmente exige uma ação física fora do sistema (troca, descarte,
substituição). Já existe um card "Condenado (laudo)" em Manutenção
(commit `3e71753`), mas ele só conta chamados dentro do período filtrado
na tela — um condenado de um mês anterior desaparece da vista assim que o
usuário muda o filtro de data, mesmo que ninguém tenha tratado o caso
ainda. Isso é inaceitável pra esse tipo de pendência: "precisa ser tratada,
e não posso perder".

Decisões tomadas em conversa:

- Vira uma **página própria no menu** (`/condenados`), não um modal maior —
  mesmo padrão de "Prioritários": sempre acessível, nunca depende do filtro
  de data de nenhuma outra tela.
- Um chamado sai da lista de pendentes **automaticamente** quando alguém
  muda o status dele no Desk — sem marcação manual nesta tela (diferente de
  Prioritários, que tem flag manual). A página é um espelho direto do
  status atual no Desk, sempre.
- **Sem** nota/observação manual por item nesta primeira versão — só
  visibilidade automática. Pode entrar depois se fizer falta.
- Mostra causa e equipamento (Ic) de cada condenado — mesmo histórico já
  buscado em Orçamento/Equipamentos por Ic, mas aqui o custo é baixo porque
  a lista de condenados é filtrada primeiro (tipicamente poucos itens).
- O card que já existe em Manutenção **continua exatamente como está**
  (contagem do período filtrado — útil pra acompanhar "quantos apareceram
  esse mês") e ganha uma segunda linha, um link "Ver todos pendentes →"
  que leva pra `/condenados`. O mesmo card (usando o campo `condenado` que
  já existe no payload de Engenharia, mesma função `detalheDoGrupo`) entra
  também na aba Engenharia.
- A página `/condenados` mostra condenados de **Manutenção e Engenharia
  juntos** (o status não é exclusivo de nenhuma das duas).

Fora de escopo agora (revisitar se fizer falta): nota manual de
acompanhamento por item; réplica de "Abertos/Fechados/Todos" (não se
aplica — todo item na página está, por definição, com o status atual
"Condenado").

## Arquitetura

### Backend

**`backend/src/services/indicadoresPorTaxonomia.js`** (já exporta
`STATUS_CONDENADO`, do commit `3e71753`) ganha uma função nova:

```js
export function buildCondenados(chamados, historicoMap) {
  const condenados = chamados.filter((c) => c.NomeStatus === STATUS_CONDENADO);
  const hoje = new Date();

  const itens = condenados
    .map((c) => {
      const historico = historicoMap.get(c.Chave);
      return {
        chave: c.Chave,
        codChamado: c.CodChamado,
        assunto: c.Assunto,
        cliente: c.cliente ?? null,
        especialidade: c.especialidade ?? null,
        uf: c.uf ?? null,
        operador: [c.NomeOperador, c.SobrenomeOperador].filter(Boolean).join(" ") || "Sem operador",
        dataCriacao: c.DataCriacao,
        diasParado: diasEmAberto(c.DataCriacao, hoje), // importado de indicadores.js
        causa: historico?.causa ?? null,
        ics: historico?.ics ?? [],
      };
    })
    .sort((a, b) => (b.diasParado ?? 0) - (a.diasParado ?? 0)); // mais antigo primeiro

  return {
    total: itens.length,
    diasParadoMaisAntigo: itens[0]?.diasParado ?? null,
    itens,
  };
}
```

- Reaproveita `diasEmAberto` (já exportado de `indicadores.js`, criado no
  commit `38409aa` pro aging do backlog) — mesmo cálculo, sem duplicar.
  Diferença importante: no backlog ele só é chamado pra chamados **não
  finalizados** (`!isFinalizado(c)`); aqui é chamado **sem essa condição**,
  porque o que importa é "há quantos dias esse chamado está com status
  Condenado", independente de `DataFinalizacao` estar preenchida ou não.
- `ics` fica como array (um chamado pode referenciar mais de um
  equipamento, ver `extrairIcs` em `historicoChamado.js`) — o frontend
  junta com `", "` pra exibir.

**Rota nova em `backend/src/routes/indicadores.js`:**

```js
indicadoresRouter.get("/condenados", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const { chamados } = await carregarChamadosEnriquecidos({ forceRefresh });
    const semCancelados = excluirCancelados(chamados);

    // Filtra pelo status ANTES de buscar histórico — evita repetir a busca cara
    // (obterHistoricoEmLote) sobre milhares de chamados como Orçamento faz; aqui só
    // os poucos que já estão condenados pagam esse custo.
    const condenados = semCancelados.filter((c) => c.NomeStatus === STATUS_CONDENADO);
    const historicoMap = await obterHistoricoEmLote(condenados, { forceRefresh });

    res.json(buildCondenados(condenados, historicoMap));
  } catch (error) {
    console.error(error);
    res.status(502).json({ erro: error.message });
  }
});
```

Note que `buildCondenados` recebe `condenados` (já filtrado) em vez do
dataset inteiro — o filtro por status é feito uma vez na rota e reutilizado
tanto pra decidir quem entra no `obterHistoricoEmLote` quanto pra passar
pra `buildCondenados` (que internamente filtra de novo por segurança/API
limpa, mas sobre um array já pequeno — custo desprezível).

Sem parâmetro de período — a rota sempre olha o dataset inteiro carregado
(mesmo cache de 5min de `carregarChamadosEnriquecidos`/`fetchChamados`).

### Frontend

**`frontend/src/pages/ChamadosCondenados.jsx`** (nova, padrão
`ChamadosPrioritarios.jsx`):

- Busca ao montar (`useEffect` vazio), sem filtro de período/UF/busca na
  URL — é sempre "tudo, agora".
- Stat tiles: "Total pendente" e "Parado há mais tempo" (mostra
  `diasParadoMaisAntigo` dias, com meta = código/cliente do item mais
  antigo).
- Tabela simples (busca por texto + ordenação via `useSort`, sem os
  dropdowns de status/situação/área do `ChamadosList` — aqui não fazem
  sentido, todo item já compartilha o mesmo status): Código, Assunto,
  Cliente, Especialidade, Equipamento (Ic), Causa, Dias parado, Operador.
- Clique na linha abre o chamado (mesmo padrão de `useDrillDown` +
  `Modal` + `DrillDownContent` já usado em `ChamadosPrioritarios.jsx` e
  `PerfilIc`).
- Estado vazio: "Nenhum chamado condenado pendente no momento." (bom
  sinal, não é erro).

**`frontend/src/api.js`**: `fetchCondenados()` → `GET /api/condenados`.

**`frontend/src/App.jsx`**: novo `NavLink` "Condenados" → `/condenados`,
logo depois de "Prioritários" (mesma família de tela de acompanhamento
independente de período).

**`frontend/src/pages/Manutencao.jsx`** e **`frontend/src/pages/Engenharia.jsx`**:
o StatTile "Condenado (laudo)" que já existe (só em Manutenção hoje) recebe
um `meta` com link:

```jsx
<StatTile
  label="Condenado (laudo)"
  value={detalhe.condenado}
  statusClass={detalhe.condenado > 0 ? "status-critical" : undefined}
  meta={
    <Link to="/condenados" onClick={(e) => e.stopPropagation()}>
      Ver todos pendentes →
    </Link>
  }
  onClick={() => drill.abrirLista({ ...filtroBase, status: STATUS_CONDENADO }, "Condenado (laudo)")}
/>
```

`e.stopPropagation()` no link evita que o clique nele também dispare o
`onClick` do tile (que abriria o modal de lista do período). Em
Engenharia, `STATUS_CONDENADO` precisa ser declarado ali também (mesmo
valor literal — front e back não compartilham módulo, cada lado já
declara essa string localmente, mesmo padrão do commit `3e71753`).

## Testes

- `backend/src/services/indicadoresPorTaxonomia.test.js`: novo teste pra
  `buildCondenados` — filtra pelo status certo, calcula `diasParado`,
  ordena do mais antigo pro mais novo, junta `causa`/`ics` do
  `historicoMap`, ignora chamado sem histórico (`causa`/`ics` ficam
  null/[]).
- Sem teste de rota (padrão do projeto — rotas não têm suíte própria, só
  os serviços).

## Fluxo de dados (resumo)

```
GET /api/condenados
  → carregarChamadosEnriquecidos() [cache 5min]
  → excluirCancelados()
  → filtra NomeStatus === STATUS_CONDENADO   (tipicamente poucos itens)
  → obterHistoricoEmLote(condenados)          (barato: poucos itens)
  → buildCondenados(condenados, historicoMap)
  → { total, diasParadoMaisAntigo, itens: [...] }
```
