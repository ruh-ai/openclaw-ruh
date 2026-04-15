import Link from "next/link";
import Logo from "@/components/ui/Logo";

const footerLinks = {
  Company: [
    { href: "/about", label: "About" },
    { href: "/services", label: "Services" },
    { href: "/contact", label: "Contact" },
  ],
  Services: [
    { href: "/services#agents", label: "AI Agents" },
    { href: "/services#software", label: "Custom Software" },
    { href: "/services#automation", label: "Automation" },
    { href: "/services#strategy", label: "AI Strategy" },
  ],
  Connect: [
    { href: "mailto:hello@codezero2pi.com", label: "hello@codezero2pi.com" },
    { href: "https://linkedin.com/company/rapidinnovation", label: "LinkedIn" },
    { href: "https://twitter.com/rapid_innovation", label: "X / Twitter" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-brand-border bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          <div>
            <Logo className="h-7" />
            <p className="mt-4 text-sm text-brand-text-muted leading-relaxed max-w-xs">
              From zero to intelligent. We build AI agents and software that transform how businesses operate.
            </p>
          </div>
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-medium text-brand-text mb-4">{title}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-brand-text-muted hover:text-brand-purple transition-colors duration-300">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-brand-border pt-8">
          <p className="text-xs text-brand-text-muted">&copy; {new Date().getFullYear()} CodeZero2Pi. All rights reserved.</p>
          <p className="text-xs text-brand-text-muted">
            A{" "}
            <a href="https://rapidinnovation.io" target="_blank" rel="noopener noreferrer" className="text-brand-text-secondary hover:text-brand-purple transition-colors">Rapid Innovation</a>
            {" & "}
            <a href="https://ruh.ai" target="_blank" rel="noopener noreferrer" className="text-brand-text-secondary hover:text-brand-purple transition-colors">Ruh.ai</a>
            {" company"}
          </p>
        </div>
      </div>
    </footer>
  );
}
