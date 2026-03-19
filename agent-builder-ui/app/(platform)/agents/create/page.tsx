"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { BotMessage } from "./_components/BotMessage";
import { UserMessage } from "./_components/UserMessage";
import { ChatInput } from "./_components/ChatInput";
import { ReviewAgent } from "./_components/review/ReviewAgent";
import { ConfigureAgent } from "./_components/configure/ConfigureAgent";
import { Button } from "@/components/ui/button";
import { useOpenClawChat } from "@/hooks/use-openclaw-chat";
import { useState } from "react";

export default function CreateAgentPage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"chat" | "review" | "configure">("chat");

  const {
    messages,
    isLoading,
    statusMessage,
    skillGraph,
    sendMessage,
  } = useOpenClawChat();

  // Auto-scroll to bottom on new messages or status changes
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [messages, isLoading, statusMessage]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (view === "review") {
    return (
      <ReviewAgent
        onBack={() => setView("chat")}
        onConfirm={() => setView("configure")}
      />
    );
  }

  if (view === "configure") {
    return (
      <ConfigureAgent
        agentName="Finance Assistant"
        onBack={() => setView("review")}
        onComplete={() => router.push("/agents")}
        onCancel={() => router.push("/agents")}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 md:px-8 py-4 shrink-0 border-b border-border-default">
        <button
          onClick={() => router.push("/agents")}
          className="p-1 rounded-lg hover:bg-[var(--color-light,#f5f5f5)] transition-colors cursor-pointer"
          aria-label="Back to agents"
        >
          <ChevronLeft className="h-5 w-5 text-text-secondary" />
        </button>
        <h1 className="text-lg font-satoshi-bold text-text-primary">
          Create New Agent
        </h1>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-0">
        <div className="max-w-3xl mx-auto md:ml-8 lg:ml-16 py-6 space-y-6">
          {messages.map((msg, index) =>
            msg.role === "architect" ? (
              <BotMessage
                key={msg.id}
                message={msg.content}
                animate={index > 0}
              />
            ) : (
              <UserMessage key={msg.id} message={msg.content} />
            )
          )}

          {/* Skill graph ready — show proceed card */}
          {skillGraph && (
            <div className="animate-fadeIn">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                  <Image
                    src="/assets/logos/favicon.svg"
                    alt="Ruh AI"
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm font-satoshi-regular text-text-primary leading-relaxed mb-3">
                    Skill graph generated with{" "}
                    <strong>{skillGraph.length} skills</strong>. Ready to
                    review and configure your agent.
                  </p>

                  {/* Skills preview */}
                  <ul className="space-y-1.5 mb-5">
                    {skillGraph.map((node) => (
                      <li
                        key={node.skill_id}
                        className="flex items-center gap-2 text-sm font-satoshi-regular text-text-primary"
                      >
                        <span className="text-text-tertiary">&bull;</span>
                        <span className="text-text-secondary">
                          {node.name}
                        </span>
                        {node.description && (
                          <span className="text-text-tertiary">
                            — {node.description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-end">
                    <Button
                      variant="primary"
                      className="h-10 px-5 gap-1.5 rounded-lg"
                      onClick={() => setView("review")}
                    >
                      Proceed to Review
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading / status indicator */}
          {isLoading && (
            <div className="flex items-center gap-3 pl-0 animate-fadeIn">
              <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                <Image
                  src="/assets/logos/favicon.svg"
                  alt="Ruh AI"
                  width={28}
                  height={28}
                  className="animate-spin"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-satoshi-regular text-text-tertiary">
                  {statusMessage || "Thinking..."}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 md:px-0 pb-6 pt-3">
        <div className="max-w-3xl mx-auto md:ml-8 lg:ml-16">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading}
            placeholder={
              skillGraph
                ? "Ask follow-up questions or proceed to review"
                : "Describe your agent idea..."
            }
          />
        </div>
      </div>
    </div>
  );
}
