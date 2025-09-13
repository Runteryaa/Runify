// lib/api.ts
const API_BASE = process.env.EXPO_PUBLIC_RUNIFY_API_BASE ?? 'http://localhost:3000';

export type PageParams = { cursor?: string | null; limit?: number };

export async function apiGet<T>(path: string, opts: { token?: string; query?: Record<string, any> } = {}): Promise<T> {
  const url = new URL(path, API_BASE);
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    // include credentials if you use cookie sessions:
    // credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${url.pathname} ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/** Your API response shape for playlists (cursor-based) */
export type PlaylistsResponse = {
  items: Array<{
    id: string;
    name: string;
    imageUrl?: string | null;
    totalTracks?: number | null;
    ownerName?: string | null;
  }>;
  nextCursor?: string | null;
};
