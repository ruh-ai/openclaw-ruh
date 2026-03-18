"use client";

import { useState } from "react";
import SandboxSidebar, { type SandboxRecord } from "@/components/SandboxSidebar";
import ChatPanel from "@/components/ChatPanel";
import CronsPanel from "@/components/CronsPanel";
import ChannelsPanel from "@/components/ChannelsPanel";
import SandboxForm from "@/components/SandboxForm";

type MainView = "empty" | "chat" | "crons" | "channels" | "create";
type SandboxTab = "chat" | "crons" | "channels";

export default function Home() {
  const [selectedSandbox, setSelectedSandbox] = useState<SandboxRecord | null>(null);
  const [view, setView] = useState<MainView>("empty");
  const [sandboxTab, setSandboxTab] = useState<SandboxTab>("chat");
  const [refreshKey, setRefreshKey] = useState(0);

  function handleSelectSandbox(sandbox: SandboxRecord) {
    setSelectedSandbox(sandbox);
    setView("chat");
  }

  function handleNewSandbox() {
    setView("create");
    setSelectedSandbox(null);
  }

  function handleCreated() {
    setRefreshKey((k) => k + 1);
  }

  function handleCancelCreate() {
    if (!selectedSandbox) { setView("empty"); return; }
    setView(sandboxTab === "crons" ? "crons" : sandboxTab === "channels" ? "channels" : "chat");
  }

  const isSandboxView = view === "chat" || view === "crons" || view === "channels";

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-60 shrink-0">
        <SandboxSidebar
          selectedId={selectedSandbox?.sandbox_id ?? null}
          onSelect={handleSelectSandbox}
          onNew={handleNewSandbox}
          refreshKey={refreshKey}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 h-12 flex items-center px-6 border-b border-gray-800 gap-6">
          <h1 className="text-sm font-semibold text-white tracking-tight shrink-0">OpenClaw on Daytona</h1>

          {/* Tabs — only shown when a sandbox is selected */}
          {isSandboxView && selectedSandbox && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setSandboxTab("chat"); setView("chat"); }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  sandboxTab === "chat"
                    ? "bg-gray-800 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => { setSandboxTab("crons"); setView("crons"); }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  sandboxTab === "crons"
                    ? "bg-gray-800 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Crons
              </button>
              <button
                onClick={() => { setSandboxTab("channels"); setView("channels"); }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  sandboxTab === "channels"
                    ? "bg-gray-800 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Channels
              </button>
            </div>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {view === "chat" && selectedSandbox && (
            <ChatPanel sandbox={selectedSandbox} />
          )}

          {view === "crons" && selectedSandbox && (
            <CronsPanel sandbox={selectedSandbox} />
          )}

          {view === "channels" && selectedSandbox && (
            <ChannelsPanel sandbox={selectedSandbox} />
          )}

          {view === "create" && (
            <div className="h-full overflow-y-auto p-6">
              <div className="max-w-lg mx-auto">
                <SandboxForm onCreated={handleCreated} onCancel={handleCancelCreate} />
              </div>
            </div>
          )}

          {view === "empty" && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="text-5xl">🐾</div>
              <p className="text-gray-400 text-sm">Select a sandbox from the sidebar to start chatting.</p>
              <button
                onClick={handleNewSandbox}
                className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-colors font-medium"
              >
                + Create New Sandbox
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
