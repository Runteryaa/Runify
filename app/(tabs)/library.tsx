import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image as RNImage, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSpotify } from '@/store/spotify';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

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

function mergeUnique<T extends { id: string }>(prev: T[], next: T[]) {
  const map = new Map(prev.map((p) => [p.id, p]));
  for (const item of next) map.set(item.id, item);
  return Array.from(map.values());
}

export default function LibraryScreen() {
  const { request, signIn, ensureToken } = useSpotify();

  const [items, setItems] = useState<Playlist[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const header = useMemo(
    () => (
      <SafeAreaView>
      <ThemedView style={styles.header}>

        <ThemedText type="title">Library</ThemedText>
        <ThemedText style={styles.subtle}>Your Spotify playlists</ThemedText>
      </ThemedView>
      </SafeAreaView>
    ),
    []
  );

  const loadInitial = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true); setError(null);
    try {
      let token = await ensureToken();
      if (!token) { await signIn(); token = await ensureToken(); }
      if (!token) throw new Error('No token');
      const page = await fetchPage('https://api.spotify.com/v1/me/playlists?limit=30', token);
      setItems(page.items);
      setNextUrl(page.next);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load playlists');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [ensureToken, signIn]);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    try {
      const token = await ensureToken();
      if (!token) throw new Error('No token');
      const page = await fetchPage('https://api.spotify.com/v1/me/playlists?limit=30', token);
      setItems(page.items);
      setNextUrl(page.next);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to refresh');
    } finally {
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, [ensureToken]);

  const loadMore = useCallback(async () => {
    if (!nextUrl || loadingMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const token = await ensureToken();
      if (!token) return;
      const page = await fetchPage(nextUrl, token);
      setItems(prev => mergeUnique(prev, page.items));
      setNextUrl(page.next);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load more');
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [nextUrl, loadingMore, ensureToken]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  if (!request || (loading && items.length === 0)) {
    return (
      <ThemedView style={[styles.center, { flex: 1 }]}>
        <ActivityIndicator />
        <ThemedText style={styles.subtle}>
          {!request ? 'Preparing sign-in…' : 'Loading playlists…'}
        </ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={[styles.center, { flex: 1 }]}>
        <ThemedText style={{ color: 'tomato' }}>{error}</ThemedText>
        <Pressable onPress={loadInitial} style={{ padding: 8 }}>
          <ThemedText type="link">Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(p) => String(p.id)}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      onRefresh={refresh}
      refreshing={refreshing}
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      contentContainerStyle={{ paddingBottom: 16 }}
      ListFooterComponent={
        loadingMore ? <ThemedView style={styles.footer}><ActivityIndicator /></ThemedView> : null
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id } })}
          android_ripple={{ color: '#00000011' }}
          style={{ borderRadius: 10 }}
        >
          <ThemedView style={styles.row}>
            <RNImage
              source={
                item.images?.[0]?.url
                  ? { uri: item.images[0].url }
                  : require('@/assets/images/partial-react-logo.png')
              }
              style={styles.cover}
            />
            <ThemedView style={styles.col}>
              <ThemedText type="defaultSemiBold" numberOfLines={1}>
                {item.name}
              </ThemedText>
              <ThemedText style={styles.subtle} numberOfLines={1}>
                {(item.tracks?.total ?? 0)} tracks • {item.owner?.display_name ?? 'Unknown'}
              </ThemedText>
            </ThemedView>
          </ThemedView>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingHorizontal: 16, paddingTop: 8, marginBottom: 8 },
  subtle: { opacity: 0.7 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16 },
  col: { flex: 1, minWidth: 0 },
  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },
  cover: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  reactLogo: { height: 40, width: 65, alignSelf: 'flex-start' },
  footer: { paddingVertical: 12, alignItems: 'center' },
});
