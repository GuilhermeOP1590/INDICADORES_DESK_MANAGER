import "dotenv/config";
import express from "express";
import cors from "cors";
import { indicadoresRouter } from "./routes/indicadores.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", indicadoresRouter);

app.get("/api/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});
