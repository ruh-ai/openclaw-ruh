interface RatingStarsProps {
  rating: number;
  maxStars?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  size?: "sm" | "md";
}

export function RatingStars({ rating, maxStars = 5, interactive = false, onRate, size = "sm" }: RatingStarsProps) {
  const sizeClass = size === "sm" ? "text-xs" : "text-base";
  return (
    <span className={`inline-flex gap-0.5 ${sizeClass}`}>
      {Array.from({ length: maxStars }, (_, i) => (
        <span
          key={i}
          className={`${interactive ? "cursor-pointer" : ""} ${
            i < Math.round(rating) ? "text-[#f59e0b]" : "text-[#e5e5e3]"
          }`}
          onClick={() => interactive && onRate?.(i + 1)}
        >
          {"\u2605"}
        </span>
      ))}
    </span>
  );
}
