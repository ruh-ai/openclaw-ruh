import { SlidersHorizontal, Pencil, X, Check } from "lucide-react";

interface SectionCardProps {
  title: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  children,
}: SectionCardProps) {
  return (
    <div
      className={`bg-[var(--card-color)] border rounded-2xl px-6 py-4 transition-all duration-200 ${
        isEditing
          ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)]"
          : "border-[var(--border-stroke)]"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-base font-satoshi-bold text-[var(--text-primary)]">
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {isEditing ? (
            <>
              <button
                onClick={onCancel}
                className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--border-muted)] text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors"
              >
                <X className="h-[15px] w-[15px]" />
              </button>
              <button
                onClick={onSave}
                className="p-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white transition-colors"
              >
                <Check className="h-[15px] w-[15px]" />
              </button>
            </>
          ) : (
            <>
              <button className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                <SlidersHorizontal className="h-[15px] w-[15px]" />
              </button>
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors"
              >
                <Pencil className="h-[15px] w-[15px]" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-[var(--border-default)] mb-4" />
      {children}
    </div>
  );
}
