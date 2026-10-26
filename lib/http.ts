const TIMEOUT_MS = 8000;

export class NotFoundError extends Error {}

export class AdultContentError extends Error {}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 404) {
    throw new NotFoundError(`Not found: ${url}`);
  }

  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
