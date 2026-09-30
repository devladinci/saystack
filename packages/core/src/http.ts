export type RequestHeaders = Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>);

export function resolveHeaders(headers?: RequestHeaders): Readonly<Record<string, string>> {
  return typeof headers === "function" ? headers() : (headers ?? {});
}
