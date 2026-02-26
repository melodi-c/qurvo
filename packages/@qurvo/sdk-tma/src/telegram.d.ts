/**
 * Minimal Telegram WebApp type declarations for sdk-tma.
 * Only the surface we actually use — avoids forcing consumers to install
 * @types/telegram-web-app or a full Telegram WebApp dependency.
 */

export interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  is_premium?: boolean;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramWebAppInitDataUnsafe {
  user?: TelegramUser;
  start_param?: string;
  auth_date?: number;
  hash?: string;
}

export type TelegramPlatform =
  | 'ios'
  | 'android'
  | 'android_x'
  | 'tdesktop'
  | 'weba'
  | 'webk'
  | 'web'
  | 'unknown';

export interface TelegramMainButton {
  isVisible: boolean;
  onClick(callback: () => void): TelegramMainButton;
  offClick(callback: () => void): TelegramMainButton;
}

export interface TelegramBackButton {
  isVisible: boolean;
  onClick(callback: () => void): TelegramBackButton;
  offClick(callback: () => void): TelegramBackButton;
}

export interface TelegramInvoiceClosedEvent {
  url: string;
  status: 'paid' | 'cancelled' | 'failed' | 'pending';
}

export type TelegramWebAppEventType =
  | 'viewportChanged'
  | 'mainButtonClicked'
  | 'backButtonClicked'
  | 'invoiceClosed'
  | string;

export interface TelegramCloudStorage {
  setItem(
    key: string,
    value: string,
    callback?: (error: string | null, stored?: boolean) => void,
  ): void;
  getItem(key: string, callback: (error: string | null, value?: string) => void): void;
  removeItem(key: string, callback?: (error: string | null, removed?: boolean) => void): void;
}

export interface TelegramWebApp {
  initDataUnsafe: TelegramWebAppInitDataUnsafe;
  platform: TelegramPlatform;
  version: string;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  MainButton: TelegramMainButton;
  BackButton: TelegramBackButton;
  CloudStorage: TelegramCloudStorage;
  onEvent(eventType: 'viewportChanged', callback: () => void): void;
  onEvent(eventType: 'mainButtonClicked', callback: () => void): void;
  onEvent(eventType: 'backButtonClicked', callback: () => void): void;
  onEvent(eventType: 'invoiceClosed', callback: (event: TelegramInvoiceClosedEvent) => void): void;
  onEvent(eventType: TelegramWebAppEventType, callback: (...args: unknown[]) => void): void;
  offEvent(eventType: TelegramWebAppEventType, callback: (...args: unknown[]) => void): void;
  ready(): void;
  expand(): void;
  close(): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}
