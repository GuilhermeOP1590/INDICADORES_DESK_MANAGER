import { useState } from "react";
import { SubTabs } from "../components/SubTabs.jsx";
import ConfiguracaoStatus from "./ConfiguracaoStatus.jsx";
import ConfiguracaoEquipamentos from "./ConfiguracaoEquipamentos.jsx";
import EquipamentosPorIc from "./EquipamentosPorIc.jsx";

const ABAS = [
  { value: "status", label: "Status" },
  { value: "equipamentos", label: "Equipamentos" },
  { value: "por-ic", label: "Por Ic" },
];

export default function Configuracoes() {
  const [aba, setAba] = useState("status");

  return (
    <div>
      <SubTabs options={ABAS} active={aba} onChange={setAba} />
      {aba === "status" && <ConfiguracaoStatus />}
      {aba === "equipamentos" && <ConfiguracaoEquipamentos />}
      {aba === "por-ic" && <EquipamentosPorIc />}
    </div>
  );
}
