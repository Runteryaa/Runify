// store/spotify.ts
import { create } from 'zustand';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_CLIENT_ID = '372d82bb1a034f62b4c8adce142c02dd';
const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;

  request: AuthSession.AuthRequest | null;
  initAuth: () => Promise<void>;
  signIn: () => Promise<void>;
  refreshIfNeeded: () => Promise<void>;
  signOut: () => void;
};

export const useSpotify = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  request: null,

  initAuth: async () => {
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'runify', path: 'callback' });
    const req = new AuthSession.AuthRequest({
      clientId: SPOTIFY_CLIENT_ID,
      scopes: ['playlist-read-private', 'playlist-read-collaborative', 'user-read-email'],
      usePKCE: true,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
    });
    await req.makeAuthUrlAsync(discovery); // precompute
    set({ request: req });
  },

  signIn: async () => {
    const { request } = get();
    if (!request) throw new Error('Auth not initialized');
    const redirectUri = request.redirectUri!;
    const res = await request.promptAsync(discovery);
    if (res.type !== 'success' || !res.params?.code) return;

    const tokenRes = await AuthSession.exchangeCodeAsync(
      {
        clientId: SPOTIFY_CLIENT_ID,
        code: res.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier || '' },
      },
      discovery
    );
    set({
      accessToken: tokenRes.accessToken ?? null,
      refreshToken: tokenRes.refreshToken ?? null,
      expiresAt: tokenRes.expiresIn ? Date.now() + tokenRes.expiresIn * 1000 : null,
    });
  },

  refreshIfNeeded: async () => {
    const { expiresAt, refreshToken } = get();
    if (!expiresAt || Date.now() < expiresAt - 30_000 || !refreshToken) return;
    const refreshed = await AuthSession.refreshAsync({ clientId: SPOTIFY_CLIENT_ID, refreshToken }, discovery);
    set({
      accessToken: refreshed.accessToken ?? null,
      refreshToken: refreshed.refreshToken ?? refreshToken,
      expiresAt: refreshed.expiresIn ? Date.now() + refreshed.expiresIn * 1000 : null,
    });
  },

  signOut: () => set({ accessToken: null, refreshToken: null, expiresAt: null }),
}));
