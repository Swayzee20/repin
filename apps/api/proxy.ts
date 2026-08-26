import { type NextRequest, NextResponse } from "next/server";

const defaultWebOrigins = new Set([
  "http://localhost:8081",
  "http://localhost:8082",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
  "https://repin.vercel.app",
]);

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configuredOrigins = new Set(
    (process.env.MOBILE_WEB_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
  const allowedOrigin =
    origin && (defaultWebOrigins.has(origin) || configuredOrigins.has(origin))
      ? origin
      : null;
  const response =
    request.method === "OPTIONS"
      ? new NextResponse(null, { status: 204 })
      : NextResponse.next();

  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
