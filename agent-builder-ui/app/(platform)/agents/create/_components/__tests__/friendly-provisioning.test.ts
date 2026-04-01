import { describe, expect, test } from "bun:test";

/**
 * Mirrors the friendlyProvisioningStep function from page.tsx.
 * Testing the mapping logic to ensure provisioning logs render well.
 */
function friendlyProvisioningStep(line: string): string | null {
  const lower = line.toLowerCase();
  if (lower.includes("creating your agent")) return "Starting your agent's journey...";
  if (lower.includes("starting container")) return "Preparing a private workspace...";
  if (lower.includes("pulling")) return "Setting up the environment...";
  if (lower.includes("container started") || lower.includes("container '")) return "Workspace is ready...";
  if (lower.includes("installing openclaw")) return "Teaching your agent the basics...";
  if (lower.includes("openclaw installed")) return "Core skills installed...";
  if (lower.includes("browser") || lower.includes("vnc")) return "Adding visual abilities...";
  if (lower.includes("gateway")) return "Opening communication channels...";
  if (lower.includes("architect") || lower.includes("soul")) return "Awakening the Architect...";
  if (lower.includes("ready") || lower.includes("opening chat")) return "Your agent is coming to life...";
  if (lower.includes("forwarding")) return null;
  return null;
}

describe("friendlyProvisioningStep", () => {
  test("maps raw Docker log to friendly message", () => {
    expect(friendlyProvisioningStep("Creating your agent...")).toBe("Starting your agent's journey...");
    expect(friendlyProvisioningStep("Starting container 'forge-google-ads'...")).toBe("Preparing a private workspace...");
    expect(friendlyProvisioningStep("Pulling node:22-bookworm image")).toBe("Setting up the environment...");
    expect(friendlyProvisioningStep("Container started: openclaw-abc")).toBe("Workspace is ready...");
    expect(friendlyProvisioningStep("Installing OpenClaw (npm install -g openclaw@latest)...")).toBe("Teaching your agent the basics...");
    expect(friendlyProvisioningStep("OpenClaw installed: v4.2.1")).toBe("Core skills installed...");
    expect(friendlyProvisioningStep("Installing browser & VNC stack")).toBe("Adding visual abilities...");
    expect(friendlyProvisioningStep("Gateway will be accessible at http://localhost:32769")).toBe("Opening communication channels...");
    expect(friendlyProvisioningStep("Injecting Architect SOUL.md")).toBe("Awakening the Architect...");
    expect(friendlyProvisioningStep("Agent workspace ready — opening chat...")).toBe("Your agent is coming to life...");
  });

  test("hides noisy env var forwarding lines", () => {
    expect(friendlyProvisioningStep("Forwarding OPENROUTER_API_KEY into container")).toBeNull();
    expect(friendlyProvisioningStep("Forwarding ANTHROPIC_API_KEY into container")).toBeNull();
  });

  test("returns null for unrecognized lines", () => {
    expect(friendlyProvisioningStep("apt-get update -qq")).toBeNull();
    expect(friendlyProvisioningStep("npm warn deprecated")).toBeNull();
  });
});
