"use client";

import type { FormEvent } from "react";
import { useState } from "react";

const contactInfo = [
  {
    label: "Email",
    value: "hello@codezero2pi.com",
    href: "mailto:hello@codezero2pi.com",
  },
  {
    label: "Phone (US)",
    value: "+1-866-882-7737",
    href: "tel:+18668827737",
  },
  {
    label: "Phone (India)",
    value: "+91-991-007-6367",
    href: "tel:+919910076367",
  },
];

const offices = [
  {
    city: "Post Falls, Idaho",
    country: "USA",
    address: "2785 W Seltice Way, Post Falls, ID 83854",
  },
  {
    city: "Noida",
    country: "India",
    address: "Noida, Uttar Pradesh",
  },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // In production, wire this to an API endpoint or form service
    setSubmitted(true);
  }

  return (
    <div className="pt-24">
      <section className="section-padding">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16">
            <p className="font-mono text-sm text-brand-purple mb-3">
              // contact
            </p>
            <h1 className="font-display text-4xl font-bold md:text-5xl max-w-3xl">
              Let&apos;s build something{" "}
              <span className="gradient-text">intelligent</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-brand-text-secondary">
              Tell us what you&apos;re trying to solve. No pitch deck, no sales
              funnel — just a straight conversation about your business and how
              AI can help.
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-5 lg:gap-16">
            {/* Form */}
            <div className="lg:col-span-3">
              {submitted ? (
                <div className="rounded-xl border border-brand-green/30 bg-brand-green/5 p-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-green/10">
                    <svg
                      className="h-8 w-8 text-brand-green"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M9 12l2 2 4-4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </div>
                  <h2 className="font-display text-xl font-semibold mb-2">
                    Message sent
                  </h2>
                  <p className="text-brand-text-secondary">
                    We&apos;ll get back to you within 24 hours. Looking forward to
                    the conversation.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm text-brand-text-secondary mb-2"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        className="w-full rounded-lg border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-text placeholder-brand-text-muted outline-none transition-colors focus:border-brand-purple"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm text-brand-text-secondary mb-2"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        className="w-full rounded-lg border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-text placeholder-brand-text-muted outline-none transition-colors focus:border-brand-purple"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="company"
                      className="block text-sm text-brand-text-secondary mb-2"
                    >
                      Company
                    </label>
                    <input
                      id="company"
                      name="company"
                      type="text"
                      className="w-full rounded-lg border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-text placeholder-brand-text-muted outline-none transition-colors focus:border-brand-purple"
                      placeholder="Your company"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="interest"
                      className="block text-sm text-brand-text-secondary mb-2"
                    >
                      What are you interested in?
                    </label>
                    <select
                      id="interest"
                      name="interest"
                      className="w-full rounded-lg border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-text outline-none transition-colors focus:border-brand-purple"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select a service
                      </option>
                      <option value="agents">AI Agent Development</option>
                      <option value="software">
                        Custom Software Engineering
                      </option>
                      <option value="automation">
                        Automation & Integration
                      </option>
                      <option value="strategy">
                        AI Strategy & Consulting
                      </option>
                      <option value="other">Something else</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm text-brand-text-secondary mb-2"
                    >
                      Tell us about your project
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={5}
                      required
                      className="w-full rounded-lg border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-text placeholder-brand-text-muted outline-none transition-colors focus:border-brand-purple resize-none"
                      placeholder="What are you trying to automate? What problems are you facing? Any timeline constraints?"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary px-8 py-4 text-sm font-medium text-white transition-all duration-300"
                  >
                    Send Message &rarr;
                  </button>
                </form>
              )}
            </div>

            {/* Sidebar info */}
            <div className="lg:col-span-2 space-y-8">
              {/* Contact details */}
              <div className="card rounded-xl border border-brand-border p-6">
                <h3 className="font-display text-base font-semibold mb-4">
                  Contact Details
                </h3>
                <ul className="space-y-4">
                  {contactInfo.map((item) => (
                    <li key={item.label}>
                      <span className="block text-xs text-brand-text-muted mb-1">
                        {item.label}
                      </span>
                      <a
                        href={item.href}
                        className="text-sm text-brand-text-secondary hover:text-brand-purple transition-colors"
                      >
                        {item.value}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Offices */}
              <div className="card rounded-xl border border-brand-border p-6">
                <h3 className="font-display text-base font-semibold mb-4">
                  Offices
                </h3>
                <ul className="space-y-4">
                  {offices.map((office) => (
                    <li key={office.city}>
                      <span className="block text-sm font-medium text-brand-text-secondary">
                        {office.city}
                      </span>
                      <span className="text-xs text-brand-text-muted">
                        {office.address}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Response time */}
              <div className="rounded-xl border border-brand-purple/20 bg-brand-purple/5 p-6">
                <p className="text-sm text-brand-text-secondary">
                  <span className="font-semibold text-brand-purple">
                    Average response time:
                  </span>{" "}
                  under 24 hours. For urgent projects, call us directly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
