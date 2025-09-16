// app/(tabs)/search.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useSpotify } from '@/store/spotify';
import Player from '@/components/player/player';

type Mode = 'track' | 'album' | 'artist';

type ImageT = { url: string };
type Artist = { id: string; name: string; images?: ImageT[]; external_urls?: { spotify?: string } };
type Album = { id: string; name: string; images?: ImageT[]; artists?: { name: string }[]; external_urls?: { spotify?: string } };
type Track = {
  id: string;
  name: string;
  preview_url?: string | null;
  duration_ms?: number;
  artists?: { name: string }[];
  album?: Album;
  external_urls?: { spotify?: string };
};

type SearchResponse = {
  tracks?: { items: Track[]; next: string | null };
  albums?: { items: Album[]; next: string | null };
  artists?: { items: Artist[]; next: string | null };
};

function msToMinSec(ms?: number) {
  if (ms == null) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// debounce
function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// merge unique by id
function mergeUniqueById<T extends { id: string }>(prev: T[], next: T[]) {
  const map = new Map(prev.map(p => [p.id, p]));
  for (const n of next) map.set(n.id, n);
  return Array.from(map.values());
}

async function openSpotify(ext?: string) {
  if (!ext) return;
  const appUrl = ext.startsWith('https://open.') ? ext.replace('https://open.', 'spotify:') : ext;
  const canOpen = await Linking.canOpenURL(appUrl);
  if (canOpen) {
    try { await Linking.openURL(appUrl); return; } catch {}
  }
  await WebBrowser.openBrowserAsync(ext);
}

export default function SearchScreen() {
  const { ensureToken, signIn } = useSpotify();

  const [mode, setMode] = useState<Mode>('track');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // currently playing in the inline player
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  const canSearch = debouncedQ.trim().length > 0;
  const selected = mode === 'track' ? tracks : mode === 'album' ? albums : artists;

  const doSearch = useCallback(async () => {
    if (!canSearch) {
      setTracks([]); setAlbums([]); setArtists([]); setNextUrl(null); setError(null);
      return;
    }
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true); setError(null);
    try {
      let token = await ensureToken();
      if (!token) {
        await signIn();
        token = await ensureToken();
      }
      if (!token) throw new Error('No token');

      const url = `https://api.spotify.com/v1/search?limit=25&type=${mode}&q=${encodeURIComponent(debouncedQ.trim())}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Spotify API error (${res.status})`);
      const json: SearchResponse = await res.json();

      if (mode === 'track') {
        setTracks(json.tracks?.items ?? []);
        setNextUrl(json.tracks?.next ?? null);
        setAlbums([]); setArtists([]);
      } else if (mode === 'album') {
        setAlbums(json.albums?.items ?? []);
        setNextUrl(json.albums?.next ?? null);
        setTracks([]); setArtists([]);
      } else {
        setArtists(json.artists?.items ?? []);
        setNextUrl(json.artists?.next ?? null);
        setTracks([]); setAlbums([]);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Search failed');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [debouncedQ, canSearch, mode, ensureToken, signIn]);

  useEffect(() => { doSearch(); }, [doSearch]);

  const loadMore = useCallback(async () => {
    if (!nextUrl || loadingMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const token = await ensureToken();
      if (!token) return;

      const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Spotify API error (${res.status})`);
      const json: SearchResponse = await res.json();

      if (mode === 'track') {
        setTracks(prev => mergeUniqueById(prev, json.tracks?.items ?? []));
        setNextUrl(json.tracks?.next ?? null);
      } else if (mode === 'album') {
        setAlbums(prev => mergeUniqueById(prev, json.albums?.items ?? []));
        setNextUrl(json.albums?.next ?? null);
      } else {
        setArtists(prev => mergeUniqueById(prev, json.artists?.items ?? []));
        setNextUrl(json.artists?.next ?? null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load more');
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [nextUrl, loadingMore, ensureToken, mode]);

  // switch mode resets results + pagination; also stop current preview
  useEffect(() => {
    setTracks([]); setAlbums([]); setArtists([]); setNextUrl(null); setError(null);
    setCurrentTrack(null);
    if (canSearch) doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ----- Header UI
  const header = useMemo(() => (
    <ThemedView style={styles.header}>
      <ThemedText type="title">Search</ThemedText>
      <ThemedText style={styles.subtle}>
        Find {mode === 'track' ? 'tracks' : mode === 'album' ? 'albums' : 'artists'} on Spotify
      </ThemedText>

      <ThemedView style={styles.searchBox}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search songs, artists, albums…"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => { Keyboard.dismiss(); doSearch(); }}
          style={styles.input}
        />
        {!!q && (
          <Pressable onPress={() => setQ('')} style={styles.clearBtn} hitSlop={10}>
            <ThemedText type="link">Clear</ThemedText>
          </Pressable>
        )}
      </ThemedView>

      <ThemedView style={styles.chipsRow}>
        {(['track','album','artist'] as Mode[]).map(m => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.chip, mode === m && styles.chipActive]}
            android_ripple={{ color: '#00000011', borderless: false }}
          >
            <ThemedText type="defaultSemiBold" style={mode === m ? styles.chipActiveText : undefined}>
              {m === 'track' ? 'Tracks' : m === 'album' ? 'Albums' : 'Artists'}
            </ThemedText>
          </Pressable>
        ))}
      </ThemedView>
    </ThemedView>
  ), [q, mode, doSearch]);

  // ----- Renderers
  const renderTrack = ({ item }: { item: Track }) => {
    const art = item.album?.images?.[0]?.url;
    const artistsStr = (item.artists ?? []).map(a => a.name).join(', ');
    const ext = item.external_urls?.spotify;

    return (
      <ThemedView style={styles.rowWrap}>
        <Pressable
          onPress={() => openSpotify(ext)}
          android_ripple={{ color: '#00000011' }}
          style={{ flex: 1, borderRadius: 10 }}
        >
          <ThemedView style={styles.row}>
            <RNImage
              source={art ? { uri: art } : require('@/assets/images/partial-react-logo.png')}
              style={styles.thumb}
            />
            <ThemedView style={{ flex: 1, minWidth: 0 }}>
              <ThemedText numberOfLines={1} type="defaultSemiBold">{item.name}</ThemedText>
              <ThemedText style={styles.subtle} numberOfLines={1}>{artistsStr} • {item.album?.name ?? ''}</ThemedText>
            </ThemedView>
            <ThemedText style={styles.duration}>{msToMinSec(item.duration_ms)}</ThemedText>
          </ThemedView>
        </Pressable>

        {/* Preview button => opens bottom player with this track
            The Player will try spotify-preview-finder if preview_url is missing */}
        <Pressable
          onPress={() => setCurrentTrack(item)}
          hitSlop={10}
          style={styles.previewPill}
        >
          <ThemedText type="defaultSemiBold">Preview</ThemedText>
        </Pressable>
      </ThemedView>
    );
  };

  const renderAlbum = ({ item }: { item: Album }) => {
    const art = item.images?.[0]?.url;
    const artistsStr = (item.artists ?? []).map(a => a.name).join(', ');
    const ext = item.external_urls?.spotify;

    return (
      <Pressable
        onPress={() => openSpotify(ext)}
        android_ripple={{ color: '#00000011' }}
        style={{ borderRadius: 10 }}
      >
        <ThemedView style={styles.row}>
          <RNImage
            source={art ? { uri: art } : require('@/assets/images/partial-react-logo.png')}
            style={styles.thumb}
          />
          <ThemedView style={{ flex: 1, minWidth: 0 }}>
            <ThemedText numberOfLines={1} type="defaultSemiBold">{item.name}</ThemedText>
            <ThemedText style={styles.subtle} numberOfLines={1}>{artistsStr}</ThemedText>
          </ThemedView>
        </ThemedView>
      </Pressable>
    );
  };

  const renderArtist = ({ item }: { item: Artist }) => {
    const art = item.images?.[0]?.url;
    const ext = item.external_urls?.spotify;

    return (
      <Pressable
        onPress={() => openSpotify(ext)}
        android_ripple={{ color: '#00000011' }}
        style={{ borderRadius: 10 }}
      >
        <ThemedView style={styles.row}>
          <RNImage
            source={art ? { uri: art } : require('@/assets/images/partial-react-logo.png')}
            style={[styles.thumb, { borderRadius: 28 }]}
          />
          <ThemedView style={{ flex: 1, minWidth: 0 }}>
            <ThemedText numberOfLines={1} type="defaultSemiBold">{item.name}</ThemedText>
            <ThemedText style={styles.subtle} numberOfLines={1}>Artist</ThemedText>
          </ThemedView>
        </ThemedView>
      </Pressable>
    );
  };

  const renderItem = (info: any) => {
    if (mode === 'track') return renderTrack(info as { item: Track });
    if (mode === 'album') return renderAlbum(info as { item: Album });
    return renderArtist(info as { item: Artist });
  };

  const keyExtractor = (it: any) => it.id;

  // Empty state before typing
  if (!canSearch && !loading) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <FlatList
          data={[]}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <ThemedView style={styles.center}>
              <ThemedText style={styles.subtle}>Start typing to search…</ThemedText>
            </ThemedView>
          }
          contentContainerStyle={{ paddingBottom: currentTrack ? 140 : 16 }}
        />
        {/* inline bottom player */}
        {currentTrack ? (
          <ThemedView style={styles.playerContainer}>
            <Player track={currentTrack} onClose={() => setCurrentTrack(null)} />
          </ThemedView>
        ) : null}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        data={selected}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={renderItem}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={
          loading || loadingMore ? (
            <ThemedView style={styles.footer}><ActivityIndicator /></ThemedView>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: currentTrack ? 140 : 16 }}
        ListEmptyComponent={
          loading ? null : (
            <ThemedView style={styles.center}>
              <ThemedText>No results</ThemedText>
            </ThemedView>
          )
        }
      />

      {/* inline bottom player above tabs; adds safe padding in list via contentContainerStyle */}
      {currentTrack ? (
        <ThemedView style={styles.playerContainer}>
          <Player track={currentTrack} onClose={() => setCurrentTrack(null)} />
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingHorizontal: 16, paddingTop: 8, marginBottom: 8 },
  subtle: { opacity: 0.7 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: { flex: 1, paddingVertical: 4, fontSize: 16 },
  clearBtn: { paddingVertical: 4, paddingHorizontal: 6 },

  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#0a7ea41a', borderColor: '#0a7ea4' },
  chipActiveText: { color: '#0a7ea4' },

  rowWrap: { paddingHorizontal: 16, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  duration: { width: 46, textAlign: 'right', opacity: 0.7 },

  previewPill: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: -6,
  },

  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  footer: { paddingVertical: 12, alignItems: 'center' },

  // fixed bottom area for the mini-player (above tabs)
  playerContainer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
    paddingBottom: 8, // rely on your tab safe area; add extra if needed
    backgroundColor: 'transparent', // ThemedView provides bg
  },
});
