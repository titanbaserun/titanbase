"use client";

import { useEffect, useState } from "react";
import { SchemaEditor, type EditorAppSettings, type SchemaTemplate } from "@titanbase/editor";
import type { TitanSchema } from "@titanbase/core";
import { defaultAppSettings, loadAppSettings, resetAppSettings, resolveThemePreference, saveAppSettings } from "../../lib/app-settings";

interface EditorClientProps {
  initialSchema: TitanSchema;
  templates: SchemaTemplate[];
}

export function EditorClient({ initialSchema, templates }: EditorClientProps) {
  const [settings, setSettings] = useState<EditorAppSettings>(defaultAppSettings);
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(loadAppSettings(window.localStorage));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemDark(media.matches);
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    setReady(true);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    if (ready) saveAppSettings(settings, window.localStorage);
  }, [ready, settings]);

  const resolvedTheme = resolveThemePreference(settings.theme, systemDark);
  return <SchemaEditor
    initialSchema={initialSchema}
    templates={templates}
    settings={settings}
    resolvedTheme={resolvedTheme}
    onSettingsChange={setSettings}
    onResetSettings={() => setSettings(resetAppSettings(window.localStorage))}
  />;
}
