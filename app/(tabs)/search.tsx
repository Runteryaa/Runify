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
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
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

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

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

  // ---- expo-audio preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const player = useAudioPlayer(previewUrl ?? ''); // source updates when previewUrl changes
  const status = useAudioPlayerStatus(player);

  // Configure audio once (silent mode on iOS, duck others on Android)
  useEffect(() => {
    setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    // string enums per expo-audio docs:
    interruptionModeAndroid: 'duckOthers', // other valid: 'doNotMix'
    interruptionMode: 'mixWithOthers',     // iOS-style global option
  }).catch(() => {});
  }, []);

  // Autoplay when a new previewUrl is set
  useEffect(() => {
    if (!previewUrl) return;
    // seek to start & play (expo-audio does not auto-reset position)
    player.seekTo(0);
    player.play();
    // stop when unmount
    return () => {
      player.pause();
      player.seekTo(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  const stopPreview = useCallback(() => {
    player.pause();
    player.seekTo(0);
    setPreviewId(null);
    setPreviewUrl(null);
  }, [player]);

  const canSearch = debouncedQ.trim().length > 0;
  const selected = mode === 'track' ? tracks : mode === 'album' ? albums : artists;

  const doSearch = useCallback(async () => {
    if (!canSearch) {
      setTracks([]); setAlbums([]); setArtists([]); setNextUrl(null); setError(null);
      stopPreview();
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
  }, [debouncedQ, canSearch, mode, ensureToken, signIn, stopPreview]);

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

  // switching mode resets results + pagination and stops preview
  useEffect(() => {
    setTracks([]); setAlbums([]); setArtists([]); setNextUrl(null); setError(null);
    stopPreview();
    if (canSearch) doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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

  const renderTrack = ({ item }: { item: Track }) => {
  const art = item.album?.images?.[0]?.url;
  const artistsStr = (item.artists ?? []).map(a => a.name).join(', ');
  const ext = item.external_urls?.spotify;

  const isCurrent = previewId === item.id;
  const isPlaying = isCurrent && status.playing;
  const progress = isCurrent && status.duration > 0 ? status.currentTime / status.duration : 0;

  const onToggle = () => {
    if (!item.preview_url) {
      console.log('No preview_url for', item.name);
      // quick visual feedback
      // (replace with your toast/snackbar if you use one)
      alert('No preview available for this track.');
      return;
    }
    if (isCurrent) {
      // same track: toggle play/pause
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
      
    } else {
      // new track: load and play
      setPreviewId(item.id);
      setPreviewUrl(item.preview_url);
    }
  };

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

          {/* Preview control */}
          <Pressable onPress={onToggle} hitSlop={10} style={styles.previewPill}>
            <ThemedText type="defaultSemiBold">
              {isPlaying ? 'Pause' : isCurrent ? 'Play' : 'Preview'}
            </ThemedText>
          </Pressable>
          
        </ThemedView>
      </Pressable>

      {/* Progress bar when this row is playing */}
      {isCurrent ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(progress, 1)) * 100}%` }]} />
        </View>
      ) : null}
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
        {/* title + subtitle */}
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

  if (!canSearch && !loading) {
    return (
      <FlatList
        data={[]}
        ListHeaderComponent={header}
        renderItem={renderItem}
        ListEmptyComponent={
          <ThemedView style={styles.center}>
            <ThemedText style={styles.subtle}>Start typing to search…</ThemedText>
          </ThemedView>
        }
      />
    );
  }

  return (
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
      contentContainerStyle={{ paddingBottom: 16 }}
      ListEmptyComponent={
        loading ? null : (
          <ThemedView style={styles.center}>
            <ThemedText>No results</ThemedText>
          </ThemedView>
        )
      }
    />
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

  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  footer: { paddingVertical: 12, alignItems: 'center' },

  previewBtn: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 4, marginTop: -6 },
  previewPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'center',
    marginLeft: 8,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
    marginHorizontal: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0a7ea4',
  },
});
