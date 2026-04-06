/**
 * Shared lucide-react mock for bun:test.
 *
 * bun 1.3.x cannot statically analyze the CJS named exports of
 * lucide-react's large barrel file (~26K lines, 1600+ exports).
 * Every test file that imports a component using lucide-react must
 * call `mock.module("lucide-react", () => lucideMock)` BEFORE
 * any dynamic import of that component.
 */
import { createElement, forwardRef } from "react";

const IconStub = forwardRef<SVGSVGElement, Record<string, unknown>>(
  (props, ref) => createElement("svg", { ref, ...props }),
);
IconStub.displayName = "LucideIconStub";

// Every icon name imported across admin-ui source files.
// When adding new lucide icons to source code, add the name here too.
const lucideMock: Record<string, unknown> = {
  // layout.tsx
  Activity: IconStub,
  Bot: IconStub,
  Boxes: IconStub,
  CreditCard: IconStub,
  LayoutDashboard: IconStub,
  LogOut: IconStub,
  ScrollText: IconStub,
  Store: IconStub,
  Users: IconStub,
  Waypoints: IconStub,
  // _components/AdminPrimitives.tsx
  ArrowUpRight: IconStub,
  // dashboard/page.tsx
  AlertTriangle: IconStub,
  // agents/page.tsx
  Cable: IconStub,
  Hammer: IconStub,
  // system/page.tsx
  Server: IconStub,
  ShieldCheck: IconStub,
  // runtime/page.tsx
  DatabaseZap: IconStub,
  TriangleAlert: IconStub,
  // users/page.tsx
  CheckCircle2: IconStub,
  Shield: IconStub,
  UserCog: IconStub,
  // marketplace/page.tsx
  BookmarkCheck: IconStub,
  Rocket: IconStub,
  Tags: IconStub,
  // audit/page.tsx
  ShieldAlert: IconStub,
  Target: IconStub,
  UserRound: IconStub,
  // login/page.tsx
  ArrowRight: IconStub,
  Sparkles: IconStub,
  // organizations/page.tsx
  Briefcase: IconStub,
  Building2: IconStub,
  Wallet: IconStub,
  // organizations/[id]/page.tsx
  ArrowLeft: IconStub,
  RefreshCw: IconStub,
  Trash2: IconStub,
  UserPlus: IconStub,
  // organizations/[id]/billing/page.tsx
  Clock3: IconStub,
  Receipt: IconStub,
  ShieldX: IconStub,
};

export default lucideMock;
