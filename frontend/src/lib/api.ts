const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export interface ApiErrorShape {
  code: string;
  message: string;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = (await response.json().catch(() => null)) as
    | (T & { error?: ApiErrorShape })
    | null;

  if (!response.ok) {
    const code = data?.error?.code ?? 'REQUEST_FAILED';
    const message = data?.error?.message ?? 'İstek tamamlanamadı.';
    throw new ApiClientError(response.status, code, message);
  }

  return data as T;
}
