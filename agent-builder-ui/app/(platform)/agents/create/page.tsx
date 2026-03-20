"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
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
import {
  parseAgentContent,
  type ClarificationQuestion,
  type ParsedClarification,
} from "@/lib/openclaw/parse-response";

interface ClarificationWizard {
  questions: ClarificationQuestion[];
  currentIndex: number;
  answers: Record<string, string>;
}

interface VirtualMessage {
  id: string;
  role: "architect" | "user";
  content: string;
  displayContent?: string;
}

export default function CreateAgentPage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"chat" | "review" | "configure">("chat");
  const [wizard, setWizard] = useState<ClarificationWizard | null>(null);
  const [virtualMessages, setVirtualMessages] = useState<VirtualMessage[]>([]);

  const {
    messages,
    isLoading,
    statusMessage,
    skillGraph,
    sendMessage,
    awaitingCompletion,
  } = useOpenClawChat();

  // Detect clarification JSON in the latest bot message and start wizard
  useEffect(() => {
    if (wizard || isLoading || messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "architect") return;

    const parsed = parseAgentContent(lastMsg.content);
    if (parsed.json?.type === "clarification") {
      const questions = (parsed.json as ParsedClarification).questions;
      if (questions.length > 0) {
        setWizard({
          questions,
          currentIndex: 0,
          answers: {},
        });
        setVirtualMessages([]);
      }
    }
  }, [messages, isLoading, wizard]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [messages, isLoading, statusMessage, wizard, virtualMessages]);

  // Handle answer (from pill click or chat input during wizard)
  const handleWizardAnswer = useCallback(
    (answer: string) => {
      if (!wizard) return;

      const currentQ = wizard.questions[wizard.currentIndex];
      const newAnswers = { ...wizard.answers, [currentQ.id]: answer };

      // Add the question as bot message and answer as user message to virtual messages
      setVirtualMessages((prev) => [
        ...prev,
        { id: `user-${currentQ.id}`, role: "user", content: answer },
      ]);

      const nextIndex = wizard.currentIndex + 1;

      if (nextIndex >= wizard.questions.length) {
        // All questions answered — compile and send to agent (raw format)
        const compiled = Object.entries(newAnswers)
          .filter(([, v]) => v.trim())
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n");

        // Build a user-friendly display version for the chat bubble
        const displayLines = Object.entries(newAnswers)
          .filter(([, v]) => v.trim())
          .map(
            ([key, value]) =>
              `• ${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: ${value}`
          );
        const displayMessage = `Here are my selections:\n${displayLines.join("\n")}`;

        setWizard(null);
        setVirtualMessages([]);
        sendMessage(compiled, displayMessage);
      } else {
        // Move to next question
        setWizard({
          ...wizard,
          currentIndex: nextIndex,
          answers: newAnswers,
        });
      }
    },
    [wizard, sendMessage]
  );

  // Handle chat input send — intercept during wizard
  const handleSend = useCallback(
    (text: string) => {
      if (wizard) {
        handleWizardAnswer(text);
      } else {
        sendMessage(text);
      }
    },
    [wizard, handleWizardAnswer, sendMessage]
  );

  // Current question for the wizard
  const currentQuestion = wizard
    ? wizard.questions[wizard.currentIndex]
    : null;

  // Build the virtual question/answer messages for display
  const wizardDisplayMessages = useMemo(() => {
    if (!wizard) return [];
    const display: VirtualMessage[] = [];

    // Show already-answered questions and their answers
    for (let i = 0; i < wizard.currentIndex; i++) {
      const q = wizard.questions[i];
      display.push({
        id: `q-${q.id}`,
        role: "architect",
        content: q.question,
      });
      const userAnswer = virtualMessages.find(
        (vm) => vm.id === `user-${q.id}`
      );
      if (userAnswer) {
        display.push(userAnswer);
      }
    }

    // Show current question
    if (currentQuestion) {
      display.push({
        id: `q-${currentQuestion.id}`,
        role: "architect",
        content: currentQuestion.question,
      });
    }

    return display;
  }, [wizard, currentQuestion, virtualMessages]);

  // Determine quick replies and placeholder for current state
  const quickReplies = currentQuestion?.options || undefined;
  const inputPlaceholder = wizard
    ? currentQuestion?.example || "Type your answer..."
    : skillGraph
      ? "Ask follow-up questions or proceed to review"
      : "Describe your agent idea...";

  // ─── Render ─────────────────────────────────────────────────────────────

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
          {/* Real messages from store */}
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

          {/* Wizard virtual messages (past question/answer pairs) */}
          {wizardDisplayMessages.map((vm, idx) => {
            const isCurrentQuestion =
              wizard &&
              currentQuestion &&
              vm.id === `q-${currentQuestion.id}`;

            if (isCurrentQuestion) {
              // Current question: counter on top, no logo, highlighted text
              return (
                <div key={vm.id} className="animate-fadeIn space-y-2 pl-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#999] font-medium">
                      Question {wizard!.currentIndex + 1} of{" "}
                      {wizard!.questions.length}
                    </span>
                  </div>
                  <p className="text-base font-satoshi-medium text-primary leading-relaxed">
                    {vm.content}
                  </p>
                </div>
              );
            }

            return vm.role === "architect" ? (
              <BotMessage key={vm.id} message={vm.content} animate />
            ) : (
              <UserMessage key={vm.id} message={vm.content} />
            );
          })}

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

          {/* Loading / status indicator — shown during active request or while polling */}
          {(isLoading || awaitingCompletion) && (
            <div className="flex items-center gap-3 pl-0 animate-fadeIn">
              <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                {awaitingCompletion ? (
                  <span className="text-xl animate-pulse">⏳</span>
                ) : (
                  <Image
                    src="/assets/logos/favicon.svg"
                    alt="Ruh AI"
                    width={28}
                    height={28}
                    className="animate-spin"
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-satoshi-regular text-text-tertiary">
                  {awaitingCompletion === "build"
                    ? "Waiting for build to complete..."
                    : awaitingCompletion === "deploy"
                      ? "Waiting for deployment to finish..."
                      : statusMessage || "Processing your inputs..."}
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
            onSend={handleSend}
            disabled={isLoading || !!awaitingCompletion}
            placeholder={inputPlaceholder}
            quickReplies={quickReplies}
            onQuickReply={handleWizardAnswer}
          />
        </div>
      </div>
    </div>
  );
}
