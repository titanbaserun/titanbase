import { describe, expect, it } from "vitest";
import { APP_SETTINGS_KEY, defaultAppSettings, loadAppSettings, resetAppSettings, resolveThemePreference, saveAppSettings } from "./app-settings";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("app settings", () => {
  it("loads defaults and persists valid settings", () => {
    const storage = memoryStorage();
    expect(loadAppSettings(storage)).toEqual(defaultAppSettings);
    expect(defaultAppSettings.theme).toBe("light");
    const settings = { ...defaultAppSettings, theme: "dark" as const, showGrid: false, inspectorPinned: false, inspectorOpen: false, inspectorHover: false };
    saveAppSettings(settings, storage);
    expect(loadAppSettings(storage)).toEqual(settings);
  });

  it("falls back safely for malformed stored settings", () => {
    const storage = memoryStorage();
    storage.setItem(APP_SETTINGS_KEY, "not-json");
    expect(loadAppSettings(storage)).toEqual(defaultAppSettings);
  });

  it("resets settings and resolves system theme", () => {
    const storage = memoryStorage();
    saveAppSettings({ ...defaultAppSettings, theme: "dark" }, storage);
    expect(resetAppSettings(storage)).toEqual(defaultAppSettings);
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
    expect(resolveThemePreference("light", true)).toBe("light");
  });
});
