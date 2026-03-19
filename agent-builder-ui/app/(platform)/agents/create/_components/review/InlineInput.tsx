import { X } from "lucide-react";

interface InlineInputProps {
  value: string;
  onChange: (v: string) => void;
  onDelete: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function InlineInput({
  value,
  onChange,
  onDelete,
  placeholder = "",
  autoFocus = false,
}: InlineInputProps) {
  return (
    <div className="flex items-center gap-2 group">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] shrink-0" />
      <input
        autoFocus={autoFocus}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 py-0.5 text-sm font-satoshi-medium text-[var(--text-secondary)] bg-transparent border-b border-[var(--border-default)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)]"
      />
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--error)] transition-all shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
