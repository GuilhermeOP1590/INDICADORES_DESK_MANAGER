import { useEffect, useState } from "react";

// Espera o usuário parar de digitar antes de repassar o valor — evita disparar um fetch
// (às vezes caro, ex: Orçamento recalcula histórico de aprovação por chamado) a cada tecla.
export function useDebouncedValue(valor, delayMs = 400) {
  const [debounced, setDebounced] = useState(valor);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(valor), delayMs);
    return () => clearTimeout(timer);
  }, [valor, delayMs]);

  return debounced;
}
