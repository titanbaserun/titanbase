import { Database, PaintBrush, SlidersHorizontal, X } from "@phosphor-icons/react";
import { Button, Select } from "@titanbase/ui";
import type { EditorAppSettings, ThemePreference } from "./settings";

interface SettingsDialogProps {
  settings: EditorAppSettings;
  onChange: (settings: EditorAppSettings) => void;
  onClearDraft: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, onChange, onClearDraft, onReset, onClose }: SettingsDialogProps) {
  const update = <Key extends keyof EditorAppSettings>(key: Key, value: EditorAppSettings[Key]) => onChange({ ...settings, [key]: value });
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header><div><span>Application preferences</span><h2 id="settings-title">Settings</h2></div><button className="modal-close" aria-label="Close settings" onClick={onClose}><X size={18} /></button></header>

      <section className="settings-section"><div className="settings-section__title"><PaintBrush size={17} /><div><strong>Appearance</strong><small>Choose how Titanbase looks on this device.</small></div></div>
        <label className="settings-field"><span>Theme</span><Select value={settings.theme} onChange={(event) => update("theme", event.target.value as ThemePreference)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select></label>
      </section>

      <section className="settings-section"><div className="settings-section__title"><SlidersHorizontal size={17} /><div><strong>Editor</strong><small>Canvas controls apply immediately.</small></div></div>
        <div className="settings-toggles">
          <label><span><strong>Show minimap</strong><small>Display the canvas overview.</small></span><input type="checkbox" checked={settings.showMinimap} onChange={(event) => update("showMinimap", event.target.checked)} /></label>
          <label><span><strong>Show grid</strong><small>Display the canvas dot grid.</small></span><input type="checkbox" checked={settings.showGrid} onChange={(event) => update("showGrid", event.target.checked)} /></label>
          <label><span><strong>Auto fit on load</strong><small>Center the schema after opening it.</small></span><input type="checkbox" checked={settings.autoFitViewOnLoad} onChange={(event) => update("autoFitViewOnLoad", event.target.checked)} /></label>
          <label><span><strong>Pin inspector sidebar</strong><small>Reserve canvas space for the inspector.</small></span><input type="checkbox" checked={settings.inspectorPinned} onChange={(event) => onChange({ ...settings, inspectorPinned: event.target.checked, inspectorOpen: event.target.checked || settings.inspectorOpen })} /></label>
          <label><span><strong>Open inspector on hover</strong><small>Preview an unpinned inspector from the right edge.</small></span><input type="checkbox" checked={settings.inspectorHover} onChange={(event) => update("inspectorHover", event.target.checked)} /></label>
        </div>
      </section>

      <section className="settings-section"><div className="settings-section__title"><Database size={17} /><div><strong>Data</strong><small>Browser-local preferences and drafts only.</small></div></div>
        <div className="settings-toggles"><label><span><strong>Autosave to this browser</strong><small>Keep the latest schema draft in localStorage.</small></span><input type="checkbox" checked={settings.autosave} onChange={(event) => update("autosave", event.target.checked)} /></label></div>
        <div className="settings-data-actions"><Button onClick={onClearDraft}>Clear local draft</Button><Button variant="ghost" onClick={onReset}>Reset app settings</Button></div>
      </section>
      <footer><Button variant="primary" onClick={onClose}>Done</Button></footer>
    </section>
  </div>;
}
