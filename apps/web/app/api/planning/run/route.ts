import { NextResponse, type NextRequest } from "next/server";
import { resolveApiOrigin } from "../../../../lib/content-security-policy";

export async function POST(request: NextRequest) {
  const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);
  if (!origin) {
    return NextResponse.json({ error: { code: "service_unavailable" } }, { status: 503 });
  }

  const cookie = request.headers.get("cookie") ?? "";
  try {
    const body = await request.text();
    const apiResponse = await fetch(`${origin}/api/planning/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body,
    });
    const data = await apiResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: apiResponse.status });
  } catch {
    return NextResponse.json({ error: { code: "connection_error" } }, { status: 502 });
  }
}
