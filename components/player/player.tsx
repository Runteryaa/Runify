// components/player/player.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Image as RNImage, Linking, Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Try to import spotify-preview-finder safely (handles default/named exports)
let previewFinder: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('spotify-preview-finder');
  previewFinder = mod?.default ?? mod;
} catch {
  // keep null – component will just skip finder if not present
}

type TrackLike = {
  id: string;
  name: string;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  artists?: { name: string }[];
  album?: { name?: string; images?: { url: string }[] };
  imageUrl?: string; // optional convenience cover
};

type PlayerProps = {
  track: TrackLike | null;
  onClose?: () => void;
};

function getArtUrl(t?: TrackLike | null) {
  return t?.imageUrl ?? t?.album?.images?.[0]?.url ?? null;
}

async function openInSpotify(ext?: string) {
  if (!ext) return;
  const appUrl = ext.startsWith('https://open.')
    ? ext.replace('https://open.', 'spotify:')
    : ext;
  const can = await Linking.canOpenURL(appUrl);
  if (can) {
    try { await Linking.openURL(appUrl); return; } catch {}
  }
  await WebBrowser.openBrowserAsync(ext);
}

async function resolvePreviewUrl(track: TrackLike | null): Promise<string | null> {
  if (!track) return null;
  if (track.preview_url) return track.preview_url;

  if (!previewFinder) return null;

  // common APIs across lib versions
  const candidates = [
    previewFinder.getPreviewUrl,
    previewFinder.getTrackPreview,
    previewFinder.findPreview,
  ].filter(Boolean);

  for (const fn of candidates) {
    try {
      const res = await Promise.resolve(fn(track.id));
      if (typeof res === 'string' && res.startsWith('http')) return res;
      if (res?.url?.startsWith?.('http')) return res.url;
      if (res?.previewUrl?.startsWith?.('http')) return res.previewUrl;
    } catch {
      // try next
    }
  }
  return null;
}

export default function Player({ track, onClose }: PlayerProps) {
  // Configure global audio mode once
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionModeAndroid: 'duckOthers', // or 'doNotMix'
      interruptionMode: 'mixWithOthers',     // iOS-style option
    }).catch(() => {});
  }, []);

  // Preview src
  const [src, setSrc] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolvedOnce, setResolvedOnce] = useState(false);

  // Resolve when track changes
  useEffect(() => {
    let alive = true;
    (async () => {
      setResolvedOnce(false);
      setSrc(null);
      if (!track) return;

      setResolving(true);
      const url = await resolvePreviewUrl(track);
      if (!alive) return;
      setResolving(false);
      setResolvedOnce(true);
      setSrc(url);
    })();
    return () => { alive = false; };
  }, [track]);

  // Audio player from expo-audio
  const player = useAudioPlayer(src ?? '');
  const status = useAudioPlayerStatus(player);
  const isReady = !!src;
  const isPlaying = !!status.playing;

  // Auto-play when we got a new src
  useEffect(() => {
    if (!src) return;
    player.seekTo(0);
    player.play();
    // pause on unmount
    return () => {
      player.pause();
      player.seekTo(0);
    };
  }, [src, player]);

  const progress = useMemo(() => {
    if (!status.duration || status.duration <= 0) return 0;
    const p = status.currentTime / status.duration;
    return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
  }, [status.currentTime, status.duration]);

  const title = track?.name ?? 'No track';
  const subtitle = useMemo(() => {
    const a = (track?.artists ?? []).map(x => x.name).join(', ');
    const alb = track?.album?.name ?? '';
    return [a, alb].filter(Boolean).join(' • ');
  }, [track]);

  const art = getArtUrl(track);
  const ext = track?.external_urls?.spotify;

  const toggle = () => {
    if (!isReady) return;
    if (isPlaying) player.pause();
    else player.play();
  };

  const restart = () => {
    if (!isReady) return;
    player.seekTo(0);
    player.play();
  };

  // Seek by tapping on progress track
  const progressRef = useRef<View>(null);
  const onSeek = useCallback((e: GestureResponderEvent) => {
    if (!isReady || !status.duration) return;
    // get tap x relative to the bar
    progressRef.current?.measure?.((x, y, width, height, pageX) => {
      const tapX = e.nativeEvent.pageX - pageX;
      const ratio = Math.max(0, Math.min(1, tapX / width));
      player.seekTo(status.duration * ratio);
    });
  }, [isReady, status.duration, player]);

  if (!track) {
    return (
      <ThemedView style={styles.wrap}>
        <ThemedText>No track selected</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.wrap}>
      {/* Header row */}
      <ThemedView style={styles.row}>
        <RNImage
          source={art ? { uri: art } : require('@/assets/images/partial-react-logo.png')}
          style={styles.cover}
        />
        <ThemedView style={{ flex: 1, minWidth: 0 }}>
          <ThemedText numberOfLines={1} type="defaultSemiBold">
            {title}
          </ThemedText>
          {!!subtitle && (
            <ThemedText numberOfLines={1} style={styles.subtle}>
              {subtitle}
            </ThemedText>
          )}
        </ThemedView>

        <Pressable
          onPress={() => { player.pause(); player.seekTo(0); onClose?.(); }}
          hitSlop={10}
          style={styles.pill}
        >
          <ThemedText type="defaultSemiBold">Close</ThemedText>
        </Pressable>
      </ThemedView>

      {/* Progress (tap to seek) */}
      <Pressable onPress={onSeek} hitSlop={4}>
        <View ref={progressRef} style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>

      {/* Controls */}
      <ThemedView style={[styles.row, { marginTop: 8 }]}>
        <Pressable
          onPress={toggle}
          disabled={!isReady}
          hitSlop={10}
          style={[styles.bigBtn, !isReady && styles.disabled]}
        >
          <ThemedText type="title">{isPlaying ? '⏸' : '▶️'}</ThemedText>
        </Pressable>

        <Pressable
          onPress={restart}
          disabled={!isReady}
          hitSlop={10}
          style={[styles.btn, !isReady && styles.disabled]}
        >
          <ThemedText type="defaultSemiBold">Restart</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => openInSpotify(ext)}
          hitSlop={10}
          style={styles.btn}
        >
          <ThemedText type="defaultSemiBold">Open in Spotify</ThemedText>
        </Pressable>
      </ThemedView>

      {/* Availability state */}
      {resolving && <ThemedText style={styles.subtle}>Resolving preview…</ThemedText>}
      {resolvedOnce && !src && !resolving && (
        <ThemedText style={[styles.subtle, { marginTop: 6 }]}>
          No preview available for this track.
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  subtle: { opacity: 0.7 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'center',
  },
  bigBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 64,
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  disabled: { opacity: 0.5 },
  progressTrack: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { height: '100%', backgroundColor: '#0a7ea4' },
});
