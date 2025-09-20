// components/player/PlayerHost.tsx
import React, { useEffect, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePlayback } from '@/store/playback';

export default function PlayerHost() {
  const {
    current,
    playing,
    _seekTo,
    _nextSeq,
    _prevSeq,
    _updateStatus,
    _advanceAuto,
    catalog,
  } = usePlayback();

  // One audio player bound to current track uri
  const src = current?.uri ?? '';
  const player = useAudioPlayer(src);
  const status = useAudioPlayerStatus(player);

  // keep last seq to detect changes
  const lastNext = useRef(0);
  const lastPrev = useRef(0);

  // reflect native status into store
  useEffect(() => {
    _updateStatus({
      playing: !!status.playing,
      currentTime: status.currentTime ?? 0,
      duration: status.duration ?? 0,
    });
  }, [status.playing, status.currentTime, status.duration, _updateStatus]);

  // start/stop when "playing" or "current" changes
  useEffect(() => {
    if (!current) return;
    try {
      if (playing) {
        // if source changed, start from 0
        if (status.currentTime == null || status.currentTime < 0.01) {
          player.seekTo(0);
        }
        player.play();
      } else {
        player.pause();
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.uri, playing]);

  // perform seeks triggered by store
  useEffect(() => {
    if (_seekTo == null) return;
    try { player.seekTo(_seekTo); } catch {}
    // clear the intent
    usePlayback.setState({ _seekTo: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_seekTo]);

  // react to next/prev intents
  useEffect(() => {
    if (_nextSeq !== lastNext.current) {
      lastNext.current = _nextSeq;
      // Prefer queue; otherwise catalog order (handled in store)
      _advanceAuto();
    }
  }, [_nextSeq, _advanceAuto]);

  useEffect(() => {
    if (_prevSeq !== lastPrev.current) {
      lastPrev.current = _prevSeq;
      const s = usePlayback.getState();
      // prev logic: if 3s+ played -> restart, else go to previous index
      const ct = s.currentTime ?? 0;
      if (ct > 3 && s.current) {
        try {
          player.seekTo(0);
          player.play();
        } catch {}
      } else {
        // emulate previous selection using catalog
        const idx = s.catalog.findIndex((x) => x.id === s.current?.id);
        const prevIdx =
          idx < 0 ? 0 : (idx - 1 + s.catalog.length) % Math.max(1, s.catalog.length);
        if (s.catalog[prevIdx]) {
          usePlayback.setState({ current: s.catalog[prevIdx], playing: true, currentTime: 0 });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_prevSeq]);

  // auto-advance when ended
  useEffect(() => {
    const dur = status.duration ?? 0;
    const pos = status.currentTime ?? 0;
    const ended = !status.playing && dur > 0 && pos >= Math.max(0, dur - 0.3);
    if (ended && current) {
      _advanceAuto();
    }
  }, [status.playing, status.duration, status.currentTime, current, _advanceAuto]);

  return null; // no UI
}
