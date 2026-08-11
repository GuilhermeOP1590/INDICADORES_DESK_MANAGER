const BASE_URL = process.env.DESK_API_BASE_URL;
const OPERATOR_KEY = process.env.DESK_OPERATOR_KEY;
const ENVIRONMENT_KEY = process.env.DESK_ENVIRONMENT_KEY;

let cachedToken = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 15 * 60 * 1000; // renova a cada 15min por segurança

async function login() {
  const response = await fetch(`${BASE_URL}/Login/autenticar`, {
    method: "POST",
    headers: {
      Authorization: OPERATOR_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ PublicKey: ENVIRONMENT_KEY }),
  });

  const data = await response.json();

  if (typeof data !== "string") {
    throw new Error(`Falha ao autenticar no DeskManager: ${JSON.stringify(data)}`);
  }

  return data;
}

export async function getToken({ forceRefresh = false } = {}) {
  const isExpired = Date.now() - tokenFetchedAt > TOKEN_TTL_MS;

  if (!cachedToken || isExpired || forceRefresh) {
    cachedToken = await login();
    tokenFetchedAt = Date.now();
  }

  return cachedToken;
}
