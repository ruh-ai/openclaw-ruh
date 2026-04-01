"use client";

import { useState } from "react";
import SandboxSidebar, { type SandboxRecord } from "@/components/SandboxSidebar";
import ChatPanel, { type Conversation } from "@/components/ChatPanel";
import HistoryPanel from "@/components/HistoryPanel";
import MissionControlPanel from "@/components/MissionControlPanel";
import SandboxForm from "@/components/SandboxForm";

type MainView = "empty" | "chat" | "history" | "mission-control" | "create";
type SandboxTab = "chat" | "history" | "mission-control";

const SANDBOX_TABS: { id: SandboxTab; label: string }[] = [
  { id: "chat",            label: "Chat" },
  { id: "history",         label: "History" },
  { id: "mission-control", label: "Mission Control" },
];

export default function Home() {
  const [selectedSandbox, setSelectedSandbox] = useState<SandboxRecord | null>(null);
  const [view, setView] = useState<MainView>("empty");
  const [sandboxTab, setSandboxTab] = useState<SandboxTab>("chat");
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  function handleSelectSandbox(sandbox: SandboxRecord) {
    setSelectedSandbox(sandbox);
    setSandboxTab("chat");
    setView("chat");
    setActiveConversation(null);
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
    setView(sandboxTab);
  }

  function handleSwitchTab(tab: SandboxTab) {
    setSandboxTab(tab);
    setView(tab);
  }

  // Called when the user clicks a conversation in History — opens it in Chat
  function handleOpenConversation(conv: Conversation) {
    setActiveConversation(conv);
    handleSwitchTab("chat");
  }

  // New Chat button in ChatPanel
  function handleNewChat() {
    setActiveConversation(null);
  }

  // When ChatPanel auto-creates a conversation on first send
  function handleConversationCreated(conv: Conversation) {
    setActiveConversation(conv);
  }

  const isSandboxView = view === "chat" || view === "history" || view === "mission-control";

  return (
    <main className="flex h-screen bg-[#f9f7f9] overflow-hidden max-w-[1800px] mx-auto">
      {/* Sidebar */}
      <SandboxSidebar
        selectedId={selectedSandbox?.sandbox_id ?? null}
        onSelect={handleSelectSandbox}
        onNew={handleNewSandbox}
        refreshKey={refreshKey}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Sub-header: sandbox name + tabs */}
        {isSandboxView && selectedSandbox && (
          <div className="shrink-0 h-12 flex items-center px-5 border-b border-[#eff0f3] bg-white gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${selectedSandbox.approved ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
              <span className="text-sm font-semibold text-gray-900 truncate max-w-[160px]">
                {selectedSandbox.sandbox_name}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {SANDBOX_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => handleSwitchTab(id)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                    sandboxTab === id
                      ? "bg-[#fdf4ff] text-[#ae00d0]"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Create header */}
        {view === "create" && (
          <div className="shrink-0 h-12 flex items-center px-5 border-b border-[#eff0f3] bg-white">
            <span className="text-sm font-semibold text-gray-900">New Sandbox</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0">
          {view === "chat" && selectedSandbox && (
            <ChatPanel
              sandbox={selectedSandbox}
              conversation={activeConversation}
              onNewChat={handleNewChat}
              onConversationCreated={handleConversationCreated}
            />
          )}

          {view === "history" && selectedSandbox && (
            <HistoryPanel
              sandbox={selectedSandbox}
              activeConvId={activeConversation?.id ?? null}
              onOpenConversation={handleOpenConversation}
            />
          )}

          {view === "mission-control" && selectedSandbox && (
            <MissionControlPanel sandbox={selectedSandbox} />
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
              <div className="w-14 h-14 rounded-2xl bg-[#fdf4ff] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ae00d0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
                  <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
                  <line x1="6" x2="6.01" y1="6" y2="6"/>
                  <line x1="6" x2="6.01" y1="18" y2="18"/>
                </svg>
              </div>
              <div>
                <p className="text-gray-900 font-medium text-sm">No sandbox selected</p>
                <p className="text-gray-400 text-xs mt-1">Select a sandbox from the sidebar or create a new one.</p>
              </div>
              <button
                onClick={handleNewSandbox}
                className="text-sm bg-[#ae00d0] hover:bg-[#9400b4] text-white px-4 py-2 rounded-xl transition-colors font-medium"
              >
                + New Sandbox
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
