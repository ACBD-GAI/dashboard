export type JsonRecord = Record<string, unknown>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function allowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  return configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : ["http://localhost:5173", "http://localhost:8000"];
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowOrigin = origin && allowedOrigins().includes(origin)
    ? origin
    : allowedOrigins()[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(
  request: Request,
  body: JsonRecord,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function assertPost(request: Request): void {
  if (request.method !== "POST") {
    throw new HttpError(405, "Method not allowed");
  }
}

export async function readJson<T>(
  request: Request,
  maxBytes = 2_000_000,
): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new HttpError(413, "Request body is too large");
  }
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new HttpError(413, "Request body is too large");
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "A valid JSON request body is required");
  }
}

export function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      request,
      {
        error: error.message,
        message: error.message,
        details: error.details ?? null,
      },
      error.status,
    );
  }
  console.error(error);
  return json(
    request,
    {
      error: "An unexpected server error occurred",
      message: "An unexpected server error occurred",
    },
    500,
  );
}
