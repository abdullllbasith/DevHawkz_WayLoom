import { NextResponse, type NextRequest } from "next/server";
import { resolveApiOrigin } from "../../../../lib/content-security-policy";
import { WAYLOOM_CSRF_HEADER } from "../../../../lib/api-client";

export async function POST(request: NextRequest) {
  const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);
  if (!origin) {
    return NextResponse.json({ error: { code: "service_unavailable" } }, { status: 503 });
  }

  const cookie = request.headers.get("cookie") ?? "";
  const csrf = request.headers.get(WAYLOOM_CSRF_HEADER) ?? "";

  try {
    const apiResponse = await fetch(`${origin}/api/auth/logout`, {
      method: "POST",
      headers: {
        cookie,
        ...(csrf ? { [WAYLOOM_CSRF_HEADER]: csrf } : {}),
      },
    });

    const data = await apiResponse.json().catch(() => ({}));
    const response = NextResponse.json(data, { status: apiResponse.status });

    const setCookie = apiResponse.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }
    return response;
  } catch {
    return NextResponse.json({ error: { code: "connection_error" } }, { status: 502 });
  }
}
