// app/(tabs)/index.tsx
import React, { useRef } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, TouchableOpacity } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import Player, { PlayerRef } from '@/components/player/player';

export default function HomeScreen() {
  const playerRef = useRef<PlayerRef>(null);

  return (
    <>
      <ParallaxScrollView
        headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
        headerImage={
          <Image
            source={require('@/assets/images/partial-react-logo.png')}
            style={styles.reactLogo}
          />
        }
      >
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Home!</ThemedText>

          <TouchableOpacity
            onPress={() =>
              playerRef.current?.open({
                track: { title: 'Song', artist: 'Artist' },
              })
            }
          >
            <ThemedText type="link">open player</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ParallaxScrollView>

      {/* Mount the overlay ONCE, outside the scroll content */}
      <Player ref={playerRef} />
    </>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
