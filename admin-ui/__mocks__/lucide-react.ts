/**
 * Mock for lucide-react — bun:test cannot resolve barrel re-exports of default
 * exports (`export { default as Foo } from './icons/foo.js'`). This mock returns
 * a simple span stub for every icon component name.
 */
import React from "react";

function makeIcon(name: string) {
  const Icon = (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": `icon-${name}`, ...props });
  Icon.displayName = name;
  return Icon;
}

// All icons used in admin-ui source files
export const Activity = makeIcon("Activity");
export const ArrowUpRight = makeIcon("ArrowUpRight");
export const Bot = makeIcon("Bot");
export const Building2 = makeIcon("Building2");
export const Cable = makeIcon("Cable");
export const ChevronDown = makeIcon("ChevronDown");
export const ChevronRight = makeIcon("ChevronRight");
export const Clock = makeIcon("Clock");
export const DatabaseZap = makeIcon("DatabaseZap");
export const Eye = makeIcon("Eye");
export const FileText = makeIcon("FileText");
export const Hammer = makeIcon("Hammer");
export const LayoutDashboard = makeIcon("LayoutDashboard");
export const LogOut = makeIcon("LogOut");
export const Menu = makeIcon("Menu");
export const Server = makeIcon("Server");
export const Settings = makeIcon("Settings");
export const Shield = makeIcon("Shield");
export const ShieldCheck = makeIcon("ShieldCheck");
export const Store = makeIcon("Store");
export const TriangleAlert = makeIcon("TriangleAlert");
export const TrendingUp = makeIcon("TrendingUp");
export const Users = makeIcon("Users");
export const Waypoints = makeIcon("Waypoints");
export const X = makeIcon("X");

// Catch-all: return a stub for any other icon accessed via destructuring
const handler: ProxyHandler<Record<string, unknown>> = {
  get(target, prop) {
    if (typeof prop === "string" && prop in target) return target[prop];
    if (typeof prop === "string" && /^[A-Z]/.test(prop)) return makeIcon(prop);
    return undefined;
  },
};

// Re-export everything through a proxy so unknown icons still work
const allExports = {
  Activity, ArrowUpRight, Bot, Building2, Cable, ChevronDown, ChevronRight,
  Clock, DatabaseZap, Eye, FileText, Hammer, LayoutDashboard, LogOut, Menu,
  Server, Settings, Shield, ShieldCheck, Store, TriangleAlert, TrendingUp,
  Users, Waypoints, X,
};

export default new Proxy(allExports, handler);
