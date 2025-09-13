// components/player/player.tsx
import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  Image as RNImage,
  Easing,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export type PlayerTrack = {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
};

export type PlayerRef = {
  open: (opts?: { track?: PlayerTrack }) => void;
  close: () => void;
  setTrack: (t?: PlayerTrack) => void;
};

type Props = {
  initialTrack?: PlayerTrack;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
};

const screenH = Dimensions.get('window').height;
const RADIUS = 16;

const Player = forwardRef<PlayerRef, Props>(
  ({ initialTrack, onPlayPause, onNext, onPrev }, ref) => {
    const insets = useSafeAreaInsets();

    const [visible, setVisible] = useState(false);
    const [track, setTrack] = useState<PlayerTrack | undefined>(initialTrack);

    // One animated value: 0 (open) .. screenH (off-screen)
    const translateY = useRef(new Animated.Value(screenH)).current;

    // Close thresholds
    const closeThreshold = useMemo(() => screenH * 0.2, []);
    const fastCloseVy = 1.2;

    // Imperative API
    const open = (opts?: { track?: PlayerTrack }) => {
      if (opts?.track) setTrack(opts.track);
      setVisible(true);
      translateY.setValue(screenH);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    };

    const close = () => {
      Animated.timing(translateY, {
        toValue: screenH,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => setVisible(false));
    };

    useImperativeHandle(ref, () => ({
      open,
      close,
      setTrack: (t?: PlayerTrack) => setTrack(t),
    }));

    // Pan to close (attach to the entire sheet)
    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          const shouldClose = g.dy > closeThreshold || g.vy > fastCloseVy;
          Animated.spring(translateY, {
            toValue: shouldClose ? screenH : 0,
            useNativeDriver: true,
          }).start(() => {
            if (shouldClose) setVisible(false);
          });
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
      })
    ).current;

    // UI text
    const title = track?.title ?? 'Track Title';
    const subtitle =
      [track?.artist, track?.album].filter(Boolean).join(' • ') || 'Artist • Album';
    const progress = 0.35;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
      >
        {/* --- Overlay structure matching your TabMenu --- */}
        <View style={styles.overlay}>
          {/* Backdrop (tap to close) */}
          <TouchableOpacity style={styles.backdrop} onPress={close} activeOpacity={1} />

          {/* Bottom sheet */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.container,
              { transform: [{ translateY }] },
            ]}
          >
            <ThemedView
              style={[
                styles.sheet,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              {/* Handle */}
              <ThemedView style={styles.handleWrap}>
                <ThemedView style={styles.handle} />
              </ThemedView>

              {/* Header (no nav back button; this is an overlay) */}
              <ThemedView style={styles.header}>
                <ThemedText type="subtitle">Now Playing</ThemedText>
              </ThemedView>

              {/* Artwork */}
              <ThemedView style={styles.artWrap}>
                <RNImage
                  source={
                    track?.artworkUrl
                      ? { uri: track.artworkUrl }
                      : require('@/assets/images/partial-react-logo.png')
                  }
                  style={styles.artwork}
                />
              </ThemedView>

              {/* Titles */}
              <ThemedView style={styles.meta}>
                <ThemedText type="title" numberOfLines={1} style={styles.center}>
                  {title}
                </ThemedText>
                <ThemedText numberOfLines={1} style={[styles.center, styles.muted]}>
                  {subtitle}
                </ThemedText>
              </ThemedView>

              {/* Progress */}
              <ThemedView style={styles.progressBar}>
                <ThemedView
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(0, Math.min(1, progress)) * 100}%` },
                  ]}
                />
              </ThemedView>

              {/* Controls */}
              <ThemedView style={styles.controls}>
                <TouchableOpacity onPress={onPrev} style={styles.ctrlBtn}>
                  <ThemedText>⏮️</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={onPlayPause} style={[styles.ctrlBtn, styles.playBtn]}>
                  <ThemedText style={styles.playTxt}>⏯</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={onNext} style={styles.ctrlBtn}>
                  <ThemedText>⏭️</ThemedText>
                </TouchableOpacity>
              </ThemedView>

              <ThemedText style={[styles.center, styles.helper]}>
                Swipe down or tap outside to close
              </ThemedText>
            </ThemedView>
          </Animated.View>
        </View>
      </Modal>
    );
  }
);

export default Player;

const styles = StyleSheet.create({
  // === same proven layout as TabMenu ===
  overlay: {
    flex: 1,
    justifyContent: 'flex-end', // <- critical so sheet sits at bottom and pan is reliable
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    maxHeight: '92%',
    minHeight: 360,
  },
  sheet: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '100%',
  },

  // UI
  handleWrap: { alignItems: 'center', paddingTop: 6, paddingBottom: 8 },
  handle: { width: 44, height: 5, borderRadius: 999, opacity: 0.7, backgroundColor: '#d4d4d8' },
  header: { alignItems: 'center', marginBottom: 8 },
  artWrap: { alignItems: 'center', marginTop: 4, marginBottom: 8 },
  artwork: { width: 280, height: 280, borderRadius: 16, backgroundColor: '#eee' },
  meta: { alignItems: 'center', gap: 4, marginTop: 4 },
  center: { textAlign: 'center' },
  muted: { opacity: 0.7 },
  progressBar: { height: 4, borderRadius: 999, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: 4, borderRadius: 999, backgroundColor: '#22c55e' },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginTop: 12 },
  ctrlBtn: { padding: 10 },
  playBtn: { padding: 18, borderRadius: 999, backgroundColor: '#22c55e' },
  playTxt: { color: 'white', fontWeight: '700' },
  helper: { opacity: 0.6, marginTop: 8 },
});
