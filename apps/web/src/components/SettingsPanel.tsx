import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  LANGUAGE_LABELS,
  type AppLanguage,
  type AppSettings,
} from '@live-translator/shared';
import { AudioCaptureService } from '../services/audio-capture';
import { useUIStore } from '../stores/ui-store';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useUIStore((s) => s.settings);
  const updateSettings = useUIStore((s) => s.updateSettings);
  const [local, setLocal] = useState<AppSettings>(settings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    void AudioCaptureService.listDevices().then(setDevices);
  }, []);

  const handleSave = () => {
    updateSettings(local);
    onClose();
  };

  const handleReset = () => {
    setLocal(DEFAULT_SETTINGS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Starting language (you speak)">
            <select
              value={local.sourceLang}
              onChange={(e) =>
                setLocal({
                  ...local,
                  sourceLang: e.target.value as AppLanguage,
                  targetLang:
                    e.target.value === 'en-AU'
                      ? 'hi'
                      : 'en-AU',
                })
              }
              className="input"
            >
              {(Object.keys(LANGUAGE_LABELS) as AppLanguage[]).map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </Field>

          <p className="text-xs text-muted">
            Translation direction alternates each time you release Space. Starting
            direction: {LANGUAGE_LABELS[local.sourceLang]} →{' '}
            {LANGUAGE_LABELS[local.targetLang]}.
          </p>

          <Field label="Microphone">
            <select
              value={local.micDeviceId ?? ''}
              onChange={(e) =>
                setLocal({ ...local, micDeviceId: e.target.value || null })
              }
              className="input"
            >
              <option value="">System default</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </Field>

          <Field label="API server URL">
            <input
              type="url"
              value={local.apiBaseUrl}
              onChange={(e) => setLocal({ ...local, apiBaseUrl: e.target.value })}
              className="input"
              placeholder="http://localhost:3001"
            />
          </Field>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={local.darkMode}
              onChange={(e) => setLocal({ ...local, darkMode: e.target.checked })}
              className="w-4 h-4 rounded accent-accent"
            />
            <span className="text-sm">Dark mode</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-hover font-medium transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-lg border border-border hover:bg-border/50 transition-colors text-sm"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-muted">{label}</label>
      {children}
    </div>
  );
}
