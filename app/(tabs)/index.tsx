// app/(tabs)/index.tsx
import React, { useRef } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import Player from '@/components/player/player';

export default function HomeScreen() {

  return (
    <>
      <SafeAreaView>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Home!</ThemedText>

        </ThemedView>
      </SafeAreaView>


      
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
