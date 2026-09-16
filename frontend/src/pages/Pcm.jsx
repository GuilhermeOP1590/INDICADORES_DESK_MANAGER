// frontend/src/pages/Pcm.jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import { PcmPessoasTab } from "../components/PcmPessoasTab.jsx";
import { PcmAtribuicoesTab } from "../components/PcmAtribuicoesTab.jsx";

const TABS = [
  { value: "atribuicoes", label: "Atribuições" },
  { value: "pessoas", label: "Pessoas/Grupos" },
];

const FILTROS_SITUACAO = [
  { value: "aberto", label: "Aberto" },
  { value: "fechado", label: "Fechado" },
  { value: "todos", label: "Todos" },
];

export default function Pcm() {
  const [aba, setAba] = useState("atribuicoes");
  const [situacao, setSituacao] = useState("aberto");
  const situacaoQuery = situacao === "todos" ? "" : situacao;

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>PCM</h2>
          <p className="subtitle">
            Atribuição e acompanhamento de chamados de Manutenção/Engenharia por pessoa e grupo.
          </p>
        </div>
      </div>

      <SubTabs options={TABS} active={aba} onChange={setAba} />

      {aba === "atribuicoes" && <SubTabs options={FILTROS_SITUACAO} active={situacao} onChange={setSituacao} />}

      {aba === "atribuicoes" && <PcmAtribuicoesTab situacao={situacaoQuery} />}
      {aba === "pessoas" && <PcmPessoasTab />}
    </div>
  );
}
