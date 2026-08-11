import { getToken } from "./deskAuth.js";

const BASE_URL = process.env.DESK_API_BASE_URL;

function looksLikeAuthError(data) {
  return data && typeof data === "object" && typeof data.erro === "string" &&
    /token|sess[aã]o/i.test(data.erro);
}

export async function deskPost(path, body = {}, { retryOnAuthError = true } = {}) {
  const token = await getToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (looksLikeAuthError(data) && retryOnAuthError) {
    await getToken({ forceRefresh: true });
    return deskPost(path, body, { retryOnAuthError: false });
  }

  if (data && typeof data === "object" && "erro" in data) {
    throw new Error(`Erro na API DeskManager (${path}): ${data.erro}`);
  }

  return data;
}
