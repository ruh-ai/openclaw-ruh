interface FlowNodeProps {
  label: string;
  sub: string;
  borderColor: string;
  dotColor: string;
  width?: string;
}

export function FlowNode({
  label,
  sub,
  borderColor,
  dotColor,
  width = "w-[160px]",
}: FlowNodeProps) {
  return (
    <div
      className={`bg-white border-[1.6px] ${borderColor} rounded-lg px-3 py-2.5 ${width} flex flex-col items-center gap-1`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-[12px] font-satoshi-bold text-[#222]">{label}</span>
      </div>
      <span className="text-[11px] font-satoshi-regular text-[#4a5565] text-center leading-tight">
        {sub}
      </span>
    </div>
  );
}
