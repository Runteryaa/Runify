// components/player/mini-player.tsx
import React, { memo } from 'react';
import { GestureResponderEvent, Image as RNImage, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

type Props = {
  title: string;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  onOpenQueue?: () => void;

  // seeking via progress bar tap
  onSeek: (ratio: number) => void;
  progressRef?: React.RefObject<View>;
  onProgressPress?: (e: GestureResponderEvent) => void;

  style?: StyleProp<ViewStyle>;
};

function secToMinSec(s?: number) {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

const MiniPlayer = ({
  title,
  isPlaying,
  duration,
  currentTime,
  onPrev,
  onToggle,
  onNext,
  onOpenQueue,
  onSeek,
  progressRef,
  onProgressPress,
  style,
}: Props) => {
  const progress =
    duration && duration > 0 ? Math.max(0, Math.min(1, (currentTime ?? 0) / duration)) : 0;

  return (
    <ThemedView style={[styles.player, style]}>
      <ThemedView style={styles.row}>
        <RNImage
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.cover}
        />
        <ThemedView style={{ flex: 1, minWidth: 0 }}>
          <ThemedText numberOfLines={1} type="defaultSemiBold">
            {title}
          </ThemedText>
          <ThemedText style={styles.subtle}>
            {secToMinSec(duration)} • {secToMinSec(currentTime)}
          </ThemedText>
        </ThemedView>

        <Pressable onPress={onPrev} hitSlop={10} style={[styles.pill, { marginRight: 8 }]}>
          <ThemedText type="defaultSemiBold">{'«'}</ThemedText>
        </Pressable>

        <Pressable onPress={onToggle} hitSlop={10} style={styles.pill} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
          <ThemedText type="defaultSemiBold">
            {isPlaying ? <Feather name="pause-circle" size={24} color="white" /> : <Feather name="play-circle" size={24} color="white" />}
          </ThemedText>
        </Pressable>

        <Pressable onPress={onNext} hitSlop={10} style={[styles.pill, { marginLeft: 8 }]}>
          <ThemedText type="defaultSemiBold">{'»'}</ThemedText>
        </Pressable>

        {onOpenQueue ? (
          <Pressable onPress={onOpenQueue} hitSlop={10} style={[styles.pill, { marginLeft: 8 }]}>
            <Feather name="list" size={20} color="white" />
          </Pressable>
        ) : null}
      </ThemedView>

      <Pressable onPress={onProgressPress} hitSlop={4}>
        <View ref={progressRef} style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
    </ThemedView>
  );
};

export default memo(MiniPlayer);

const styles = StyleSheet.create({
  player: {
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    backgroundColor: '#151718',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cover: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#eee' },
  subtle: { opacity: 0.7 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  progressTrack: { height: 4, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', backgroundColor: '#0a7ea4' },
});
