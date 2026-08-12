import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Manutencao from "./pages/Manutencao.jsx";
import Engenharia from "./pages/Engenharia.jsx";
import Orcamento from "./pages/Orcamento.jsx";
import Performance from "./pages/Performance.jsx";
import Configuracoes from "./pages/Configuracoes.jsx";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Indicadores Manutenção - Melhoria Contínua</h1>
        <nav className="top-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/manutencao" className={({ isActive }) => (isActive ? "active" : "")}>
            Manutenção
          </NavLink>
          <NavLink to="/engenharia" className={({ isActive }) => (isActive ? "active" : "")}>
            Engenharia
          </NavLink>
          <NavLink to="/orcamento" className={({ isActive }) => (isActive ? "active" : "")}>
            Orçamento
          </NavLink>
          <NavLink to="/performance" className={({ isActive }) => (isActive ? "active" : "")}>
            Performance
          </NavLink>
          <NavLink to="/configuracoes" className={({ isActive }) => (isActive ? "active" : "")}>
            Configurações
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/manutencao" element={<Manutencao />} />
        <Route path="/engenharia" element={<Engenharia />} />
        <Route path="/orcamento" element={<Orcamento />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Routes>
    </div>
  );
}
