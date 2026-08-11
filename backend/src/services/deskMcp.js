const MCP_URL = `https://integrations.desk.ms/v1/mcp?publickey=${process.env.DESK_ENVIRONMENT_KEY}`;

export async function callDeskMcpTool(name, args) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DESK_OPERATOR_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  const payload = await response.json();
  const text = payload?.result?.content?.[0]?.text;

  if (!text) {
    throw new Error(`Resposta inesperada do MCP DeskManager para a tool "${name}"`);
  }

  const parsed = JSON.parse(text);

  if (parsed?.data?.erro) {
    throw new Error(`Erro na tool MCP "${name}": ${parsed.data.erro}`);
  }

  return parsed.data;
}
