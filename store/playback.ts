// store/playback.ts
import { create } from 'zustand';

export type AudioItem = {
  id: string;
  uri: string;
  title: string;
  duration?: number; // seconds (optional, will be filled by host)
};

export type PlayMode = 'order' | 'shuffle';

type PlaybackState = {
  // data
  catalog: AudioItem[];      // current list (e.g., Offline scan or a playlist)
  current: AudioItem | null;
  queue: AudioItem[];
  mode: PlayMode;

  // live status (read-only for UI; updated by PlayerHost)
  playing: boolean;
  currentTime: number;
  duration: number;

  // intents (set by screens, consumed by PlayerHost)
  _seekTo?: number | null;   // seconds
  _nextSeq: number;
  _prevSeq: number;

  // actions (UI will call these)
  setCatalog: (items: AudioItem[]) => void;
  play: (item?: AudioItem) => void;
  pause: () => void;
  toggle: () => void;
  seekTo: (seconds: number) => void;
  next: () => void;
  prev: () => void;

  enqueue: (item: AudioItem) => void;
  enqueueNext: (item: AudioItem) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  setMode: (m: PlayMode) => void;

  // internal updates from PlayerHost
  _updateStatus: (patch: Partial<Pick<PlaybackState, 'playing' | 'currentTime' | 'duration'>>) => void;
  _advanceAuto: () => void; // called by PlayerHost on track end
};

function pickNextIndex(state: PlaybackState) {
  const { catalog, current, mode } = state;
  if (catalog.length === 0) return -1;
  if (!current) return 0;

  const idx = catalog.findIndex((x) => x.id === current.id);
  if (idx < 0) return 0;

  if (mode === 'shuffle') {
    if (catalog.length === 1) return 0;
    let next = Math.floor(Math.random() * catalog.length);
    if (next === idx) next = (next + 1) % catalog.length;
    return next;
  }
  return (idx + 1) % catalog.length;
}

function pickPrevIndex(state: PlaybackState) {
  const { catalog, current, mode } = state;
  if (catalog.length === 0) return -1;
  if (!current) return 0;

  const idx = catalog.findIndex((x) => x.id === current.id);
  if (idx < 0) return 0;

  if (mode === 'shuffle') {
    if (catalog.length === 1) return 0;
    let prev = Math.floor(Math.random() * catalog.length);
    if (prev === idx) prev = (prev + catalog.length - 1) % catalog.length;
    return prev;
  }
  return (idx - 1 + catalog.length) % catalog.length;
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  catalog: [],
  current: null,
  queue: [],
  mode: 'order',

  playing: false,
  currentTime: 0,
  duration: 0,

  _seekTo: null,
  _nextSeq: 0,
  _prevSeq: 0,

  setCatalog: (items) => set({ catalog: items }),

  play: (item) =>
    set((s) => ({
      current: item ?? s.current ?? s.catalog[0] ?? null,
      playing: true,
      // clear any pending seek since source may change
      _seekTo: null,
    })),

  pause: () => set({ playing: false }),
  toggle: () => set((s) => ({ playing: !s.playing })),

  seekTo: (seconds) => set({ _seekTo: Math.max(0, seconds) }),

  next: () => set((s) => ({ _nextSeq: s._nextSeq + 1 })), // PlayerHost will react
  prev: () => set((s) => ({ _prevSeq: s._prevSeq + 1 })),

  enqueue: (item) => set((s) => ({ queue: [...s.queue, item] })),
  enqueueNext: (item) => set((s) => ({ queue: [item, ...s.queue] })),
  removeFromQueue: (id) => set((s) => ({ queue: s.queue.filter((x) => x.id !== id) })),
  clearQueue: () => set({ queue: [] }),

  setMode: (m) => set({ mode: m }),

  _updateStatus: (patch) => set(patch),

  _advanceAuto: () => {
    const s = get();
    // 1) queue first
    if (s.queue.length > 0) {
      const [next, ...rest] = s.queue;
      set({ current: next, queue: rest, playing: true, currentTime: 0 });
      return;
    }
    // 2) catalog order/shuffle
    const ni = pickNextIndex(get());
    if (ni >= 0) {
      const next = get().catalog[ni];
      set({ current: next, playing: true, currentTime: 0 });
    }
  },
}));
