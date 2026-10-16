import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export const SOUND_FILES = {
  questionStart: "audio/question-start.mp3",
  countdown: "audio/countdown.mp3",
  tenSeconds: "audio/ten-seconds.mp3",
  correct: "audio/correct.mp3",
  incorrect: "audio/incorrect.mp3",
  tileClick: "audio/tile-click.mp3",
  submit: "audio/submit.mp3",
  wheelSpin: "audio/wheel-spin.mp3",
  waitingRoom: "audio/waiting-room.mp3",
  wheelBackground: "audio/wheel-background.mp3",
} as const;
export type SoundId = keyof typeof SOUND_FILES;
type Channel = "waiting" | "countdown" | "wheelMusic" | "wheelSpin";
export type AudioPreferences = {
  enabled: boolean;
  master: number;
  music: boolean;
  effects: boolean;
  placement: "all" | "presentation";
};
const defaults: AudioPreferences = { enabled: false, master: 0.8, music: true, effects: true, placement: "all" };
const preferenceKey = "game-audio-preferences";
// Kept to short, time-sensitive cues only. Background tracks continue to load
// on demand so opening the game does not download every large audio asset.
const PRELOAD_EFFECTS: SoundId[] = [
  "questionStart",
  "tenSeconds",
  "correct",
  "incorrect",
  "tileClick",
  "submit",
  "wheelSpin",
];
function assetUrl(file: string) { return import.meta.env.BASE_URL + file; }
function savedPreferences(): AudioPreferences {
  try { return typeof localStorage === "undefined" ? defaults : { ...defaults, ...JSON.parse(localStorage.getItem(preferenceKey) || "{}") }; } catch { return defaults; }
}
type AudioApi = {
  prefs: AudioPreferences;
  foregroundTick: number;
  activate: () => Promise<boolean>;
  update: (patch: Partial<AudioPreferences>) => void;
  play: (id: SoundId, options?: { volume?: number; onEnded?: () => void }) => void;
  loop: (channel: Channel, id: SoundId, volume?: number) => void;
  stop: (channel: Channel) => void;
  stopEffects: (ids?: SoundId[]) => void;
  stopAll: () => void;
  setContext: (presentation: boolean) => void;
};
const AudioContext = createContext<AudioApi | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(savedPreferences);
  const [foregroundTick, setForegroundTick] = useState(0);
  const loops = useRef(new Map<Channel, HTMLAudioElement>());
  const effects = useRef(new Set<HTMLAudioElement>());
  const effectVoices = useRef(new Map<SoundId, HTMLAudioElement[]>());
  const presentation = useRef(false);
  const allowed = () => prefs.enabled && (prefs.placement === "all" || presentation.current);
  const gain = (kind: "music" | "effects", raw: number) => Math.max(0, Math.min(1, prefs.master * raw * (kind === "music" ? (prefs.music ? 1 : 0) : (prefs.effects ? 1 : 0))));
  const save = (next: AudioPreferences) => { setPrefs(next); if (typeof localStorage !== "undefined") localStorage.setItem(preferenceKey, JSON.stringify(next)); };
  const createEffectVoice = (id: SoundId) => {
    const audio = new Audio(assetUrl(SOUND_FILES[id]));
    audio.preload = "auto";
    audio.dataset.sound = id;
    return audio;
  };
  const prepareEffect = (id: SoundId) => {
    const pool = effectVoices.current.get(id) || [];
    if (!pool.length) {
      const voice = createEffectVoice(id);
      pool.push(voice);
      effectVoices.current.set(id, pool);
    }
    pool.forEach((voice) => voice.load());
    return pool;
  };
  const stop = (channel: Channel) => { const audio = loops.current.get(channel); if (audio) { audio.pause(); audio.currentTime = 0; loops.current.delete(channel); } };
  const stopEffects = (ids?: SoundId[]) => effects.current.forEach((audio) => {
    if (ids && !ids.includes(audio.dataset.sound as SoundId)) return;
    audio.pause(); audio.currentTime = 0; effects.current.delete(audio);
  });
  const stopAll = () => { (["waiting", "countdown", "wheelMusic", "wheelSpin"] as Channel[]).forEach(stop); stopEffects(); };
  const api = useMemo<AudioApi>(() => ({
    prefs,
    foregroundTick,
    async activate() {
      const next = { ...prefs, enabled: true };
      save(next);
      PRELOAD_EFFECTS.forEach(prepareEffect);
      const probe = new Audio(assetUrl(SOUND_FILES.tileClick));
      probe.muted = true;
      try { await probe.play(); probe.pause(); return true; } catch { return false; }
    },
    update(patch) {
      const next = { ...prefs, ...patch };
      save(next);
      if (!next.enabled) stopAll();
      if (!next.music) { stop("waiting"); stop("wheelMusic"); }
      if (!next.effects) { stop("countdown"); stop("wheelSpin"); stopEffects(); }
      loops.current.forEach((audio, channel) => {
        const isMusic = channel === "waiting" || channel === "wheelMusic";
        audio.volume = Math.max(0, Math.min(1, next.master * (isMusic ? (next.music ? 0.25 : 0) : (next.effects ? 0.62 : 0))));
      });
    },
    play(id, options) {
      if (!allowed() || !prefs.effects) return;
      const pool = prepareEffect(id);
      let audio = pool.find((voice) => voice.paused || voice.ended);
      if (!audio) {
        audio = createEffectVoice(id);
        pool.push(audio);
      }
      audio.pause();
      try { audio.currentTime = 0; } catch { /* Media has not started yet. */ }
      audio.volume = gain("effects", options?.volume ?? 0.9);
      effects.current.add(audio);
      audio.onended = () => { effects.current.delete(audio); options?.onEnded?.(); };
      audio.onerror = () => effects.current.delete(audio);
      void audio.play().catch(() => effects.current.delete(audio));
    },
    loop(channel, id, volume = 0.62) {
      const isMusic = channel === "waiting" || channel === "wheelMusic";
      if (!allowed() || (isMusic ? !prefs.music : !prefs.effects)) return;
      const existing = loops.current.get(channel);
      if (existing?.dataset.sound === id) { existing.volume = gain(isMusic ? "music" : "effects", volume); return; }
      stop(channel);
      const audio = new Audio(assetUrl(SOUND_FILES[id]));
      audio.loop = true;
      audio.preload = "metadata";
      audio.dataset.sound = id;
      audio.volume = gain(isMusic ? "music" : "effects", volume);
      loops.current.set(channel, audio);
      void audio.play().catch(() => loops.current.delete(channel));
    },
    stop,
    stopEffects,
    stopAll,
    setContext(value) { presentation.current = value; },
  }), [prefs, foregroundTick]);
  useEffect(() => {
    if (prefs.enabled) PRELOAD_EFFECTS.forEach(prepareEffect);
  }, [prefs.enabled]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stopAll(); else setForegroundTick((value) => value + 1); };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); stopAll(); };
  }, []);
  return <AudioContext.Provider value={api}>{children}</AudioContext.Provider>;
}
export function useAudio() {
  const value = useContext(AudioContext);
  if (!value) throw new Error("AudioProvider is required");
  return value;
}
