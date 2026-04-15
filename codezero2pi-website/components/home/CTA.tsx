import Link from "next/link";
import ScrollReveal from "@/components/ui/ScrollReveal";

export default function CTA() {
  return (
    <section className="section-padding">
      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <div className="relative rounded-3xl overflow-hidden bg-brand-gradient p-[1px]">
            <div className="rounded-3xl bg-white px-8 py-16 md:px-16 md:py-20 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-brand-gradient-soft opacity-50" />
              <div className="relative">
                <p className="font-mono text-sm text-brand-purple mb-4">// let&apos;s go</p>
                <h2 className="font-display text-3xl font-bold md:text-4xl mb-4">
                  Tell us the <span className="gradient-text">impossible thing</span> you want built
                </h2>
                <p className="mx-auto max-w-xl text-brand-text-secondary mb-4">
                  The thing your CTO said would take a year. The agent that doesn&apos;t exist yet. The system that
                  should be smarter than it is.
                </p>
                <p className="mx-auto max-w-xl text-brand-text-secondary mb-10">
                  <strong className="text-brand-text">We&apos;ll have a working prototype before your next board meeting.</strong>
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Link href="/contact" className="btn-primary group px-8 py-4 text-sm">
                    Dream It With Us
                    <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
                  </Link>
                  <Link href="/about" className="btn-secondary px-8 py-4 text-sm">
                    See How We Do It
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
