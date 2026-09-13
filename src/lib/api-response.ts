export function jsonData(status: number, data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(status: number, message: string, issues?: string[]): Response {
  return new Response(JSON.stringify({ error: { message, ...(issues ? { issues } : {}) } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
}
