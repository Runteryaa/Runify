// app/_layout.tsx
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import * as WebBrowser from 'expo-web-browser';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';

WebBrowser.maybeCompleteAuthSession();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} translucent backgroundColor="transparent" />

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="callback" options={{ presentation: 'transparentModal' }} />
          <Stack.Screen name="playlist/[id]" />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
