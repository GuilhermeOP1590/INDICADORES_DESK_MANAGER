import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Manutencao from "./pages/Manutencao.jsx";
import Engenharia from "./pages/Engenharia.jsx";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Indicadores Desk</h1>
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
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/manutencao" element={<Manutencao />} />
        <Route path="/engenharia" element={<Engenharia />} />
      </Routes>
    </div>
  );
}
