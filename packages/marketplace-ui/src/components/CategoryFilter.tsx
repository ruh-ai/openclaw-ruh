import { MARKETPLACE_CATEGORIES } from "../types";

interface CategoryFilterProps {
  selected: string;
  onChange: (category: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  "": "All",
  general: "General",
  marketing: "Marketing",
  sales: "Sales",
  support: "Support",
  engineering: "Engineering",
  data: "Data",
  finance: "Finance",
  hr: "HR",
  operations: "Operations",
  custom: "Custom",
};

export function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange("")}
        className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
          selected === ""
            ? "bg-[#ae00d0] text-white"
            : "bg-[#f5f5f3] text-[#4a4a4a] hover:bg-[#ae00d0]/10"
        }`}
      >
        All
      </button>
      {MARKETPLACE_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
            selected === cat
              ? "bg-[#ae00d0] text-white"
              : "bg-[#f5f5f3] text-[#4a4a4a] hover:bg-[#ae00d0]/10"
          }`}
        >
          {CATEGORY_LABELS[cat] || cat}
        </button>
      ))}
    </div>
  );
}
