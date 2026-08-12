import { useEffect, useState } from "react";
import { fetchUfsDisponiveis } from "../api.js";

export function useUfsDisponiveis() {
  const [ufs, setUfs] = useState([]);

  useEffect(() => {
    fetchUfsDisponiveis()
      .then((resultado) => setUfs(resultado.ufs))
      .catch(() => setUfs([]));
  }, []);

  return ufs;
}
