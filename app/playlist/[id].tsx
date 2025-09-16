// app/(tabs)/playlist/[id].tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Image as RNImage, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useSpotify } from '@/store/spotify';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';

/** ---------- Types ---------- */
type ImageT = { url: string };
type Playlist = {
  id: string;
  name: string;
  description?: string;
  images?: ImageT[];
  owner?: { display_name?: string };
  external_urls?: { spotify?: string };
  tracks?: { total: number };
};
type TrackItem = {
  added_at?: string;
  track?: {
    id?: string | null;
    name?: string;
    duration_ms?: number;
    artists?: { name: string }[];
    album?: { name: string; images?: ImageT[] };
  };
};
type TracksPage = { items: TrackItem[]; next: string | null };

/** ---------- Helpers ---------- */
const msToMinSec = (ms?: number) => {
  if (ms == null) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

async function getJSON<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify API error (${res.status})`);
  return res.json();
}

/** ---------- Mini skeleton ---------- */
function usePulse() {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}
const Skeleton = ({ style }: { style?: any }) => {
  const opacity = usePulse();
  return <Animated.View style={[{ backgroundColor: '#e5e7eb', opacity, borderRadius: 8 }, style]} />;
};

/** ---------- Screen ---------- */
export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ensureToken } = useSpotify();

  const [meta, setMeta] = useState<Playlist | null>(null);
  const [items, setItems] = useState<TrackItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cover = useMemo(() => meta?.images?.[0]?.url, [meta]);
  const spotifyUrl = useMemo(
    () => meta?.external_urls?.spotify ?? (id ? `https://open.spotify.com/playlist/${id}` : undefined),
    [meta?.external_urls?.spotify, id]
  );

  const loadMeta = useCallback(async () => {
    if (!id) return;
    setLoadingMeta(true); setError(null);
    try {
      const token = await ensureToken();
      if (!token) throw new Error('No token');
      const pl = await getJSON<Playlist>(`https://api.spotify.com/v1/playlists/${id}`, token);
      setMeta(pl);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load playlist');
    } finally {
      setLoadingMeta(false);
    }
  }, [id, ensureToken]);

  const loadInitialTracks = useCallback(async () => {
    if (!id) return;
    setLoadingTracks(true); setError(null);
    try {
      const token = await ensureToken();
      if (!token) throw new Error('No token');
      const page = await getJSON<TracksPage>(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`, token);
      setItems(page.items ?? []);
      setNextUrl(page.next ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load tracks');
    } finally {
      setLoadingTracks(false);
    }
  }, [id, ensureToken]);

  const loadMore = useCallback(async () => {
    if (!nextUrl || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = await ensureToken();
      if (!token) return;
      const page = await getJSON<TracksPage>(nextUrl, token);
      // de-dupe by track id (fallback to added_at)
      setItems((prev) => {
        const seen = new Set(prev.map(i => i.track?.id ?? i.added_at ?? ''));
        const merged = [...prev];
        for (const it of page.items ?? []) {
          const key = it.track?.id ?? it.added_at ?? Math.random().toString();
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(it);
          }
        }
        return merged;
      });
      setNextUrl(page.next ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [nextUrl, loadingMore, ensureToken]);

  // reset + load when id changes
  useEffect(() => {
    setMeta(null); setItems([]); setNextUrl(null);
    setError(null); setLoadingMeta(true); setLoadingTracks(true);
    loadMeta(); loadInitialTracks();
  }, [id, loadMeta, loadInitialTracks]);

  /** --------- Header (with skeleton + Spotify button) --------- */
  const header = useMemo(() => (
    <SafeAreaView >
    <ThemedView style={styles.headerWrap}>
      <ThemedView style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText type="link">Back</ThemedText>
        </Pressable>

        <Pressable
          disabled={!spotifyUrl || loadingMeta}
          onPress={async () => {
            if (!spotifyUrl) return;
            // Try opening the Spotify app; if not available, open in browser
            const appUrl = spotifyUrl.replace('https://open.', 'spotify:');
            const canOpen = await Linking.canOpenURL(appUrl);
            if (canOpen) {
              Linking.openURL(appUrl).catch(() => WebBrowser.openBrowserAsync(spotifyUrl));
            } else {
              WebBrowser.openBrowserAsync(spotifyUrl);
            }
          }}
          style={styles.spotifyBtn}
        >
          <ThemedText type="link">{loadingMeta ? '...' : 'Open in Spotify'}</ThemedText>
        </Pressable>
      </ThemedView>

      {loadingMeta ? (
        <ThemedView style={styles.hero}>
          <Skeleton style={[styles.cover, { borderRadius: 8 }]} />
          <ThemedView style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ height: 20, width: '70%' }} />
            <Skeleton style={{ height: 14, width: '45%' }} />
            <Skeleton style={{ height: 14, width: '90%' }} />
          </ThemedView>
        </ThemedView>
      ) : (
        <ThemedView style={styles.hero}>
          <RNImage
            source={cover ? { uri: cover } : require('@/assets/images/partial-react-logo.png')}
            style={styles.cover}
          />
          <ThemedView style={{ flex: 1, minWidth: 0 }}>
            <ThemedText type="subtitle" numberOfLines={2}>{meta?.name ?? 'Playlist'}</ThemedText>
            <ThemedText style={styles.subtle} numberOfLines={1}>
              {meta?.owner?.display_name ?? ''} • {meta?.tracks?.total ?? 0} tracks
            </ThemedText>
            {!!meta?.description && (
              <ThemedText style={[styles.subtle, { marginTop: 6 }]} numberOfLines={2}>
                {meta.description.replace(/<\/?[^>]+(>|$)/g, '')}
              </ThemedText>
            )}
          </ThemedView>
        </ThemedView>
      )}
    </ThemedView>
    </SafeAreaView>
  ), [loadingMeta, cover, meta, spotifyUrl]);

  /** --------- Track row and skeleton rows --------- */
  const renderItem = ({ item, index }: { item: TrackItem; index: number }) => {
    if (loadingTracks) {
      return (
        <ThemedView style={styles.trackRow}>
          <Skeleton style={{ width: 28, height: 16 }} />
          <Skeleton style={styles.trackThumb} />
          <ThemedView style={{ flex: 1, gap: 6 }}>
            <Skeleton style={{ height: 16, width: '70%' }} />
            <Skeleton style={{ height: 12, width: '50%' }} />
          </ThemedView>
          <Skeleton style={{ width: 40, height: 14 }} />
        </ThemedView>
      );
    }

    const t = item.track;
    const art = t?.album?.images?.[0]?.url ?? cover;
    const artists = (t?.artists ?? []).map(a => a.name).join(', ');

    return (
      <ThemedView style={styles.trackRow}>
        <ThemedText style={styles.index}>{index + 1}</ThemedText>
        <RNImage
          source={art ? { uri: art } : require('@/assets/images/partial-react-logo.png')}
          style={styles.trackThumb}
        />
        <ThemedView style={{ flex: 1, minWidth: 0 }}>
          <ThemedText numberOfLines={1} type="defaultSemiBold">
            {t?.name ?? '(Unavailable)'}
          </ThemedText>
          <ThemedText style={styles.subtle} numberOfLines={1}>
            {artists || t?.album?.name || ''}
          </ThemedText>
        </ThemedView>
        <ThemedText style={styles.duration}>{msToMinSec(t?.duration_ms)}</ThemedText>
      </ThemedView>
    );
  };

  const keyExtractor = (it: TrackItem, idx: number) =>
    String(it.track?.id ?? `${it.added_at}-${idx}`);

  /** --------- Render --------- */
  if (!!error && !loadingTracks && !loadingMeta) {
    return (
      <ThemedView style={[styles.center, { flex: 1 }]}>
        <ThemedText style={{ color: 'tomato' }}>{error}</ThemedText>
        <Pressable onPress={() => { loadMeta(); loadInitialTracks(); }} style={{ padding: 8 }}>
          <ThemedText type="link">Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <FlatList
      data={loadingTracks ? Array.from({ length: 12 }, () => ({} as TrackItem)) : items}
      keyExtractor={loadingTracks ? (_, i) => `sk-${i}` : keyExtractor}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      renderItem={renderItem}
      onEndReachedThreshold={0.4}
      onEndReached={loadingTracks ? undefined : loadMore}
      ListFooterComponent={loadingMore ? <ThemedView style={styles.footer}><ActivityIndicator /></ThemedView> : null}
      contentContainerStyle={{ paddingBottom: 16 }}
    />
  );
}

const styles = StyleSheet.create({
  headerWrap: { marginBottom: 8, paddingHorizontal: 16, paddingTop: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' },
  spotifyBtn: { paddingVertical: 6, paddingHorizontal: 8 },

  hero: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 8 },
  cover: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#eee' },

  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  subtle: { opacity: 0.7 },

  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 },
  index: { width: 28, textAlign: 'center', opacity: 0.7 },
  trackThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#eee' },
  duration: { width: 46, textAlign: 'right', opacity: 0.7 },

  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },
  footer: { paddingVertical: 12, alignItems: 'center' },
});
