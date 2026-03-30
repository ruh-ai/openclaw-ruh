import { describe, expect, test, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { RatingStars } from "../RatingStars";

describe("RatingStars", () => {
  test("renders 5 star elements by default", () => {
    const { container } = render(<RatingStars rating={3} />);
    const topSpan = container.querySelector("span");
    const stars = topSpan?.querySelectorAll(":scope > span");
    expect(stars?.length).toBe(5);
  });

  test("renders custom number of stars via maxStars", () => {
    const { container } = render(<RatingStars rating={2} maxStars={3} />);
    const topSpan = container.querySelector("span");
    const stars = topSpan?.querySelectorAll(":scope > span");
    expect(stars?.length).toBe(3);
  });

  test("filled stars have the gold color class", () => {
    const { container } = render(<RatingStars rating={3} />);
    const topSpan = container.querySelector("span");
    const stars = Array.from(topSpan?.querySelectorAll(":scope > span") || []);
    const filled = stars.filter((s) => s.className.includes("#f59e0b"));
    expect(filled.length).toBe(3);
  });

  test("unfilled stars have the grey color class", () => {
    const { container } = render(<RatingStars rating={2} />);
    const topSpan = container.querySelector("span");
    const stars = Array.from(topSpan?.querySelectorAll(":scope > span") || []);
    const unfilled = stars.filter((s) => s.className.includes("#e5e5e3"));
    expect(unfilled.length).toBe(3);
  });

  test("interactive mode calls onRate with correct star number", () => {
    const onRate = mock(() => {});
    const { container } = render(<RatingStars rating={2} interactive onRate={onRate} />);
    const topSpan = container.querySelector("span");
    const stars = topSpan?.querySelectorAll(":scope > span");
    fireEvent.click(stars![3]); // 4th star (0-indexed) => rating 4
    expect(onRate).toHaveBeenCalledWith(4);
  });

  test("non-interactive mode does not call onRate on click", () => {
    const onRate = mock(() => {});
    const { container } = render(<RatingStars rating={2} onRate={onRate} />);
    const topSpan = container.querySelector("span");
    const stars = topSpan?.querySelectorAll(":scope > span");
    fireEvent.click(stars![3]);
    expect(onRate).not.toHaveBeenCalled();
  });

  test("interactive stars have cursor-pointer class", () => {
    const { container } = render(<RatingStars rating={2} interactive />);
    const topSpan = container.querySelector("span");
    const stars = topSpan?.querySelectorAll(":scope > span");
    expect(stars![0].className).toContain("cursor-pointer");
  });

  test("non-interactive stars do not have cursor-pointer class", () => {
    const { container } = render(<RatingStars rating={2} />);
    const topSpan = container.querySelector("span");
    const stars = topSpan?.querySelectorAll(":scope > span");
    expect(stars![0].className).not.toContain("cursor-pointer");
  });

  test("size sm uses text-xs class", () => {
    const { container } = render(<RatingStars rating={3} size="sm" />);
    const topSpan = container.querySelector("span");
    expect(topSpan?.className).toContain("text-xs");
  });

  test("size md uses text-base class", () => {
    const { container } = render(<RatingStars rating={3} size="md" />);
    const topSpan = container.querySelector("span");
    expect(topSpan?.className).toContain("text-base");
  });
});
