"use client";

import { useCallback, useEffect, useState } from "react";
import type { SandboxRecord } from "./SandboxSidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  dmPolicy: string;
}

interface SlackConfig {
  enabled: boolean;
  mode: string;
  appToken: string;
  botToken: string;
  signingSecret: string;
  dmPolicy: string;
}

interface ChannelsConfig {
  telegram: TelegramConfig;
  slack: SlackConfig;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ProbeStatus = "idle" | "probing" | "done";

const DM_POLICIES = ["pairing", "allowlist", "open", "disabled"] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
        enabled
          ? "bg-green-50 text-green-600"
          : "bg-gray-100 text-gray-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

function SaveFeedback({ status, logs }: { status: SaveStatus; logs: string[] }) {
  if (status === "saving") {
    return <span className="text-xs text-violet-600 animate-pulse">Saving & restarting gateway…</span>;
  }
  if (status === "saved") {
    return (
      <div className="space-y-1">
        <span className="text-xs text-green-600">Saved — gateway restarted</span>
        {logs.length > 0 && (
          <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap leading-relaxed">
            {logs.join("\n")}
          </pre>
        )}
      </div>
    );
  }
  if (status === "error") {
    return <span className="text-xs text-red-500">Failed to save — check console</span>;
  }
  return null;
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {hint && <span className="ml-1.5 text-gray-400 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-40"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-40"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-violet-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ── ProbeSection ───────────────────────────────────────────────────────────────

function ProbeSection({
  sandboxId,
  channel,
}: {
  sandboxId: string;
  channel: "telegram" | "slack";
}) {
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>("idle");
  const [probeOutput, setProbeOutput] = useState("");

  async function probe() {
    setProbeStatus("probing");
    setProbeOutput("");
    try {
      const res = await fetch(
        `${API_URL}/api/sandboxes/${sandboxId}/channels/${channel}/status`
      );
      const data = await res.json();
      setProbeOutput(data.output ?? (res.ok ? "No output" : JSON.stringify(data)));
    } catch (err) {
      setProbeOutput(String(err));
    } finally {
      setProbeStatus("done");
    }
  }

  return (
    <div className="pt-3 border-t border-gray-200 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Connection status</span>
        <button
          onClick={probe}
          disabled={probeStatus === "probing"}
          className="text-xs text-violet-600 hover:text-violet-500 disabled:opacity-50 transition-colors"
        >
          {probeStatus === "probing" ? "Probing…" : "Check status ↗"}
        </button>
      </div>
      {probeStatus === "done" && probeOutput && (
        <pre className="text-[10px] text-gray-600 font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-gray-200">
          {probeOutput}
        </pre>
      )}
    </div>
  );
}

// ── PairingSection ─────────────────────────────────────────────────────────────

function PairingSection({
  sandboxId,
  channel,
}: {
  sandboxId: string;
  channel: "telegram" | "slack";
}) {
  const [code, setCode] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<{ ok: boolean; output: string } | null>(null);

  const [listing, setListing] = useState(false);
  const [listOutput, setListOutput] = useState<{ output: string; codes: string[] } | null>(null);

  async function listPending() {
    setListing(true);
    setListOutput(null);
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandboxId}/channels/${channel}/pairing`);
      const data = await res.json();
      setListOutput({ output: data.output ?? "", codes: data.codes ?? [] });
    } catch (err) {
      setListOutput({ output: String(err), codes: [] });
    } finally {
      setListing(false);
    }
  }

  async function approve(approveCode: string) {
    const trimmed = approveCode.trim().toUpperCase();
    if (!trimmed) return;
    setApproving(true);
    setApproveResult(null);
    try {
      const res = await fetch(
        `${API_URL}/api/sandboxes/${sandboxId}/channels/${channel}/pairing/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
        }
      );
      const data = await res.json();
      setApproveResult({ ok: res.ok, output: data.output ?? (res.ok ? "Approved!" : data.detail ?? "Failed") });
      if (res.ok) {
        setCode("");
        listPending();
      }
    } catch (err) {
      setApproveResult({ ok: false, output: String(err) });
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="pt-3 border-t border-gray-200 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-700">Device Pairing</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Approve users who receive "access not configured" when messaging the bot
          </p>
        </div>
        <button
          onClick={listPending}
          disabled={listing}
          className="text-xs text-violet-600 hover:text-violet-500 disabled:opacity-50 transition-colors shrink-0"
        >
          {listing ? "Loading…" : "List pending ↻"}
        </button>
      </div>

      {/* Pending list */}
      {listOutput && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          {listOutput.codes.length > 0 ? (
            <>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                Pending codes
              </p>
              <div className="space-y-1.5">
                {listOutput.codes.map((c) => (
                  <div key={c} className="flex items-center justify-between gap-3">
                    <code className="text-xs font-mono text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">
                      {c}
                    </code>
                    <button
                      onClick={() => approve(c)}
                      disabled={approving}
                      className="text-xs text-green-600 hover:text-green-500 disabled:opacity-50 transition-colors"
                    >
                      {approving ? "Approving…" : "Approve ✓"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">
              {listOutput.output.trim() || "No pending pairing requests"}
            </p>
          )}
        </div>
      )}

      {/* Manual code entry */}
      <div className="space-y-2">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
          Approve by code
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setApproveResult(null);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") approve(code); }}
            placeholder="e.g. ZJNTY7MY"
            maxLength={8}
            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={() => approve(code)}
            disabled={approving || !code.trim()}
            className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors font-medium shrink-0"
          >
            {approving ? "…" : "Approve"}
          </button>
        </div>

        {/* Result feedback */}
        {approveResult && (
          <div
            className={`rounded-lg px-3 py-2 text-xs font-mono whitespace-pre-wrap ${
              approveResult.ok
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}
          >
            {approveResult.output}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TelegramSection ────────────────────────────────────────────────────────────

function TelegramSection({
  sandboxId,
  initial,
}: {
  sandboxId: string;
  initial: TelegramConfig;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [botToken, setBotToken] = useState("");
  const [dmPolicy, setDmPolicy] = useState(initial.dmPolicy);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(initial.enabled);

  useEffect(() => {
    setEnabled(initial.enabled);
    setBotToken("");
    setDmPolicy(initial.dmPolicy);
    setSaveStatus("idle");
    setLogs([]);
    setExpanded(initial.enabled);
  }, [sandboxId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaveStatus("saving");
    setLogs([]);
    try {
      const body: Record<string, unknown> = { enabled, dmPolicy };
      if (botToken) body.botToken = botToken;

      const res = await fetch(`${API_URL}/api/sandboxes/${sandboxId}/channels/telegram`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Request failed");
      setLogs(data.logs ?? []);
      setSaveStatus("saved");
      setBotToken("");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    }
  }

  const existingToken = initial.botToken;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-base">
            ✈️
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Telegram</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Bot via @BotFather</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge enabled={enabled} />
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600 text-xs transition-colors"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-200 pt-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Enable Telegram</span>
            <Toggle checked={enabled} onChange={setEnabled} />
          </div>

          {/* Bot token */}
          <FieldRow
            label="Bot Token"
            hint={existingToken ? `(current: ${existingToken})` : "(required)"}
          >
            <TextInput
              value={botToken}
              onChange={setBotToken}
              placeholder={existingToken ? "Leave blank to keep existing token" : "123456:ABCdef..."}
              type="password"
            />
          </FieldRow>

          {/* DM policy */}
          <FieldRow label="DM Policy" hint="Who can DM the bot">
            <SelectInput value={dmPolicy} onChange={setDmPolicy} options={DM_POLICIES} />
          </FieldRow>

          {/* Save */}
          <div className="flex items-center justify-between pt-1">
            <SaveFeedback status={saveStatus} logs={logs} />
            <button
              onClick={save}
              disabled={saveStatus === "saving"}
              className="ml-auto text-sm bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
            >
              {saveStatus === "saving" ? "Saving…" : "Save & Restart"}
            </button>
          </div>

          {/* Status probe */}
          <ProbeSection sandboxId={sandboxId} channel="telegram" />

          {/* Pairing */}
          <PairingSection sandboxId={sandboxId} channel="telegram" />

          {/* Setup hint */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Setup</p>
            <ol className="text-xs text-gray-500 space-y-0.5 list-decimal list-inside">
              <li>Chat with <span className="text-violet-600">@BotFather</span> on Telegram</li>
              <li>Run <code className="text-gray-700">/newbot</code> and follow prompts</li>
              <li>Paste the token above and save</li>
              <li>Optionally disable group privacy with <code className="text-gray-700">/setprivacy</code></li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SlackSection ───────────────────────────────────────────────────────────────

function SlackSection({
  sandboxId,
  initial,
}: {
  sandboxId: string;
  initial: SlackConfig;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [mode, setMode] = useState(initial.mode || "socket");
  const [appToken, setAppToken] = useState("");
  const [botToken, setBotToken] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [dmPolicy, setDmPolicy] = useState(initial.dmPolicy);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(initial.enabled);

  useEffect(() => {
    setEnabled(initial.enabled);
    setMode(initial.mode || "socket");
    setAppToken("");
    setBotToken("");
    setSigningSecret("");
    setDmPolicy(initial.dmPolicy);
    setSaveStatus("idle");
    setLogs([]);
    setExpanded(initial.enabled);
  }, [sandboxId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaveStatus("saving");
    setLogs([]);
    try {
      const body: Record<string, unknown> = { enabled, mode, dmPolicy };
      if (appToken) body.appToken = appToken;
      if (botToken) body.botToken = botToken;
      if (signingSecret) body.signingSecret = signingSecret;

      const res = await fetch(`${API_URL}/api/sandboxes/${sandboxId}/channels/slack`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Request failed");
      setLogs(data.logs ?? []);
      setSaveStatus("saved");
      setAppToken("");
      setBotToken("");
      setSigningSecret("");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-base">
            💬
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Slack</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Socket or HTTP Events API</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge enabled={enabled} />
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600 text-xs transition-colors"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-200 pt-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Enable Slack</span>
            <Toggle checked={enabled} onChange={setEnabled} />
          </div>

          {/* Mode */}
          <FieldRow label="Connection mode">
            <SelectInput
              value={mode}
              onChange={setMode}
              options={["socket", "http"] as const}
            />
          </FieldRow>

          {/* App token (socket mode) */}
          {mode === "socket" && (
            <FieldRow
              label="App Token"
              hint={initial.appToken ? `(current: ${initial.appToken})` : "(xapp-... required for socket)"}
            >
              <TextInput
                value={appToken}
                onChange={setAppToken}
                placeholder={initial.appToken ? "Leave blank to keep existing" : "xapp-1-..."}
                type="password"
              />
            </FieldRow>
          )}

          {/* Bot token */}
          <FieldRow
            label="Bot Token"
            hint={initial.botToken ? `(current: ${initial.botToken})` : "(xoxb-... required)"}
          >
            <TextInput
              value={botToken}
              onChange={setBotToken}
              placeholder={initial.botToken ? "Leave blank to keep existing" : "xoxb-..."}
              type="password"
            />
          </FieldRow>

          {/* Signing secret (http mode) */}
          {mode === "http" && (
            <FieldRow
              label="Signing Secret"
              hint={initial.signingSecret ? `(current: ${initial.signingSecret})` : "(required for HTTP mode)"}
            >
              <TextInput
                value={signingSecret}
                onChange={setSigningSecret}
                placeholder={initial.signingSecret ? "Leave blank to keep existing" : "Signing secret..."}
                type="password"
              />
            </FieldRow>
          )}

          {/* DM policy */}
          <FieldRow label="DM Policy" hint="Who can DM the bot">
            <SelectInput value={dmPolicy} onChange={setDmPolicy} options={DM_POLICIES} />
          </FieldRow>

          {/* Save */}
          <div className="flex items-center justify-between pt-1">
            <SaveFeedback status={saveStatus} logs={logs} />
            <button
              onClick={save}
              disabled={saveStatus === "saving"}
              className="ml-auto text-sm bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
            >
              {saveStatus === "saving" ? "Saving…" : "Save & Restart"}
            </button>
          </div>

          {/* Status probe */}
          <ProbeSection sandboxId={sandboxId} channel="slack" />

          {/* Setup guide */}
          {mode === "socket" ? (
            <div className="bg-gray-50 rounded-lg p-3 space-y-4">
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                Socket mode setup guide
              </p>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">1 · Create the Slack app</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>Go to <span className="text-violet-600">api.slack.com/apps</span> → click <em>Create New App</em> → choose <em>From scratch</em></li>
                  <li>Give your app a name and select the target workspace, then click <em>Create App</em></li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">2 · Enable Socket Mode &amp; get the App Token</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Settings</em> click <em>Socket Mode</em> and toggle <em>Enable Socket Mode</em> on</li>
                  <li>A dialog appears — give the token a name (e.g. <em>openclaw</em>), ensure the scope <code className="text-gray-700 bg-gray-100 px-1 rounded">connections:write</code> is selected, then click <em>Generate</em></li>
                  <li>Copy the token shown — it starts with <code className="text-gray-700 bg-gray-100 px-1 rounded">xapp-1-</code> — and paste it into the <em>App Token</em> field above</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">3 · Add bot scopes</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Features</em> click <em>OAuth &amp; Permissions</em></li>
                  <li>Scroll down to the <em>Scopes</em> section and find <em>Bot Token Scopes</em></li>
                  <li>Click <em>Add an OAuth Scope</em> and add each of the following scopes one by one:</li>
                </ol>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {[
                    ["chat:write",         "Send messages as the bot"],
                    ["channels:history",   "Read messages in public channels"],
                    ["groups:history",     "Read messages in private channels"],
                    ["im:history",         "Read direct message history"],
                    ["im:read",            "View DM info & membership"],
                    ["im:write",           "Open DM conversations"],
                    ["mpim:history",       "Read group DM history"],
                    ["app_mentions:read",  "Receive @mention events"],
                    ["reactions:write",    "Add emoji reactions"],
                    ["pins:read",          "View pinned items"],
                    ["files:read",         "Read files shared in channels"],
                    ["files:write",        "Upload files"],
                    ["assistant:write",    "Respond as an AI assistant"],
                    ["commands",           "Add slash commands"],
                  ].map(([scope, desc]) => (
                    <div key={scope} className="flex items-start gap-1.5">
                      <code className="text-[10px] text-gray-700 bg-gray-100 rounded px-1 py-0.5 shrink-0 mt-0.5">{scope}</code>
                      <span className="text-[10px] text-gray-400 leading-tight">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">4 · Subscribe to bot events</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Features</em> click <em>Event Subscriptions</em> and toggle <em>Enable Events</em> on</li>
                  <li>Expand <em>Subscribe to bot events</em> and click <em>Add Bot User Event</em> for each:</li>
                </ol>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {[
                    ["app_mention",           "Bot is @mentioned in any channel"],
                    ["message.channels",      "Messages posted in public channels"],
                    ["message.groups",        "Messages in private channels"],
                    ["message.im",            "Direct messages to the bot"],
                    ["message.mpim",          "Messages in group DMs"],
                    ["reaction_added",        "User adds a reaction"],
                    ["reaction_removed",      "User removes a reaction"],
                    ["pin_added",             "Item pinned in a channel"],
                    ["pin_removed",           "Item unpinned from a channel"],
                    ["member_joined_channel", "Member joins a channel"],
                    ["member_left_channel",   "Member leaves a channel"],
                  ].map(([evt, desc]) => (
                    <div key={evt} className="flex items-start gap-1.5">
                      <code className="text-[10px] text-gray-700 bg-gray-100 rounded px-1 py-0.5 shrink-0 mt-0.5">{evt}</code>
                      <span className="text-[10px] text-gray-400 leading-tight">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">5 · Enable DMs via App Home</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Features</em> click <em>App Home</em></li>
                  <li>Scroll to <em>Show Tabs</em> and enable the <em>Messages Tab</em></li>
                  <li>Tick <em>Allow users to send Slash commands and messages from the messages tab</em></li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">6 · Install the app &amp; copy the Bot Token</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Settings</em> click <em>Install App</em> (or go to <em>OAuth &amp; Permissions</em> and click <em>Install to Workspace</em>)</li>
                  <li>Review the permissions and click <em>Allow</em></li>
                  <li>You are redirected back — copy the <em>Bot User OAuth Token</em> (starts with <code className="text-gray-700 bg-gray-100 px-1 rounded">xoxb-</code>) and paste it in the <em>Bot Token</em> field above</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 space-y-4">
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                HTTP Events API setup guide
              </p>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">1 · Create the Slack app</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>Go to <span className="text-violet-600">api.slack.com/apps</span> → click <em>Create New App</em> → choose <em>From scratch</em></li>
                  <li>Give your app a name and select the target workspace, then click <em>Create App</em></li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">2 · Add bot scopes</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Features</em> click <em>OAuth &amp; Permissions</em></li>
                  <li>Scroll to <em>Scopes → Bot Token Scopes</em> and click <em>Add an OAuth Scope</em> for each:</li>
                </ol>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {[
                    ["chat:write",         "Send messages as the bot"],
                    ["channels:history",   "Read messages in public channels"],
                    ["groups:history",     "Read messages in private channels"],
                    ["im:history",         "Read direct message history"],
                    ["im:read",            "View DM info & membership"],
                    ["im:write",           "Open DM conversations"],
                    ["mpim:history",       "Read group DM history"],
                    ["app_mentions:read",  "Receive @mention events"],
                    ["reactions:write",    "Add emoji reactions"],
                    ["pins:read",          "View pinned items"],
                    ["files:read",         "Read files shared in channels"],
                    ["files:write",        "Upload files"],
                    ["assistant:write",    "Respond as an AI assistant"],
                    ["commands",           "Add slash commands"],
                  ].map(([scope, desc]) => (
                    <div key={scope} className="flex items-start gap-1.5">
                      <code className="text-[10px] text-gray-700 bg-gray-100 rounded px-1 py-0.5 shrink-0 mt-0.5">{scope}</code>
                      <span className="text-[10px] text-gray-400 leading-tight">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">3 · Configure Event Subscriptions</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Features</em> click <em>Event Subscriptions</em> and toggle <em>Enable Events</em> on</li>
                  <li>In the <em>Request URL</em> field enter your public gateway URL followed by <code className="text-gray-700 bg-gray-100 px-1 rounded">/slack/events</code></li>
                  <li>Slack immediately sends a <em>url_verification</em> challenge — the gateway must already be running and reachable for this to pass</li>
                  <li>Once verified, expand <em>Subscribe to bot events</em> and add the same events as listed in the socket mode guide above</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">4 · Enable DMs via App Home</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>In the left sidebar under <em>Features</em> click <em>App Home</em></li>
                  <li>Enable the <em>Messages Tab</em> and tick <em>Allow users to send Slash commands and messages from the messages tab</em></li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">5 · Install &amp; collect credentials</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                  <li>Go to <em>OAuth &amp; Permissions</em> → click <em>Install to Workspace</em> and allow</li>
                  <li>Copy the <em>Bot User OAuth Token</em> (starts with <code className="text-gray-700 bg-gray-100 px-1 rounded">xoxb-</code>) and paste it in the <em>Bot Token</em> field above</li>
                  <li>Go to <em>Basic Information → App Credentials</em> and copy the <em>Signing Secret</em> — paste it in the <em>Signing Secret</em> field above</li>
                </ol>
              </div>

              <div className="space-y-1 border-t border-gray-200 pt-2">
                <p className="text-[10px] text-yellow-600 font-medium">Tip</p>
                <p className="text-xs text-gray-500">HTTP mode requires the gateway to have a public HTTPS URL before Slack can verify it. Socket mode works behind firewalls and NAT with no public URL needed — prefer it unless you have a specific reason to use HTTP.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ChannelsPanel ──────────────────────────────────────────────────────────────

export default function ChannelsPanel({ sandbox }: { sandbox: SandboxRecord }) {
  const [config, setConfig] = useState<ChannelsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/channels`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Failed to load channel config");
      }
      setConfig(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sandbox.sandbox_id]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-gray-400 animate-pulse">Loading channel config…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={loadConfig}
          className="text-xs text-violet-600 hover:text-violet-500 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="h-full overflow-y-auto px-6 py-6 space-y-4 max-w-2xl mx-auto">
      <div className="space-y-1 mb-6">
        <h2 className="text-sm font-semibold text-gray-900">Channels</h2>
        <p className="text-xs text-gray-500">
          Configure messaging channels for <span className="text-gray-700">{sandbox.sandbox_name}</span>.
          Saving applies <code className="text-gray-600 bg-gray-100 px-1 rounded">openclaw config set</code> on the sandbox and restarts the gateway.
        </p>
      </div>

      <TelegramSection sandboxId={sandbox.sandbox_id} initial={config.telegram} />
      <SlackSection sandboxId={sandbox.sandbox_id} initial={config.slack} />
    </div>
  );
}
