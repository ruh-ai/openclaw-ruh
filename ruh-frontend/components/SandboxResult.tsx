"use client";

import { useState } from "react";

export interface SandboxResultData {
  sandbox_id: string;
  sandbox_state: string;
  dashboard_url: string | null;
  signed_url: string | null;
  standard_url: string | null;
  preview_token: string | null;
  gateway_token: string | null;
  gateway_port: number;
  ssh_command: string;
  approve_command: string;
}

interface Props {
  data: SandboxResultData;
  approvalStatus: "waiting" | "approved" | null;
  onReset: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copy}
      className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-2 shrink-0"
      title="Copy"
    >
      {copied ? "✓" : "Copy"}
    </button>
  );
}

function InfoRow({ label, value, secret }: { label: string; value: string | null; secret?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-800 last:border-0">
      <span className="text-gray-500 text-xs shrink-0 w-32">{label}</span>
      <span className={`text-sm font-mono break-all ${secret ? "text-yellow-300" : "text-gray-200"}`}>
        {value}
      </span>
      <CopyButton value={value} />
    </div>
  );
}

export default function SandboxResult({ data, approvalStatus, onReset }: Props) {
  return (
    <div className="bg-gray-900 rounded-2xl border border-green-800 overflow-hidden">
      <div className="px-5 py-3 bg-green-950 border-b border-green-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm font-semibold">Sandbox Ready</span>
          <span className="text-xs text-gray-500">{data.sandbox_id}</span>
        </div>
        <button
          onClick={onReset}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Create another
        </button>
      </div>

      {/* Approval status banner */}
      {approvalStatus === "waiting" && (
        <div className="px-5 py-3 bg-yellow-950 border-b border-yellow-800 flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
          <div>
            <p className="text-yellow-300 text-sm font-medium">Waiting for device pairing</p>
            <p className="text-yellow-600 text-xs mt-0.5">
              Open the Dashboard URL, paste the Gateway Token, and click Connect — the backend will auto-approve the pairing request.
            </p>
          </div>
        </div>
      )}
      {approvalStatus === "approved" && (
        <div className="px-5 py-3 bg-green-950 border-b border-green-800 flex items-center gap-3">
          <span className="text-green-400 text-lg">✓</span>
          <div>
            <p className="text-green-300 text-sm font-medium">Device approved — you&apos;re connected!</p>
            <p className="text-green-600 text-xs mt-0.5">Click Connect in the browser to open the chat UI.</p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-0">
        <InfoRow label="Sandbox ID" value={data.sandbox_id} />
        <InfoRow label="State" value={data.sandbox_state} />
        <InfoRow label="Dashboard URL" value={data.dashboard_url} />
        <InfoRow label="Preview Token" value={data.preview_token} secret />
        <InfoRow label="Gateway Token" value={data.gateway_token} secret />
        <InfoRow label="SSH" value={data.ssh_command} />
        <InfoRow label="Approve cmd" value={data.approve_command} />
      </div>

      {data.dashboard_url && (
        <div className="px-5 pb-5">
          <a
            href={data.dashboard_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
          >
            Open Dashboard →
          </a>
        </div>
      )}

      <div className="px-5 pb-5 space-y-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Next steps</p>
        <ol className="text-xs text-gray-400 list-decimal list-inside space-y-1">
          <li>Open the Dashboard URL and dismiss any Daytona warning</li>
          <li>Paste the <span className="text-yellow-300">Gateway Token</span> and click Connect</li>
          <li>Wait for the yellow &ldquo;Waiting for device pairing&rdquo; banner above to turn green — the backend is auto-approving your request</li>
          <li>Click Connect again — the chat UI should appear</li>
        </ol>
      </div>
    </div>
  );
}
