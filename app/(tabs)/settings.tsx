// app/(tabs)/settings.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import Feather from '@expo/vector-icons/Feather';
import { useSpotify } from '@/store/spotify';
import { useFocusEffect } from 'expo-router';

type ThemePref = 'system' | 'light' | 'dark';

const S_KEYS = {
  theme: 'settings:theme',
  minLen: 'settings:minLenSec',
  maxLen: 'settings:maxLenSec',
};

async function getNumber(key: string, fallback: number) {
  const raw = await AsyncStorage.getItem(key);
  const num = raw != null ? Number(raw) : NaN;
  return Number.isFinite(num) ? num : fallback;
}

export default function SettingsScreen() {
  // ---- Spotify logout (best-effort) ----
  const spotify = useSpotify();

  // ---- Form state (persisted) ----
  const [theme, setTheme] = useState<ThemePref>('system');
  const [minLenSec, setMinLenSec] = useState<number>(0);
  const [maxLenSec, setMaxLenSec] = useState<number>(60 * 60); // 60 min default

  // load persisted prefs
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      (async () => {
        const savedTheme = (await AsyncStorage.getItem(S_KEYS.theme)) as ThemePref | null;
        const minS = await getNumber(S_KEYS.minLen, 0);
        const maxS = await getNumber(S_KEYS.maxLen, 3600);
        if (!alive) return;
        setTheme(savedTheme ?? 'system');
        setMinLenSec(minS);
        setMaxLenSec(maxS);
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  // save immediately when changed
  useEffect(() => { AsyncStorage.setItem(S_KEYS.theme, theme).catch(() => {}); }, [theme]);
  useEffect(() => { AsyncStorage.setItem(S_KEYS.minLen, String(minLenSec)).catch(() => {}); }, [minLenSec]);
  useEffect(() => { AsyncStorage.setItem(S_KEYS.maxLen, String(maxLenSec)).catch(() => {}); }, [maxLenSec]);

  const onLogout = async () => {
    try {
      // Try a dedicated signOut if your store has it
      await spotify?.signOut?.();
      // Fallbacks (comment/uncomment depending on your store API)
      // await spotify?.clear?.();
      // await spotify?.setTokens?.(null, null);
      Alert.alert('Logged out', 'Your Spotify session has been cleared.');
    } catch (e: any) {
      Alert.alert('Logout failed', e?.message ?? 'Please try again.');
    }
  };

  const onClearQueue = async () => {
    // If you keep queue in some store, call its clear() here.
    // For now, just inform the user; your Offline screen already supports clearing queue in-UI.
    Alert.alert('Queue', 'Use the Queue panel in Offline to clear items.');
  };

  const onRescanOffline = async () => {
    // The Offline screen triggers a fresh scan on mount.
    // Here we mark a small flag so Offline can force a rescan in useFocusEffect (optional).
    await AsyncStorage.setItem('offline:forceRescan', '1').catch(() => {});
    Alert.alert('Offline', 'Next time you open Offline, your library will rescan.');
  };

  const lenLabel = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  // helpers to parse mm:ss or seconds
  const parseLen = (txt: string, prev: number) => {
    const t = txt.trim();
    if (!t) return 0;
    if (/^\d+:\d{1,2}$/.test(t)) {
      const [m, s] = t.split(':').map((x) => Number(x));
      if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : prev;
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={{ marginBottom: 12 }}>Settings</ThemedText>

      {/* THEME */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 6 }}>Theme</ThemedText>
        <ThemedText style={styles.subtle}>Choose how the app looks.</ThemedText>
        <View style={styles.rowWrap}>
          <Chip label="System" active={theme === 'system'} onPress={() => setTheme('system')} />
          <Chip label="Light"  active={theme === 'light'}  onPress={() => setTheme('light')} />
          <Chip label="Dark"   active={theme === 'dark'}   onPress={() => setTheme('dark')} />
        </View>
        <ThemedText style={[styles.subtle, { marginTop: 8 }]}>
          calismio
        </ThemedText>
      </ThemedView>

      {/* ACCOUNT */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 6 }}>Account</ThemedText>
        <RowButton danger icon="log-out" label="Log out of Spotify" onPress={onLogout} />
      </ThemedView>

      {/* ABOUT */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 6 }}>About</ThemedText>
        <ThemedText>Runify (dev)</ThemedText>
        <ThemedText style={styles.subtle}>Spotube alternative made with React Native by Runterya</ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

function RowButton({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: '#00000011' }}>
      <ThemedView style={styles.rowBtn}>
        <Feather name={icon} size={18} color="white"/>
        <ThemedText style={[styles.rowBtnText, danger && { color: 'tomato' }]}>{label}</ThemedText>
        <View style={{ flex: 1 }} />
        <Feather name="chevron-right" size={18} color="white"/>
      </ThemedView>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: '#00000011' }}>
      <ThemedView style={[styles.chip, active && styles.chipActive]}>
        <ThemedText style={active ? styles.chipActiveText : undefined}>{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <ThemedView style={styles.input}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        style={{ paddingVertical: 8, paddingHorizontal: 10 }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  subtle: { opacity: 0.7 },

  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },

  row: { flexDirection: 'row', alignItems: 'center' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#0a7ea41a', borderColor: '#0a7ea4' },
  chipActiveText: { color: '#0a7ea4', fontWeight: '600' },

  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    marginLeft: 8,
  },

  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowBtnText: { fontSize: 16 },

});
