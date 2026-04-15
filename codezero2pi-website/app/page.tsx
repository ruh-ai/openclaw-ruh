import Hero from "@/components/home/Hero";
import Services from "@/components/home/Services";
import Stats from "@/components/home/Stats";
import Process from "@/components/home/Process";
import Capabilities from "@/components/home/Capabilities";
import Clients from "@/components/home/Clients";
import CTA from "@/components/home/CTA";

export default function Home() {
  return (
    <>
      <Hero />
      <Clients />
      <Services />
      <Stats />
      <Process />
      <Capabilities />
      <CTA />
    </>
  );
}
