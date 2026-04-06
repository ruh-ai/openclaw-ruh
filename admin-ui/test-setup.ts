import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, mock } from "bun:test";
import { cleanup } from "@testing-library/react";
import { createElement, forwardRef } from "react";

GlobalRegistrator.register();

// Mock lucide-react using an inline factory so it works across all bun
// versions regardless of ESM/CJS resolution. Using require() in the factory
// is unreliable when bun resolves modules in strict ESM mode on CI.
const IconStub = forwardRef<SVGSVGElement, Record<string, unknown>>(
  (props, ref) => createElement("svg", { ref, ...props }),
);
IconStub.displayName = "LucideIconStub";

const _lucideIcons: Record<string, unknown> = {
  Activity: IconStub,
  AlertTriangle: IconStub,
  ArrowLeft: IconStub,
  ArrowRight: IconStub,
  ArrowUpRight: IconStub,
  BookmarkCheck: IconStub,
  Bot: IconStub,
  Boxes: IconStub,
  Briefcase: IconStub,
  Building2: IconStub,
  Cable: IconStub,
  CheckCircle2: IconStub,
  ChevronDown: IconStub,
  ChevronRight: IconStub,
  Clock: IconStub,
  Clock3: IconStub,
  CreditCard: IconStub,
  DatabaseZap: IconStub,
  Eye: IconStub,
  FileText: IconStub,
  Hammer: IconStub,
  LayoutDashboard: IconStub,
  LogOut: IconStub,
  Menu: IconStub,
  Receipt: IconStub,
  RefreshCw: IconStub,
  Rocket: IconStub,
  ScrollText: IconStub,
  Server: IconStub,
  Settings: IconStub,
  Shield: IconStub,
  ShieldAlert: IconStub,
  ShieldCheck: IconStub,
  ShieldX: IconStub,
  Sparkles: IconStub,
  Store: IconStub,
  Tags: IconStub,
  Target: IconStub,
  Trash2: IconStub,
  TriangleAlert: IconStub,
  TrendingUp: IconStub,
  UserCog: IconStub,
  UserPlus: IconStub,
  UserRound: IconStub,
  Users: IconStub,
  Wallet: IconStub,
  Waypoints: IconStub,
  X: IconStub,
};

// Proxy catches any icon name not explicitly listed above.
const _lucideProxy = new Proxy(_lucideIcons, {
  get(target, prop) {
    if (typeof prop === "string" && prop in target) return target[prop];
    if (typeof prop === "string" && /^[A-Z]/.test(prop)) return IconStub;
    return undefined;
  },
});

mock.module("lucide-react", () => _lucideProxy);

// Mock next/navigation so components that call redirect(), useRouter(), etc.
// do not blow up during preload. Individual test files may override this with
// their own mock.module() call (those run before the dynamic import of the
// component under test, so they win).
mock.module("next/navigation", () => ({
  redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); },
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Provide localStorage for tests that use it
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

afterEach(() => {
  cleanup();
});
