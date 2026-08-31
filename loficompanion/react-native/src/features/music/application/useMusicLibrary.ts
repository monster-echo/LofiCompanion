import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageDriver } from '../../focus/data/storageDriver';
import { createMusicSelectionRepository } from '../data/musicSelectionRepository';
import { BUNDLED_TRACKS } from '../data/bundledTracks';
import { fetchRemoteTracks } from '../data/musicManifestClient';
import { getMusicController } from '../data/expoAudioMusicController';
import { availableTracks, resolveSelectedTrack } from '../domain/musicLibrary';
import type { MusicTrack } from '../domain/musicTypes';

/**
 * 曲库 React 接线：内置两首 + （登录态）线上清单合并，选择持久化并同步到
 * 音乐控制器单例。SetupSheet（选曲）与 FocusActiveScreen（正在播字幕）共用，
 * 同步效果幂等（同曲 selectTrack 在控制器内是 no-op）。
 */

/** AsyncStorage 静态方法适配仓储接口（对齐 FocusStore 的 storageDriver） */
const musicStorage: StorageDriver = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

const selectionRepo = createMusicSelectionRepository(musicStorage);

export function useMusicLibrary(signedIn: boolean): Readonly<{
  tracks: readonly MusicTrack[];
  selectedTrack: MusicTrack | null;
  selectTrack: (track: MusicTrack) => void;
}> {
  const [remote, setRemote] = useState<readonly MusicTrack[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    selectionRepo
      .loadSelected()
      .then((selection) => {
        if (alive) setSelectedId(selection?.trackId ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setRemote([]);
      return undefined;
    }
    let alive = true;
    void fetchRemoteTracks(Date.now()).then((tracks) => {
      if (alive) setRemote(tracks);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const tracks = useMemo(
    () => availableTracks(BUNDLED_TRACKS, remote, signedIn),
    [remote, signedIn],
  );
  const selectedTrack = useMemo(
    () => resolveSelectedTrack(selectedId, tracks),
    [selectedId, tracks],
  );

  // 选择（含缺省回落）同步到控制器：会话开始前曲目就已就位
  useEffect(() => {
    if (selectedTrack) getMusicController().selectTrack(selectedTrack);
  }, [selectedTrack]);

  const selectTrack = useCallback((track: MusicTrack) => {
    setSelectedId(track.id);
    void selectionRepo.select(track.id, Date.now()).catch(() => undefined);
    getMusicController().selectTrack(track);
  }, []);

  return { tracks, selectedTrack, selectTrack };
}
