// store/spotify.ts
import { create } from 'zustand';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_CLIENT_ID = '372d82bb1a034f62b4c8adce142c02dd';
const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

const K_ACCESS = 'sp_access_token';
const K_REFRESH = 'sp_refresh_token';
const K_EXPIRES = 'sp_expires_at';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  request: AuthSession.AuthRequest | null;

  init: () => Promise<void>;
  signIn: () => Promise<void>;
  ensureToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

export const useSpotify = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  request: null,

  init: async () => {
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'runify', path: 'callback' });
    const req = new AuthSession.AuthRequest({
      clientId: SPOTIFY_CLIENT_ID,
      scopes: ['playlist-read-private', 'playlist-read-collaborative', 'user-read-email'],
      usePKCE: true,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
    });
    await req.makeAuthUrlAsync(discovery);

    const [access, refresh, expStr] = await Promise.all([
      SecureStore.getItemAsync(K_ACCESS),
      SecureStore.getItemAsync(K_REFRESH),
      SecureStore.getItemAsync(K_EXPIRES),
    ]);

    set({
      request: req,
      accessToken: access ?? null,
      refreshToken: refresh ?? null,
      expiresAt: expStr ? Number(expStr) : null,
    });
  },

  signIn: async () => {
    const { request } = get();
    if (!request) throw new Error('Auth not initialized');

    const res = await request.promptAsync(discovery);
    if (res.type !== 'success' || !res.params?.code) return;

    const token = await AuthSession.exchangeCodeAsync(
      {
        clientId: SPOTIFY_CLIENT_ID,
        code: res.params.code,
        redirectUri: request.redirectUri!,
        extraParams: { code_verifier: request.codeVerifier || '' },
      },
      discovery
    );

    const expiresAt = token.expiresIn ? Date.now() + token.expiresIn * 1000 : null;

    set({
      accessToken: token.accessToken ?? null,
      refreshToken: token.refreshToken ?? null,
      expiresAt,
    });

    await Promise.all([
      SecureStore.setItemAsync(K_ACCESS, token.accessToken ?? ''),
      token.refreshToken ? SecureStore.setItemAsync(K_REFRESH, token.refreshToken) : Promise.resolve(),
      expiresAt ? SecureStore.setItemAsync(K_EXPIRES, String(expiresAt)) : Promise.resolve(),
    ]);
  },

  ensureToken: async () => {
    const { accessToken, refreshToken, expiresAt } = get();
    const nearExpiry = !expiresAt || Date.now() > expiresAt - 30_000;

    if (accessToken && !nearExpiry) return accessToken;
    if (!refreshToken) return null;

    const refreshed = await AuthSession.refreshAsync(
      { clientId: SPOTIFY_CLIENT_ID, refreshToken },
      discovery
    );

    const newExpires = refreshed.expiresIn ? Date.now() + refreshed.expiresIn * 1000 : null;

    set({
      accessToken: refreshed.accessToken ?? null,
      refreshToken: refreshed.refreshToken ?? refreshToken,
      expiresAt: newExpires,
    });

    await Promise.all([
      SecureStore.setItemAsync(K_ACCESS, refreshed.accessToken ?? ''),
      SecureStore.setItemAsync(K_REFRESH, refreshed.refreshToken ?? refreshToken),
      newExpires ? SecureStore.setItemAsync(K_EXPIRES, String(newExpires)) : Promise.resolve(),
    ]);

    return refreshed.accessToken ?? null;
  },

  signOut: async () => {
    set({ accessToken: null, refreshToken: null, expiresAt: null });
    await Promise.all([
      SecureStore.deleteItemAsync(K_ACCESS),
      SecureStore.deleteItemAsync(K_REFRESH),
      SecureStore.deleteItemAsync(K_EXPIRES),
    ]);
  },
}));
