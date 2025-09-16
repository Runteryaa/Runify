// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { useSpotify } from '@/store/spotify';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import Feather from '@expo/vector-icons/Feather';

export default function TabLayout() {
  // hydrate tokens on app start
  const { init } = useSpotify();
  useEffect(() => { init(); }, [init]);

  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => <Feather name="search" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <Feather name="grid" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Feather name="settings" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
