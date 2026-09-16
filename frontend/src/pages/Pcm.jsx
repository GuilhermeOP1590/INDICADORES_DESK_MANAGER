// frontend/src/pages/Pcm.jsx
import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import { PcmPessoasTab } from "../components/PcmPessoasTab.jsx";

const TABS = [{ value: "pessoas", label: "Pessoas/Grupos" }];

export default function Pcm() {
  const [aba, setAba] = useState("pessoas");

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

      {aba === "pessoas" && <PcmPessoasTab />}
    </div>
  );
}
