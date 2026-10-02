import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "./lib/content-security-policy";

const documentHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const httpsEnabled = process.env.NODE_ENV === "production" && process.env.WEB_HTTPS === "true";
  const policy = contentSecurityPolicy({
    nonce,
    nodeEnv: process.env.NODE_ENV,
    apiOrigin: process.env.API_ORIGIN,
    httpsEnabled,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", policy);
  for (const [name, value] of Object.entries(documentHeaders)) {
    response.headers.set(name, value);
  }
  if (httpsEnabled) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
