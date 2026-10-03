import { NextResponse, type NextRequest } from "next/server";
import { resolveApiOrigin } from "../../../../lib/content-security-policy";

export async function POST(request: NextRequest) {
  const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);
  if (!origin) {
    return NextResponse.json(
      { error: { code: "service_unavailable", message: "API service not configured." } },
      { status: 503 },
    );
  }

  try {
    const body = await request.text();
    const apiResponse = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    const data = await apiResponse.json().catch(() => ({}));
    const response = NextResponse.json(data, { status: apiResponse.status });

    const setCookie = apiResponse.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }

    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "connection_error",
          message: "Unable to connect to authentication server. Please ensure the API is running.",
        },
      },
      { status: 502 },
    );
  }
}
