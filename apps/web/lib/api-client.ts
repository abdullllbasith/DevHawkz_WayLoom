export const WAYLOOM_CSRF_HEADER = "x-wayloom-csrf";

export function wayloomHeaders(csrfToken?: string): Headers {
  const headers = new Headers();
  if (csrfToken !== undefined && csrfToken.length > 0) {
    headers.set(WAYLOOM_CSRF_HEADER, csrfToken);
  }
  return headers;
}
