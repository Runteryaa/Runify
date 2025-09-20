// app/(tabs)/offline.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  GestureResponderEvent,
  Image as RNImage,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import Feather from '@expo/vector-icons/Feather';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MiniPlayer from '@/components/player/mini-player';
import { usePlayback, type AudioItem as PBItem, type PlayMode } from '@/store/playback';

type SortKey = 'title' | 'duration';
type SortDir = 'asc' | 'desc';

function secToMinSec(s?: number) {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function OfflineScreen() {
  // ==== Global playback (read/write) ====
  const {
    catalog,
    current,
    queue,
    playing,
    currentTime,
    duration,
    mode,
    setCatalog,
    play,
    toggle,
    next,
    prev,
    seekTo,
    enqueue,
    enqueueNext,
    removeFromQueue,
    clearQueue,
    setMode,
  } = usePlayback();

  // ==== Local UI state ====
  const [permissionStatus, requestPermission] = MediaLibrary.usePermissions();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rawAudio, setRawAudio] = useState<PBItem[]>([]); // device scan
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [menuFor, setMenuFor] = useState<PBItem | null>(null);
  const [showQueue, setShowQueue] = useState(false);

  // ==== Scan device audio ====
  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!permissionStatus?.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          setError('Permission to access media library is required.');
          setLoading(false);
          return;
        }
      }

      const page = await MediaLibrary.getAssetsAsync({
        mediaType: 'audio',
        first: 2000,
        sortBy: [MediaLibrary.SortBy.modificationTime],
      });

      const mapped: PBItem[] = (page.assets ?? []).map((a) => ({
        id: a.id,
        uri: a.uri,
        title: (a.filename ?? a.id).replace(/\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i, ''),
        duration: typeof a.duration === 'number' ? a.duration : undefined,
      }));

      setRawAudio(mapped);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load audio files');
    } finally {
      setLoading(false);
    }
  }, [permissionStatus, requestPermission]);

  useEffect(() => {
    scan();
  }, [scan]);

  // ==== Sorting / view order ====
  const sorted = useMemo(() => {
    const copy = [...rawAudio];
    copy.sort((a, b) => {
      if (sortKey === 'title') {
        const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      } else {
        const da = a.duration ?? 0;
        const db = b.duration ?? 0;
        const cmp = da - db;
        return sortDir === 'asc' ? cmp : -cmp;
      }
    });
    return copy;
  }, [rawAudio, sortKey, sortDir]);

  // Keep global catalog in sync with the current sorted order
  useEffect(() => {
    setCatalog(sorted);
  }, [sorted, setCatalog]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await scan();
    setRefreshing(false);
  }, [scan]);

  // ==== UI helpers ====
  const barRef = useRef<View>(null);
  const onSeekBarPress = (e: GestureResponderEvent) => {
    if (!duration) return;
    barRef.current?.measure?.((x, y, w, h, pageX) => {
      const tapX = e.nativeEvent.pageX - pageX;
      const ratio = Math.max(0, Math.min(1, tapX / w));
      seekTo(duration * ratio);
    });
  };

  const header = (
    <ThemedView style={styles.header}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <ThemedText type="title">Offline</ThemedText>
        <ThemedText style={styles.subtle}>Music stored on this device</ThemedText>

        {/* Sorting */}
        <ThemedView style={styles.rowWrap}>
          <ThemedText type="defaultSemiBold" style={{ marginRight: 8 }}>
            Sort by:
          </ThemedText>

          <Pressable
            onPress={() => setSortKey('title')}
            style={[styles.chip, sortKey === 'title' && styles.chipActive]}
            android_ripple={{ color: '#00000011' }}
          >
            <ThemedText style={sortKey === 'title' ? styles.chipActiveText : undefined}>
              A–Z
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setSortKey('duration')}
            style={[styles.chip, sortKey === 'duration' && styles.chipActive]}
            android_ripple={{ color: '#00000011' }}
          >
            <ThemedText style={sortKey === 'duration' ? styles.chipActiveText : undefined}>
              Length
            </ThemedText>
          </Pressable>

          <View style={{ width: 8 }} />

          <Pressable
            onPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            style={styles.pill}
            android_ripple={{ color: '#00000011' }}
          >
            <ThemedText type="defaultSemiBold">
              {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </ThemedText>
          </Pressable>

          <View style={{ flex: 1 }} />

          {/* Queue open */}
          <Pressable
            onPress={() => setShowQueue(true)}
            style={[styles.pill, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            android_ripple={{ color: '#00000011' }}
          >
            <Feather name="list" size={18} color="white" />
            <ThemedText type="defaultSemiBold">Queue ({queue.length})</ThemedText>
          </Pressable>
        </ThemedView>

        {/* Mode */}
        <ThemedView style={[styles.rowWrap, { marginTop: 6 }]}>
          <ThemedText type="defaultSemiBold" style={{ marginRight: 8 }}>
            Mode:
          </ThemedText>

          <Pressable
            onPress={() => setMode('order')}
            style={[styles.chip, mode === 'order' && styles.chipActive]}
            android_ripple={{ color: '#00000011' }}
          >
            <Feather name="layers" size={20} color="white" />
          </Pressable>

          <Pressable
            onPress={() => setMode('shuffle')}
            style={[styles.chip, mode === 'shuffle' && styles.chipActive]}
            android_ripple={{ color: '#00000011' }}
          >
            <Feather name="shuffle" size={20} color="white" />
          </Pressable>
        </ThemedView>

        {loading && (
          <ThemedView style={styles.center}>
            <ActivityIndicator />
            <ThemedText style={styles.subtle}>Scanning your library…</ThemedText>
          </ThemedView>
        )}

        {error && (
          <ThemedView style={styles.center}>
            <ThemedText style={{ color: 'tomato' }}>{error}</ThemedText>
            <Pressable onPress={scan} style={{ padding: 6 }}>
              <ThemedText type="link">Try again</ThemedText>
            </Pressable>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );

  // Row
  const renderItem = ({ item }: { item: PBItem }) => {
    const isCurrent = current?.id === item.id;

    return (
      <ThemedView style={{ paddingHorizontal: 8 }}>
        <Pressable
          onPress={() => play(item)}
          android_ripple={{ color: '#00000011' }}
          style={{ borderRadius: 10 }}
        >
          <ThemedView style={styles.songRow}>
            {isCurrent ? (
              <Feather name="play-circle" size={18} color="white" style={{ marginRight: 4 }} />
            ) : null}

            <RNImage
              source={require('@/assets/images/partial-react-logo.png')}
              style={styles.thumb}
            />

            <ThemedView style={{ flex: 1, minWidth: 0 }}>
              <ThemedText numberOfLines={1} type="defaultSemiBold">
                {item.title}
              </ThemedText>
              <ThemedText style={styles.subtle}>
                {secToMinSec(item.duration)}
              </ThemedText>
            </ThemedView>

            {/* 3-dot menu */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More options"
              onPress={() => setMenuFor(item)}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Feather name="more-vertical" size={18} color="white" />
            </Pressable>
          </ThemedView>
        </Pressable>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        data={catalog}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: current ? 196 : 16 }}
        ListEmptyComponent={
          !loading && !error ? (
            <ThemedView style={styles.center}>
              <ThemedText>No audio files found.</ThemedText>
              <ThemedText style={styles.subtle}>
                Supported: mp3, m4a, aac, flac, wav, ogg, opus
              </ThemedText>
            </ThemedView>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      {/* Global MiniPlayer */}
      {current ? (
        <MiniPlayer
          title={current.title}
          isPlaying={playing}
          duration={duration}
          currentTime={currentTime}
          onPrev={prev}
          onToggle={toggle}
          onNext={next}
          onOpenQueue={() => setShowQueue(true)}
          onSeek={(ratio) => duration && seekTo(duration * ratio)}
          progressRef={barRef}
          onProgressPress={onSeekBarPress}
          style={styles.mini}
        />
      ) : null}

      {/* Queue panel */}
      {showQueue ? (
        <ThemedView style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowQueue(false)} />
          <ThemedView style={styles.sheet}>
            <ThemedView style={styles.sheetHeader}>
              <ThemedText type="subtitle">Up Next</ThemedText>
              <ThemedView style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setShowQueue(false)} style={styles.pill}>
                  <ThemedText>Close</ThemedText>
                </Pressable>
                <Pressable onPress={clearQueue} style={styles.pill}>
                  <ThemedText>Clear</ThemedText>
                </Pressable>
              </ThemedView>
            </ThemedView>

            <FlatList
              data={queue}
              keyExtractor={(it, idx) => `${it.id}-${idx}`}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item, index }) => (
                <ThemedView style={[styles.songRow, { paddingHorizontal: 16 }]}>
                  <ThemedText style={{ width: 24, textAlign: 'center', opacity: 0.6 }}>
                    {index + 1}
                  </ThemedText>
                  <ThemedView style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText numberOfLines={1}>{item.title}</ThemedText>
                    <ThemedText style={styles.subtle}>{secToMinSec(item.duration)}</ThemedText>
                  </ThemedView>
                  <Pressable
                    onPress={() => {
                      play(item);
                      removeFromQueue(item.id);
                      setShowQueue(false);
                    }}
                    style={styles.iconBtn}
                  >
                    <Feather name="play" size={18} color="white" />
                  </Pressable>
                  <Pressable onPress={() => removeFromQueue(item.id)} style={styles.iconBtn}>
                    <Feather name="x" size={18} color="white" />
                  </Pressable>
                </ThemedView>
              )}
              ListEmptyComponent={
                <ThemedView style={styles.center}>
                  <ThemedText>Queue is empty</ThemedText>
                </ThemedView>
              }
              contentContainerStyle={{ paddingBottom: 12 }}
            />
          </ThemedView>
        </ThemedView>
      ) : null}

      {/* Per-item menu */}
      {menuFor ? (
        <ThemedView style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setMenuFor(null)} />
          <ThemedView style={styles.sheet}>
            <ThemedView style={{ paddingHorizontal: 4, paddingBottom: 8, gap: 2 }}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {menuFor.title}
              </ThemedText>
              <ThemedText style={styles.subtle}>{secToMinSec(menuFor.duration)}</ThemedText>
            </ThemedView>

            <Pressable
              onPress={() => {
                play(menuFor);
                setMenuFor(null);
              }}
              style={styles.menuItem}
              android_ripple={{ color: '#00000011' }}
            >
              <Feather name="play" size={18} color="white" />
              <ThemedText style={styles.menuText}>Play now</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                enqueueNext(menuFor);
                setMenuFor(null);
              }}
              style={styles.menuItem}
              android_ripple={{ color: '#00000011' }}
            >
              <Feather name="corner-left-up" size={18} color="white" />
              <ThemedText style={styles.menuText}>Play next</ThemedText>
            </Pressable>

            {!queue.some((q) => q.id === menuFor.id) ? (
              <Pressable
                onPress={() => {
                  enqueue(menuFor);
                  setMenuFor(null);
                }}
                style={styles.menuItem}
                android_ripple={{ color: '#00000011' }}
              >
                <Feather name="plus" size={18} color="white" />
                <ThemedText style={styles.menuText}>Add to queue</ThemedText>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  removeFromQueue(menuFor.id);
                  setMenuFor(null);
                }}
                style={styles.menuItem}
                android_ripple={{ color: '#00000011' }}
              >
                <Feather name="minus" size={18} color="white" />
                <ThemedText style={styles.menuText}>Remove from queue</ThemedText>
              </Pressable>
            )}

            <View style={{ height: 8 }} />
            <Pressable onPress={() => setMenuFor(null)} style={[styles.pill, { alignSelf: 'center' }]}>
              <ThemedText>Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingHorizontal: 16, paddingTop: 8, marginBottom: 8 },
  subtle: { opacity: 0.7 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 12 },

  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#151718', borderColor: '#0a7ea4' },
  chipActiveText: { color: '#0a7ea4' },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },

  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 10 },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#eee' },
  iconBtn: { padding: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },

  mini: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
  },

  // Sheets
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: '#151718',
  },
  sheetHeader: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  menuText: { fontSize: 16 },
});
