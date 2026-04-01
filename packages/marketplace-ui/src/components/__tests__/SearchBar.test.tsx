import { describe, expect, test, mock } from "bun:test";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar } from "../SearchBar";

describe("SearchBar", () => {
  test("renders with default placeholder", () => {
    const { getByPlaceholderText } = render(<SearchBar value="" onChange={() => {}} />);
    expect(getByPlaceholderText("Search agents...")).toBeTruthy();
  });

  test("renders with custom placeholder", () => {
    const { getByPlaceholderText } = render(
      <SearchBar value="" onChange={() => {}} placeholder="Find something..." />,
    );
    expect(getByPlaceholderText("Find something...")).toBeTruthy();
  });

  test("calls onChange when user types", async () => {
    const onChange = mock(() => {});
    const user = userEvent.setup();
    const { getByPlaceholderText } = render(<SearchBar value="" onChange={onChange} />);
    const input = getByPlaceholderText("Search agents...");
    await user.type(input, "a");
    expect(onChange).toHaveBeenCalled();
  });

  test("displays current value in input", () => {
    const { getByPlaceholderText } = render(<SearchBar value="hello" onChange={() => {}} />);
    const input = getByPlaceholderText("Search agents...") as HTMLInputElement;
    expect(input.value).toBe("hello");
  });

  test("renders as a text input", () => {
    const { getByPlaceholderText } = render(<SearchBar value="" onChange={() => {}} />);
    const input = getByPlaceholderText("Search agents...") as HTMLInputElement;
    expect(input.type).toBe("text");
  });
});
