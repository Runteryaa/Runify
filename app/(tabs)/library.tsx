// app/(tabs)/library.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image as RNImage, Pressable, StyleSheet, View } from 'react-native';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSpotify } from '@/store/spotify';

type Playlist = {
  id: string;
  name: string;
  tracks: { total: number };
  images?: { url: string }[];
  owner?: { display_name?: string };
};
type Page<T> = { items: T[]; next: string | null };

async function fetchPage(url: string, token: string): Promise<Page<Playlist>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify API error (${res.status})`);
  const json = await res.json();
  return { items: json.items ?? [], next: json.next ?? null };
}

export default function LibraryScreen() {
  const { request, initAuth, signIn, accessToken, refreshIfNeeded } = useSpotify();
  const [items, setItems] = useState<Playlist[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { initAuth(); }, [initAuth]);

  const loadInitial = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true); setError(null);
    try {
      await refreshIfNeeded();
      const page = await fetchPage('https://api.spotify.com/v1/me/playlists?limit=30', accessToken);
      setItems(page.items); setNextUrl(page.next);
    } catch (e: any) { setError(e?.message ?? 'Failed to load playlists'); }
    finally { setLoading(false); }
  }, [accessToken, refreshIfNeeded]);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setRefreshing(true);
    try {
      await refreshIfNeeded();
      const page = await fetchPage('https://api.spotify.com/v1/me/playlists?limit=30', accessToken);
      setItems(page.items); setNextUrl(page.next);
    } catch (e: any) { setError(e?.message ?? 'Failed to refresh'); }
    finally { setRefreshing(false); }
  }, [accessToken, refreshIfNeeded]);

  const loadMore = useCallback(async () => {
    if (!accessToken || !nextUrl || loadingMore) return;
    setLoadingMore(true);
    try {
      await refreshIfNeeded();
      const page = await fetchPage(nextUrl, accessToken);
      setItems((prev) => [...prev, ...page.items]); setNextUrl(page.next);
    } catch (e: any) { setError(e?.message ?? 'Failed to load more'); }
    finally { setLoadingMore(false); }
  }, [accessToken, nextUrl, loadingMore, refreshIfNeeded]);

  useEffect(() => { if (accessToken) loadInitial(); }, [accessToken, loadInitial]);

  const header = useMemo(() => (
    <ThemedView style={styles.header}>
      <ThemedText type="title">Library</ThemedText>
      <ThemedText style={styles.subtle}>Your Spotify playlists</ThemedText>
    </ThemedView>
  ), []);

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <RNImage source={require('@/assets/images/partial-react-logo.png')} style={styles.reactLogo} />
      }
    >
      {header}

      {!accessToken ? (
        <ThemedView style={styles.center}>
          <ThemedText style={styles.subtle}>Sign in to Spotify to view your playlists.</ThemedText>
          <Pressable
            disabled={!request}
            onPress={signIn}
            style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#d4d4d8', opacity: pressed || !request ? 0.7 : 1 }]}
          >
            <ThemedText type="defaultSemiBold">Sign in with Spotify</ThemedText>
          </Pressable>
          {error ? <ThemedText style={{ marginTop: 8, color: 'tomato' }}>{error}</ThemedText> : null}
        </ThemedView>
      ) : loading && items.length === 0 ? (
        <ThemedView style={styles.center}>
          <ActivityIndicator />
          <ThemedText style={styles.subtle}>Loading playlists…</ThemedText>
        </ThemedView>
      ) : error ? (
        <ThemedView style={styles.center}>
          <ThemedText style={{ color: 'tomato' }}>{error}</ThemedText>
          <ThemedText style={styles.subtle}>Pull to retry</ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          onRefresh={refresh}
          refreshing={refreshing}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListEmptyComponent={<ThemedView style={styles.center}><ThemedText>No playlists found.</ThemedText></ThemedView>}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <ThemedView style={styles.row}>
              <RNImage
                source={item.images?.[0]?.url ? { uri: item.images[0].url } : require('@/assets/images/partial-react-logo.png')}
                style={styles.cover}
              />
              <ThemedView style={styles.col}>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>{item.name}</ThemedText>
                <ThemedText style={styles.subtle} numberOfLines={1}>
                  {(item.tracks?.total ?? 0)} tracks • {item.owner?.display_name ?? 'Unknown'}
                </ThemedText>
              </ThemedView>
            </ThemedView>
          )}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListFooterComponent={loadingMore ? <ThemedView style={styles.footer}><ActivityIndicator /></ThemedView> : null}
        />
      )}
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 12 },
  subtle: { opacity: 0.7 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  col: { flex: 1, minWidth: 0 },
  sep: { height: 1, backgroundColor: '#e5e7eb' },
  cover: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: 'absolute' },
  footer: { paddingVertical: 12, alignItems: 'center' },
});
