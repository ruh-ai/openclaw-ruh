"use client";
import { useEffect, useState } from "react";
import { isTauri } from "@/lib/platform";
import { getSettings, updateSettings, type AppSettings } from "@/lib/desktop/settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const isDesktop = isTauri();

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    await updateSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestConnection = async () => {
    if (!settings) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${settings.backend_url}/health`);
      setTestResult(res.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  if (!settings) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <h1 className="text-xl font-bold">Settings</h1>
      <p className="text-sm text-gray-500 mt-1">
        {isDesktop ? "Desktop application preferences" : "Application preferences"}
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Backend URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.backend_url}
              onChange={e => setSettings({ ...settings, backend_url: e.target.value })}
              className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-500"
            />
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-3 py-2 text-xs font-medium border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? "Testing..." : "Test"}
            </button>
          </div>
          {testResult === "ok" && <p className="text-xs text-green-600 mt-1">Connected successfully</p>}
          {testResult === "fail" && <p className="text-xs text-red-500 mt-1">Connection failed</p>}
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600">Auto-connect on startup</label>
          <button
            onClick={() => setSettings({ ...settings, auto_connect: !settings.auto_connect })}
            className={`w-10 h-5 rounded-full transition-colors ${settings.auto_connect ? "bg-purple-600" : "bg-gray-300"}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.auto_connect ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Theme</label>
          <select
            value={settings.theme}
            onChange={e => setSettings({ ...settings, theme: e.target.value })}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          className="w-full py-2.5 text-sm font-bold text-white bg-purple-600 rounded-lg hover:opacity-90 transition-colors"
        >
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
