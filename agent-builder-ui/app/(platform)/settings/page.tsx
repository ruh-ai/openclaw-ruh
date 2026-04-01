import Link from "next/link";
import { agentsRoute } from "@/shared/routes";

export default function SettingsPage() {
  return (
    <section className="flex h-full w-full items-center justify-center px-6 py-10">
      <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-secondary-font">
          Account
        </div>
        <h1 className="mt-3 text-2xl font-bold text-brand-primary-font">
          Account settings are not wired yet
        </h1>
        <p className="mt-3 text-sm leading-6 text-brand-secondary-font">
          The profile menu was routing to a missing settings page. This placeholder
          prevents broken navigation while the real account-management screen is still pending.
        </p>
        <div className="mt-6">
          <Link
            href={agentsRoute}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Back to Agents
          </Link>
        </div>
      </div>
    </section>
  );
}
