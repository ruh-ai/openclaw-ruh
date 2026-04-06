"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, ArrowUp } from "lucide-react";
import Image from "next/image";

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  prefillValue?: string;
  onPrefillConsumed?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  placeholder = "Describe your agent idea",
  disabled = false,
  prefillValue,
  onPrefillConsumed,
}) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When a clarification option is selected, pre-fill the input
  useEffect(() => {
    if (prefillValue) {
      setValue(prefillValue);
      textareaRef.current?.focus();
      onPrefillConsumed?.();
    }
  }, [prefillValue, onPrefillConsumed]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex items-end gap-2 border border-border-default rounded-2xl bg-white px-4 py-3 shadow-sm">
      <Image
        src="/assets/logos/favicon.svg"
        alt=""
        width={20}
        height={20}
        className="shrink-0 mb-1 opacity-40"
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="focus-breathe flex-1 resize-none bg-transparent text-sm font-satoshi-regular text-text-primary placeholder:text-text-placeholder outline-none min-h-[24px] max-h-[120px] leading-relaxed"
      />
      <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
        <button
          type="button"
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary transition-colors"
          aria-label="Voice input"
        >
          <Mic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="p-1.5 rounded-lg border border-border-default text-text-tertiary
            hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)]
            disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-tertiary disabled:hover:border-border-default
            transition-all duration-200"
          aria-label="Send message"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
