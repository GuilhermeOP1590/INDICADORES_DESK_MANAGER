import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { indicadoresRouter } from "./routes/indicadores.js";
import { basicAuth } from "./middleware/basicAuth.js";
import { inicializar as inicializarPrioridades } from "./services/prioridades.js";
import { inicializar as inicializarConfiguracaoEquipamentos } from "./services/configuracaoEquipamentos.js";
import { inicializar as inicializarConfiguracaoIndicadores } from "./services/configuracaoIndicadores.js";

const app = express();

app.use(cors());
app.use(express.json());

// /api/health precisa continuar acessível sem autenticação (health checks do Render não
// enviam credenciais), então é registrada antes do app.use(basicAuth) abaixo.
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use(basicAuth);

app.use("/api", indicadoresRouter);

// Serve o build do frontend (frontend/dist) a partir do mesmo processo Express — um único
// serviço no Render cobre API e estáticos. Se frontend/dist ainda não existir (build não
// rodado), express.static/sendFile apenas respondem 404 nas rotas não-API, sem derrubar o
// processo.
const FRONTEND_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");

app.use(express.static(FRONTEND_DIST));

// Fallback de SPA: o frontend usa react-router-dom com BrowserRouter, então rotas
// client-side (ex.: /manutencao) precisam servir o mesmo index.html. Como /api já foi
// montado antes, requests para /api/* não chegam aqui.
app.get("*", (req, res) => res.sendFile(path.join(FRONTEND_DIST, "index.html")));

const port = process.env.PORT || 3001;

// Carrega as configs do Supabase pra dentro do cache em memória de cada módulo antes de
// aceitar requisições — se o Supabase estiver fora do ar aqui, é melhor o processo falhar
// alto e visível do que subir servindo config quebrada/vazia por engano.
try {
  await Promise.all([inicializarPrioridades(), inicializarConfiguracaoEquipamentos(), inicializarConfiguracaoIndicadores()]);
} catch (error) {
  console.error("Falha ao inicializar configurações a partir do Supabase:", error);
  process.exit(1);
}

app.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});
