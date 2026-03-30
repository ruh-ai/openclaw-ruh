import { describe, expect, test, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { InstallButton } from "../InstallButton";

describe("InstallButton", () => {
  test("shows 'Install Agent' when not installed", () => {
    const { getByText } = render(
      <InstallButton installed={false} onInstall={() => {}} onUninstall={() => {}} />,
    );
    expect(getByText("Install Agent")).toBeTruthy();
  });

  test("shows 'Uninstall' when installed", () => {
    const { getByText } = render(
      <InstallButton installed={true} onInstall={() => {}} onUninstall={() => {}} />,
    );
    expect(getByText("Uninstall")).toBeTruthy();
  });

  test("shows 'Installing...' when loading and not installed", () => {
    const { getByText } = render(
      <InstallButton installed={false} loading onInstall={() => {}} onUninstall={() => {}} />,
    );
    expect(getByText("Installing...")).toBeTruthy();
  });

  test("shows '...' when loading and installed", () => {
    const { getByText } = render(
      <InstallButton installed={true} loading onInstall={() => {}} onUninstall={() => {}} />,
    );
    expect(getByText("...")).toBeTruthy();
  });

  test("calls onInstall when clicking install button", () => {
    const onInstall = mock(() => {});
    const { getByText } = render(
      <InstallButton installed={false} onInstall={onInstall} onUninstall={() => {}} />,
    );
    fireEvent.click(getByText("Install Agent"));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  test("calls onUninstall when clicking uninstall button", () => {
    const onUninstall = mock(() => {});
    const { getByText } = render(
      <InstallButton installed={true} onInstall={() => {}} onUninstall={onUninstall} />,
    );
    fireEvent.click(getByText("Uninstall"));
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });

  test("install button is disabled when loading", () => {
    const { getByText } = render(
      <InstallButton installed={false} loading onInstall={() => {}} onUninstall={() => {}} />,
    );
    const btn = getByText("Installing...").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test("uninstall button is disabled when loading", () => {
    const { getByText } = render(
      <InstallButton installed={true} loading onInstall={() => {}} onUninstall={() => {}} />,
    );
    const btn = getByText("...").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test("install button is not disabled when not loading", () => {
    const { getByText } = render(
      <InstallButton installed={false} onInstall={() => {}} onUninstall={() => {}} />,
    );
    const btn = getByText("Install Agent").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
