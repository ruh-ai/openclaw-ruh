import { describe, expect, test, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { CategoryFilter } from "../CategoryFilter";
import { MARKETPLACE_CATEGORIES } from "../../types";

describe("CategoryFilter", () => {
  test("renders All button plus all category buttons", () => {
    const onChange = mock(() => {});
    const { getByText } = render(<CategoryFilter selected="" onChange={onChange} />);
    expect(getByText("All")).toBeTruthy();
    expect(getByText("Marketing")).toBeTruthy();
    expect(getByText("Engineering")).toBeTruthy();
    expect(getByText("Support")).toBeTruthy();
    expect(getByText("Sales")).toBeTruthy();
    expect(getByText("Data")).toBeTruthy();
    expect(getByText("Finance")).toBeTruthy();
    expect(getByText("HR")).toBeTruthy();
    expect(getByText("Operations")).toBeTruthy();
    expect(getByText("Custom")).toBeTruthy();
    expect(getByText("General")).toBeTruthy();
  });

  test("renders correct total button count", () => {
    const onChange = mock(() => {});
    const { container } = render(<CategoryFilter selected="" onChange={onChange} />);
    const buttons = container.querySelectorAll("button");
    // 1 "All" + 10 categories
    expect(buttons.length).toBe(1 + MARKETPLACE_CATEGORIES.length);
  });

  test("highlights selected category with primary bg color", () => {
    const onChange = mock(() => {});
    const { getByText } = render(<CategoryFilter selected="marketing" onChange={onChange} />);
    const marketingBtn = getByText("Marketing");
    expect(marketingBtn.className).toContain("bg-[#ae00d0]");
  });

  test("All button is not highlighted when a category is selected", () => {
    const onChange = mock(() => {});
    const { getByText } = render(<CategoryFilter selected="marketing" onChange={onChange} />);
    const allBtn = getByText("All");
    expect(allBtn.className).not.toContain("bg-[#ae00d0] text-white");
  });

  test("All button is highlighted when selected is empty", () => {
    const onChange = mock(() => {});
    const { getByText } = render(<CategoryFilter selected="" onChange={onChange} />);
    const allBtn = getByText("All");
    expect(allBtn.className).toContain("bg-[#ae00d0]");
  });

  test("calls onChange with category key when clicking a category", () => {
    const onChange = mock(() => {});
    const { getByText } = render(<CategoryFilter selected="" onChange={onChange} />);
    fireEvent.click(getByText("Sales"));
    expect(onChange).toHaveBeenCalledWith("sales");
  });

  test("calls onChange with empty string when clicking All", () => {
    const onChange = mock(() => {});
    const { getByText } = render(<CategoryFilter selected="marketing" onChange={onChange} />);
    fireEvent.click(getByText("All"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
