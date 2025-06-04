import update from "immutability-helper";
import { CallbackId, CallbackRegistry } from "./CallbackRegistry";
import { MultiWordTagConversion } from "./Tags";
import { getUniqueId } from "./Utils";

export interface FolderTagMapping {
  folder: string | null;
  tags: string[];
}

export interface PocketSettings {
  "item-note-template"?: string;
  "item-note-template-with-templater"?: boolean;
  "item-notes-folder"?: string;
  "item-note-ignore-tags"?: string[];
  "item-note-filename-pattern"?: string;

  "multi-word-tag-converter"?: MultiWordTagConversion;
  "pocket-sync-tag"?: string;
  "frontmatter-url-key"?: string;
  "create-item-notes-on-sync"?: boolean;
  "custom-pocket-api-url"?: string;

  "upload-allow-tags"?: string[];
  "upload-folder-tag-mappings"?: FolderTagMapping[];
}

export const DEFAULT_POCKET_SETTINGS: PocketSettings = {
  "multi-word-tag-converter": "snake-case",
  "frontmatter-url-key": "URL",
  "create-item-notes-on-sync": true,
  "custom-pocket-api-url": "https://getpocket.com",

  "item-note-template-with-templater": false,
  'item-note-ignore-tags': [],
  "item-note-filename-pattern": '{{title}}',

  "upload-allow-tags": [],
};

export type OnSettingsChangeCallback = () => Promise<void>;

export type LoadPocketSettingsFn = () => Promise<PocketSettings>;
export type SavePocketSettingsFn = (settings: PocketSettings) => Promise<void>;

export interface SettingsManagerParams {
  loadSettings: LoadPocketSettingsFn;
  saveSettings: SavePocketSettingsFn;
}

export class SettingsManager {
  private settings: PocketSettings;
  private loadSettings: LoadPocketSettingsFn;
  private saveSettings: SavePocketSettingsFn;

  private onSettingsChangeCallbacks: Map<
    keyof PocketSettings,
    CallbackRegistry<CallbackId, OnSettingsChangeCallback>
  >;

  constructor({ loadSettings, saveSettings }: SettingsManagerParams) {
    this.loadSettings = loadSettings;
    this.saveSettings = saveSettings;

    this.onSettingsChangeCallbacks = new Map();
  }

  async load() {
    this.settings = await this.loadSettings();
  }

  async save(newSettings: PocketSettings) {
    this.settings = newSettings;
    await this.saveSettings(this.settings);
  }

  getSetting<K extends keyof PocketSettings>(key: K) {
    return this.settings[key] ?? DEFAULT_POCKET_SETTINGS[key];
  }

  async updateSetting(key: keyof PocketSettings, newValue: any) {
    this.settings = update(this.settings, { [key]: { $set: newValue } });
    await Promise.all([
      this.save(this.settings),
      this.handleOnSettingsChange(key),
    ]);
  }

  subscribeOnSettingsChange(
    key: keyof PocketSettings,
    callback: OnSettingsChangeCallback
  ): CallbackId {
    const callbackId = getUniqueId();
    const callbackRegistry =
      this.onSettingsChangeCallbacks.get(key) ?? new Map();
    callbackRegistry.set(callbackId, callback);
    this.onSettingsChangeCallbacks.set(key, callbackRegistry);
    return callbackId;
  }

  unsubscribeOnSettingsChange(key: keyof PocketSettings, cbId: CallbackId) {
    const callbackRegistry = this.onSettingsChangeCallbacks.get(key);
    callbackRegistry.delete(cbId);
  }

  private async handleOnSettingsChange(key: keyof PocketSettings) {
    const callbackRegistry =
      this.onSettingsChangeCallbacks.get(key) ?? new Map();
    const cbExecs = Array.from(callbackRegistry.values()).map((cb) => cb());
    await Promise.all(cbExecs);
  }
}
