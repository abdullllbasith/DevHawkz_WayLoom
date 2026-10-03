import { NextResponse, type NextRequest } from "next/server";
import { resolveApiOrigin } from "../../../../lib/content-security-policy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);
  if (!origin) {
    return NextResponse.json({ error: { code: "service_unavailable" } }, { status: 503 });
  }
  const { id } = await params;
  const cookie = request.headers.get("cookie") ?? "";
  try {
    const apiResponse = await fetch(`${origin}/api/orders/${encodeURIComponent(id)}`, {
      headers: { cookie },
      cache: "no-store",
    });
    const data = await apiResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: apiResponse.status });
  } catch {
    return NextResponse.json({ error: { code: "connection_error" } }, { status: 502 });
  }
}
