/**
 * Installing the app on a device.
 *
 * ServisGo ships as one installable web app rather than four native builds:
 * Android, Windows and macOS install it from Chrome/Edge through the
 * `beforeinstallprompt` event, and iOS installs it from Safari's share sheet.
 * This module owns the service-worker registration, keeps hold of the deferred
 * install prompt (the event fires once, early, long before the user reaches the
 * download screen) and tells a screen which instructions to show.
 */

/** The Chromium-only event that lets us install without leaving the page. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type DevicePlatform = 'android' | 'ios' | 'windows' | 'macos' | 'other';
export type DeviceBrowser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'samsung' | 'opera' | 'other';

/** Where the app is installed from, so the right card opens first. */
export function detectPlatform(): DevicePlatform {
  const ua = navigator.userAgent;
  const isTouchMac = navigator.maxTouchPoints > 1 && /Macintosh/.test(ua); // iPadOS lies about being a Mac
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || isTouchMac) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  return 'other';
}

export function detectBrowser(): DeviceBrowser {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\//i.test(ua)) return 'opera';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

/** True once the app runs from the home screen / dock rather than a tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // Safari on iOS predates display-mode and uses this instead
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(listener => listener());
}

/** Subscribe a screen to install-availability changes. Returns the unsubscribe. */
export function onInstallStateChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the one-tap install button can do anything on this browser. */
export function canInstallDirectly(): boolean {
  return deferredPrompt !== null;
}

/** Whether the app has been installed during this visit. */
export function wasInstalled(): boolean {
  return installed;
}

/** Show the browser's own install dialog. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // the event is single-use — Chrome fires a fresh one if the user backs out
  deferredPrompt = null;
  notify();
  return outcome;
}

/**
 * Registers the service worker and starts listening for the install prompt.
 * Called once from main.tsx, before React renders.
 */
export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); // stop Chrome's mini-infobar; we have our own button
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });

  if (!('serviceWorker' in navigator)) return;
  // In dev the worker would serve stale modules over Vite's HMR.
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installing offline support is a bonus — never block the app on it */
    });
  });
}
