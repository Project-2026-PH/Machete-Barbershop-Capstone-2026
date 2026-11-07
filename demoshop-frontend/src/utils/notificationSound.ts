import { supabase } from '@/config/supabaseClient';

const LOCAL_SOUND_PATH = '/booking-alert.mp3';
const AUDIO_POOL_SIZE = 4;
const NOTIFICATION_SOUND_COOLDOWN_MS = 3_000;

let unlocked = false;
let nextAudioIndex = 0;
let lastNotificationSoundAt = Number.NEGATIVE_INFINITY;
const audioPool: HTMLAudioElement[] = [];
let unlockListenerCount = 0;
let removeUnlockListeners: (() => void) | null = null;

const getAudio = (): HTMLAudioElement => {
  const audio = audioPool[nextAudioIndex % AUDIO_POOL_SIZE] || new Audio(LOCAL_SOUND_PATH);
  nextAudioIndex = (nextAudioIndex + 1) % AUDIO_POOL_SIZE;
  audio.preload = 'auto';
  audio.volume = 1;
  if (!audio.src || audio.src === window.location.href) {
    audio.src = LOCAL_SOUND_PATH;
  }
  if (!audioPool.includes(audio)) audioPool.push(audio);
  return audio;
};

const unlockAudio = (): void => {
  if (unlocked) return;

  try {
    const audio = getAudio();
    audio.muted = true;
    audio.currentTime = 0;
    const promise = audio.play();
    if (promise) {
      void promise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          unlocked = true;
        })
        .catch(() => {
          audio.muted = false;
        });
    }
  } catch {
    // Browser may still require a later user gesture.
  }
};

/** Register the browser audio unlock only while an authenticated notification bell is mounted. */
export const registerNotificationSoundUnlock = (isAuthenticated: boolean): (() => void) => {
  if (!isAuthenticated || typeof window === 'undefined' || unlocked) return () => {};

  unlockListenerCount += 1;
  if (!removeUnlockListeners) {
    const handleUnlockGesture = () => {
      removeUnlockListeners?.();
      removeUnlockListeners = null;
      unlockListenerCount = 0;
      unlockAudio();
    };
    const cleanup = () => {
      window.removeEventListener('pointerdown', handleUnlockGesture);
      window.removeEventListener('keydown', handleUnlockGesture);
    };
    removeUnlockListeners = cleanup;
    window.addEventListener('pointerdown', handleUnlockGesture, { once: true, passive: true });
    window.addEventListener('keydown', handleUnlockGesture, { once: true });
  }

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    unlockListenerCount = Math.max(0, unlockListenerCount - 1);
    if (unlockListenerCount === 0 && removeUnlockListeners) {
      removeUnlockListeners();
      removeUnlockListeners = null;
    }
  };
};

export const getNotificationSoundUrl = (fileName: string = 'booking-alert.mp3'): string => {
  try {
    const { data } = supabase.storage.from('sounds').getPublicUrl(fileName);
    if (data?.publicUrl) return data.publicUrl;
  } catch (err) {
    console.warn('[NotificationSound] Failed to get sound from Supabase storage:', err);
  }
  return `/${fileName}`;
};

export const playNotificationSound = (isAuthenticated: boolean, fileName: string = 'booking-alert.mp3'): void => {
  if (!isAuthenticated) return;
  const now = Date.now();
  if (now - lastNotificationSoundAt < NOTIFICATION_SOUND_COOLDOWN_MS) return;
  lastNotificationSoundAt = now;

  const audio = getAudio();
  audio.muted = false;
  audio.volume = 1;
  audio.currentTime = 0;

  void audio.play().catch((error: unknown) => {
    console.warn('[NotificationSound] Local audio playback failed:', error);
    const fallback = new Audio(getNotificationSoundUrl(fileName));
    fallback.volume = 1;
    void fallback.play().catch((fallbackError: unknown) => {
      console.warn('[NotificationSound] Remote audio playback failed:', fallbackError);
    });
  });
};
