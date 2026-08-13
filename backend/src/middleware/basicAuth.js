import crypto from "node:crypto";

const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const AUTENTICACAO_ATIVA = Boolean(AUTH_USER) && Boolean(AUTH_PASSWORD);

// Sem as duas env vars definidas, a autenticação fica desligada — é o comportamento
// esperado em dev local, onde o .env não define AUTH_USER/AUTH_PASSWORD. Avisamos uma
// única vez na inicialização do módulo, não a cada request.
if (!AUTENTICACAO_ATIVA) {
  console.warn(
    "basicAuth: AUTH_USER/AUTH_PASSWORD não definidas — autenticação HTTP Basic está DESLIGADA."
  );
}

function credenciaisCoincidem(valorRecebido, valorEsperado) {
  const bufferRecebido = Buffer.from(valorRecebido);
  const bufferEsperado = Buffer.from(valorEsperado);

  // timingSafeEqual lança exceção se os buffers tiverem tamanhos diferentes — tratamos
  // isso antes de chamar, em vez de deixar a exceção vazar para o handler de erro.
  if (bufferRecebido.length !== bufferEsperado.length) return false;

  return crypto.timingSafeEqual(bufferRecebido, bufferEsperado);
}

function negarAcesso(res) {
  res.set("WWW-Authenticate", 'Basic realm="Indicadores Desk"');
  res.status(401).type("text/plain").send("Autenticação necessária.");
}

export function basicAuth(req, res, next) {
  if (!AUTENTICACAO_ATIVA) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Basic ")) {
    negarAcesso(res);
    return;
  }

  let usuario;
  let senha;
  try {
    const decodificado = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separadorIndex = decodificado.indexOf(":");
    if (separadorIndex === -1) {
      negarAcesso(res);
      return;
    }
    usuario = decodificado.slice(0, separadorIndex);
    senha = decodificado.slice(separadorIndex + 1);
  } catch {
    negarAcesso(res);
    return;
  }

  const usuarioValido = credenciaisCoincidem(usuario, AUTH_USER);
  const senhaValida = credenciaisCoincidem(senha, AUTH_PASSWORD);

  if (!usuarioValido || !senhaValida) {
    negarAcesso(res);
    return;
  }

  next();
}
