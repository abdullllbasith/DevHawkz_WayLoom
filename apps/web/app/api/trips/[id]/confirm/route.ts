import { NextResponse, type NextRequest } from "next/server";
import { resolveApiOrigin } from "../../../../../lib/content-security-policy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);
  if (!origin) {
    return NextResponse.json({ error: { code: "service_unavailable" } }, { status: 503 });
  }

  const { id } = await params;
  const cookie = request.headers.get("cookie") ?? "";
  const csrf = request.headers.get("x-wayloom-csrf") ?? "";

  try {
    const apiResponse = await fetch(`${origin}/api/trips/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        ...(csrf ? { "x-wayloom-csrf": csrf } : {}),
      },
      body: "{}",
    });
    const data = await apiResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: apiResponse.status });
  } catch {
    return NextResponse.json({ error: { code: "connection_error" } }, { status: 502 });
  }
}
