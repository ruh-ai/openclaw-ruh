"use client";

import { useState, useEffect } from "react";
import { AnimatedRuhLogo } from "./AnimatedRuhLogo";

/**
 * Animated explainer: 20 scenes covering the full Ruh agent builder experience.
 * Ruh logo serves as a breathing transition between each scene.
 * At 3.5s/scene + 1.2s/transition ≈ 94s before first repeat — covers most provisioning waits.
 */

const SCENE_DURATION = 3500;
const TRANSITION_DURATION = 1200;

interface Scene {
  title: string;
  subtitle: string;
  render: () => React.ReactNode;
}

// ─── Shared SVG building blocks ─────────────────────────────────────────────

const G = { purple: "#ae00d0", violet: "#7b5aff", blue: "#8422f7", bg: "#f9f7f9", card: "#ffffff", border: "#e2e2e2", text: "#121212", muted: "#827f82", green: "#22c55e", faintPurple: "#fdf4ff" };

function WindowFrame({ children }: { children: React.ReactNode }) {
  return (
    <g>
      <rect x="15" y="8" width="170" height="124" rx="10" fill={G.bg} stroke={G.border} strokeWidth="1.2" />
      <circle cx="30" cy="20" r="2.5" fill="#e5e7eb" />
      <circle cx="38" cy="20" r="2.5" fill="#e5e7eb" />
      <circle cx="46" cy="20" r="2.5" fill="#e5e7eb" />
      {children}
    </g>
  );
}

function FadeIn({ begin, children, y }: { begin: string; children: React.ReactNode; y?: number }) {
  return (
    <g opacity="0">
      <animate attributeName="opacity" values="0;1" dur="0.4s" begin={begin} fill="freeze" />
      {y !== undefined && (
        <animateTransform attributeName="transform" type="translate" values={`0,${y + 10};0,${y}`} dur="0.4s" begin={begin} fill="freeze" />
      )}
      {children}
    </g>
  );
}

function GradDef({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor={G.purple} />
      <stop offset="100%" stopColor={G.blue} />
    </linearGradient>
  );
}

function Wrap({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <svg viewBox="0 0 200 140" width="200" height="140">
      <defs><GradDef id={id} /></defs>
      {children}
    </svg>
  );
}

// ─── 20 Scene renderers ─────────────────────────────────────────────────────

function S01_Describe() {
  return (
    <Wrap id="s01">
      <WindowFrame>
        {/* User message */}
        <FadeIn begin="0.3s">
          <rect x="55" y="38" width="118" height="20" rx="8" fill={G.purple} opacity="0.9" />
          <rect x="63" y="45" width="60" height="3" rx="1.5" fill="white" opacity="0.6" />
          <rect x="63" y="51" width="40" height="3" rx="1.5" fill="white" opacity="0.4" />
        </FadeIn>
        {/* Agent reply */}
        <FadeIn begin="1s">
          <circle cx="32" cy="78" r="7" fill={`url(#s01)`} />
          <rect x="44" y="68" width="128" height="26" rx="8" fill="white" stroke={G.border} strokeWidth="0.8" />
          <rect x="52" y="75" width="80" height="3" rx="1.5" fill={G.purple} opacity="0.15" />
          <rect x="52" y="82" width="100" height="3" rx="1.5" fill={G.purple} opacity="0.1" />
          <rect x="52" y="89" width="55" height="3" rx="1.5" fill={G.purple} opacity="0.08" />
        </FadeIn>
        {/* Typing indicator */}
        <FadeIn begin="2s">
          <circle cx="52" cy="108" r="2" fill={G.purple} opacity="0.3"><animate attributeName="opacity" values="0.2;0.6;0.2" dur="0.8s" repeatCount="indefinite" /></circle>
          <circle cx="60" cy="108" r="2" fill={G.purple} opacity="0.3"><animate attributeName="opacity" values="0.2;0.6;0.2" dur="0.8s" begin="0.15s" repeatCount="indefinite" /></circle>
          <circle cx="68" cy="108" r="2" fill={G.purple} opacity="0.3"><animate attributeName="opacity" values="0.2;0.6;0.2" dur="0.8s" begin="0.3s" repeatCount="indefinite" /></circle>
        </FadeIn>
      </WindowFrame>
    </Wrap>
  );
}

function S02_Soul() {
  return (
    <Wrap id="s02">
      {/* Centered soul card */}
      <FadeIn begin="0.2s">
        <rect x="35" y="15" width="130" height="110" rx="12" fill="white" stroke={G.purple} strokeWidth="1.2" strokeOpacity="0.25" />
      </FadeIn>
      <FadeIn begin="0.5s">
        <circle cx="100" cy="42" r="14" fill={`url(#s02)`} />
        <text x="100" y="46" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold">S</text>
      </FadeIn>
      <FadeIn begin="0.9s">
        <text x="100" y="68" textAnchor="middle" fontSize="9" fontFamily="monospace" fill={G.text} fontWeight="bold">SOUL.md</text>
      </FadeIn>
      <FadeIn begin="1.2s">
        <rect x="55" y="78" width="90" height="3" rx="1.5" fill={G.purple} opacity="0.12" />
        <rect x="60" y="85" width="80" height="3" rx="1.5" fill={G.purple} opacity="0.08" />
        <rect x="65" y="92" width="70" height="3" rx="1.5" fill={G.purple} opacity="0.06" />
      </FadeIn>
      {/* Pulse ring */}
      <circle cx="100" cy="42" r="14" fill="none" stroke={G.purple} strokeWidth="1" opacity="0">
        <animate attributeName="r" values="14;28" dur="2s" begin="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0" dur="2s" begin="1.5s" repeatCount="indefinite" />
      </circle>
    </Wrap>
  );
}

function S03_Architect() {
  return (
    <Wrap id="s03">
      {/* Folder tree */}
      <FadeIn begin="0.2s">
        <rect x="25" y="12" width="150" height="116" rx="10" fill={G.faintPurple} stroke={G.purple} strokeWidth="0.8" strokeOpacity="0.15" />
        <text x="36" y="28" fontSize="7" fontFamily="monospace" fill={G.purple} opacity="0.5">~/.openclaw/workspace</text>
      </FadeIn>
      {/* Files sliding in */}
      {[
        { name: "SOUL.md", y: 40, begin: "0.6s", badge: "soul" },
        { name: "skills/campaign-optimizer/", y: 58, begin: "1s" },
        { name: "skills/report-generator/", y: 76, begin: "1.4s" },
        { name: "tools/google-ads.json", y: 94, begin: "1.8s" },
        { name: "triggers/schedule.json", y: 112, begin: "2.2s" },
      ].map((f) => (
        <g key={f.name} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin={f.begin} fill="freeze" />
          <animateTransform attributeName="transform" type="translate" values={`10,0;0,0`} dur="0.35s" begin={f.begin} fill="freeze" />
          <rect x="36" y={f.y} width="128" height="14" rx="4" fill="white" stroke={G.border} strokeWidth="0.6" />
          <text x="46" y={f.y + 10} fontSize="7" fontFamily="monospace" fill={G.text}>{f.name}</text>
          {f.badge && <text x="140" y={f.y + 10} fontSize="5" fill={G.purple} opacity="0.5">{f.badge}</text>}
        </g>
      ))}
    </Wrap>
  );
}

function S04_Skills() {
  return (
    <Wrap id="s04">
      {/* 3 skill cards in a grid */}
      {[
        { x: 15, label: "Campaign\nOptimizer", icon: "📊", begin: "0.3s" },
        { x: 75, label: "Report\nGenerator", icon: "📋", begin: "0.7s" },
        { x: 135, label: "Budget\nManager", icon: "💰", begin: "1.1s" },
      ].map((s) => (
        <g key={s.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.4s" begin={s.begin} fill="freeze" />
          <animateTransform attributeName="transform" type="scale" values="0.9;1" dur="0.4s" begin={s.begin} fill="freeze" />
          <rect x={s.x} y="20" width="50" height="70" rx="8" fill="white" stroke={G.border} strokeWidth="1" />
          <text x={s.x + 25} y="50" textAnchor="middle" fontSize="18">{s.icon}</text>
          <text x={s.x + 25} y="72" textAnchor="middle" fontSize="6" fill={G.text} fontFamily="sans-serif">
            {s.label.split("\n").map((l, i) => <tspan key={i} x={s.x + 25} dy={i === 0 ? 0 : 9}>{l}</tspan>)}
          </text>
        </g>
      ))}
      {/* Connection lines */}
      <FadeIn begin="1.5s">
        <line x1="65" y1="55" x2="75" y2="55" stroke={G.purple} strokeWidth="1.5" strokeDasharray="3,2" opacity="0.3" />
        <line x1="125" y1="55" x2="135" y2="55" stroke={G.purple} strokeWidth="1.5" strokeDasharray="3,2" opacity="0.3" />
      </FadeIn>
      {/* "Modular" label */}
      <FadeIn begin="2s">
        <rect x="55" y="102" width="90" height="20" rx="10" fill={G.purple} opacity="0.08" />
        <text x="100" y="115" textAnchor="middle" fontSize="7" fill={G.purple} opacity="0.6" fontFamily="sans-serif">Modular Skills</text>
      </FadeIn>
    </Wrap>
  );
}

function S05_Tools() {
  return (
    <Wrap id="s05">
      {/* Central hub */}
      <circle cx="100" cy="70" r="18" fill={`url(#s05)`} opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.2s" fill="freeze" />
      </circle>
      <text x="100" y="74" textAnchor="middle" fontSize="12" fill="white" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.4s" fill="freeze" />
        🔌
      </text>
      {/* Orbiting tool icons */}
      {[
        { angle: 0, icon: "📊", label: "Google Ads" },
        { angle: 60, icon: "💬", label: "Slack" },
        { angle: 120, icon: "📧", label: "Gmail" },
        { angle: 180, icon: "🗄️", label: "Database" },
        { angle: 240, icon: "📁", label: "Drive" },
        { angle: 300, icon: "🔗", label: "Webhooks" },
      ].map((t, i) => {
        const rad = (t.angle * Math.PI) / 180;
        const x = 100 + Math.cos(rad) * 50;
        const y = 70 + Math.sin(rad) * 45;
        const begin = `${0.5 + i * 0.2}s`;
        return (
          <g key={t.label} opacity="0">
            <animate attributeName="opacity" values="0;1" dur="0.35s" begin={begin} fill="freeze" />
            <circle cx={x} cy={y} r="14" fill="white" stroke={G.border} strokeWidth="0.8" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="10">{t.icon}</text>
            {/* Connection line */}
            <line x1={100 + Math.cos(rad) * 18} y1={70 + Math.sin(rad) * 16} x2={x - Math.cos(rad) * 14} y2={y - Math.sin(rad) * 12} stroke={G.purple} strokeWidth="0.8" strokeDasharray="2,2" opacity="0.2" />
          </g>
        );
      })}
    </Wrap>
  );
}

function S06_Test() {
  return (
    <Wrap id="s06">
      {/* Split view */}
      <rect x="12" y="12" width="82" height="116" rx="8" fill={G.bg} stroke={G.border} strokeWidth="1" />
      <rect x="106" y="12" width="82" height="116" rx="8" fill={G.faintPurple} stroke={G.purple} strokeWidth="1" strokeOpacity="0.3" />
      <text x="34" y="28" fontSize="7" fill={G.muted} fontWeight="bold" fontFamily="sans-serif">BUILD</text>
      <text x="128" y="28" fontSize="7" fill={G.purple} fontWeight="bold" fontFamily="sans-serif">TEST</text>
      {/* Code lines on left */}
      {[38, 46, 54, 62, 70].map((y, i) => (
        <rect key={y} x="22" y={y} width={30 + (i % 3) * 15} height="3" rx="1.5" fill={G.purple} opacity={0.06 + i * 0.02} />
      ))}
      {/* Chat in test */}
      <FadeIn begin="0.5s"><rect x="114" y="38" width="60" height="12" rx="5" fill={G.purple} opacity="0.12" /></FadeIn>
      <FadeIn begin="1s"><rect x="114" y="56" width="66" height="16" rx="5" fill="white" stroke={G.border} strokeWidth="0.5" /></FadeIn>
      <FadeIn begin="1.5s"><rect x="114" y="78" width="52" height="12" rx="5" fill={G.purple} opacity="0.12" /></FadeIn>
      <FadeIn begin="2s"><rect x="114" y="96" width="58" height="16" rx="5" fill="white" stroke={G.border} strokeWidth="0.5" /></FadeIn>
      {/* Toggle */}
      <rect x="85" y="122" width="30" height="14" rx="7" fill={G.purple} opacity="0.15" />
      <circle cx="93" cy="129" r="4.5" fill={G.purple}>
        <animate attributeName="cx" values="93;108" dur="0.5s" begin="0.3s" fill="freeze" />
      </circle>
    </Wrap>
  );
}

function S07_Ship() {
  return (
    <Wrap id="s07">
      <FadeIn begin="0.2s">
        <rect x="30" y="25" width="140" height="90" rx="10" fill="white" stroke={G.border} strokeWidth="1" />
        <circle cx="56" cy="50" r="10" fill={G.text} opacity="0.06" />
        <text x="56" y="54" textAnchor="middle" fontSize="12">🐙</text>
        <rect x="74" y="44" width="80" height="5" rx="2.5" fill={G.text} opacity="0.5" />
        <rect x="74" y="54" width="55" height="3" rx="1.5" fill={G.muted} opacity="0.3" />
      </FadeIn>
      {/* Files flying in */}
      {[0, 1, 2].map((i) => (
        <g key={i} opacity="0">
          <animate attributeName="opacity" values="0;0.6;0" dur="1.5s" begin={`${0.8 + i * 0.35}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values={`0,20;0,0`} dur="1.5s" begin={`${0.8 + i * 0.35}s`} repeatCount="indefinite" />
          <rect x={48 + i * 28} y="80" width="22" height="12" rx="4" fill={G.purple} opacity="0.15" />
          <text x={59 + i * 28} y="89" textAnchor="middle" fontSize="6" fill={G.purple} opacity="0.5">📄</text>
        </g>
      ))}
      <text x="168" y="38" fontSize="16" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.8s" fill="freeze" />
        <animateTransform attributeName="transform" type="translate" values="0,8;0,0" dur="0.8s" begin="1.8s" fill="freeze" />
        🚀
      </text>
    </Wrap>
  );
}

function S08_Container() {
  return (
    <Wrap id="s08">
      {/* Container box */}
      <FadeIn begin="0.2s">
        <rect x="35" y="18" width="130" height="105" rx="10" fill="white" stroke={G.violet} strokeWidth="1.2" strokeDasharray="4,3" />
        <text x="100" y="36" textAnchor="middle" fontSize="7" fontFamily="monospace" fill={G.violet} opacity="0.5">docker container</text>
      </FadeIn>
      {/* Inner workspace */}
      <FadeIn begin="0.6s">
        <rect x="48" y="44" width="104" height="68" rx="6" fill={G.faintPurple} />
        <text x="100" y="58" textAnchor="middle" fontSize="7" fontFamily="monospace" fill={G.purple} opacity="0.4">agent workspace</text>
      </FadeIn>
      {/* Files inside */}
      <FadeIn begin="1s"><rect x="56" y="66" width="88" height="10" rx="3" fill="white" /><text x="64" y="74" fontSize="6" fontFamily="monospace" fill={G.text}>SOUL.md</text></FadeIn>
      <FadeIn begin="1.4s"><rect x="56" y="80" width="88" height="10" rx="3" fill="white" /><text x="64" y="88" fontSize="6" fontFamily="monospace" fill={G.text}>skills/</text></FadeIn>
      <FadeIn begin="1.8s"><rect x="56" y="94" width="88" height="10" rx="3" fill="white" /><text x="64" y="102" fontSize="6" fontFamily="monospace" fill={G.text}>tools/</text></FadeIn>
      {/* Lock icon */}
      <FadeIn begin="2.2s">
        <text x="160" y="28" fontSize="10">🔒</text>
      </FadeIn>
    </Wrap>
  );
}

function S09_Memory() {
  return (
    <Wrap id="s09">
      <FadeIn begin="0.2s">
        <circle cx="100" cy="50" r="24" fill={`url(#s09)`} opacity="0.08" />
        <text x="100" y="55" textAnchor="middle" fontSize="20">🧠</text>
      </FadeIn>
      {/* Memory connections radiating out */}
      {[
        { x: 40, y: 90, label: "Past chats", begin: "0.6s" },
        { x: 100, y: 105, label: "Preferences", begin: "0.9s" },
        { x: 160, y: 90, label: "Context", begin: "1.2s" },
      ].map((m) => (
        <g key={m.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.4s" begin={m.begin} fill="freeze" />
          <line x1="100" y1="70" x2={m.x} y2={m.y - 8} stroke={G.purple} strokeWidth="1" strokeDasharray="2,2" opacity="0.2" />
          <rect x={m.x - 28} y={m.y - 8} width="56" height="16" rx="8" fill="white" stroke={G.border} strokeWidth="0.8" />
          <text x={m.x} y={m.y + 3} textAnchor="middle" fontSize="6" fill={G.text} fontFamily="sans-serif">{m.label}</text>
        </g>
      ))}
      <FadeIn begin="1.8s">
        <text x="100" y="132" textAnchor="middle" fontSize="6" fill={G.purple} opacity="0.4" fontFamily="sans-serif">Learns and remembers over time</text>
      </FadeIn>
    </Wrap>
  );
}

function S10_Channels() {
  return (
    <Wrap id="s10">
      {/* Center agent */}
      <circle cx="100" cy="70" r="16" fill={`url(#s10)`} opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.2s" fill="freeze" />
      </circle>
      <text x="100" y="75" textAnchor="middle" fontSize="13" fill="white" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.3s" fill="freeze" />
        🤖
      </text>
      {/* Channel icons */}
      {[
        { x: 30, y: 30, icon: "💬", label: "Slack" },
        { x: 170, y: 30, icon: "✈️", label: "Telegram" },
        { x: 30, y: 110, icon: "🎮", label: "Discord" },
        { x: 170, y: 110, icon: "📧", label: "Email" },
        { x: 100, y: 18, icon: "🌐", label: "Web" },
      ].map((c, i) => (
        <g key={c.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin={`${0.5 + i * 0.25}s`} fill="freeze" />
          <line x1="100" y1="70" x2={c.x} y2={c.y} stroke={G.purple} strokeWidth="0.8" opacity="0.15" />
          <circle cx={c.x} cy={c.y} r="12" fill="white" stroke={G.border} strokeWidth="0.8" />
          <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize="10">{c.icon}</text>
        </g>
      ))}
    </Wrap>
  );
}

function S11_Triggers() {
  return (
    <Wrap id="s11">
      {/* Clock center */}
      <FadeIn begin="0.2s">
        <circle cx="100" cy="55" r="28" fill="white" stroke={G.border} strokeWidth="1.2" />
        <line x1="100" y1="55" x2="100" y2="38" stroke={G.purple} strokeWidth="1.5" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" values="0,100,55;360,100,55" dur="3s" repeatCount="indefinite" />
        </line>
        <line x1="100" y1="55" x2="112" y2="55" stroke={G.text} strokeWidth="1" strokeLinecap="round" opacity="0.4" />
        <circle cx="100" cy="55" r="2" fill={G.purple} />
      </FadeIn>
      {/* Trigger types */}
      {[
        { x: 30, label: "⏰ Schedule", begin: "0.7s" },
        { x: 100, label: "🔔 Webhook", begin: "1.1s" },
        { x: 170, label: "📩 On event", begin: "1.5s" },
      ].map((t) => (
        <g key={t.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin={t.begin} fill="freeze" />
          <rect x={t.x - 30} y="96" width="60" height="18" rx="9" fill={G.faintPurple} stroke={G.purple} strokeWidth="0.6" strokeOpacity="0.2" />
          <text x={t.x} y="108" textAnchor="middle" fontSize="6.5" fill={G.text} fontFamily="sans-serif">{t.label}</text>
        </g>
      ))}
    </Wrap>
  );
}

function S12_LiveBrowser() {
  return (
    <Wrap id="s12">
      <WindowFrame>
        {/* Browser address bar */}
        <FadeIn begin="0.3s">
          <rect x="28" y="28" width="144" height="12" rx="6" fill={G.bg} stroke={G.border} strokeWidth="0.6" />
          <text x="60" y="37" fontSize="5.5" fontFamily="monospace" fill={G.muted}>https://ads.google.com</text>
        </FadeIn>
        {/* Page content loading */}
        <FadeIn begin="0.7s">
          <rect x="28" y="46" width="144" height="72" rx="4" fill="white" />
          <rect x="34" y="52" width="60" height="6" rx="2" fill={G.text} opacity="0.08" />
          <rect x="34" y="64" width="130" height="3" rx="1.5" fill={G.text} opacity="0.04" />
          <rect x="34" y="72" width="100" height="3" rx="1.5" fill={G.text} opacity="0.04" />
        </FadeIn>
        {/* Cursor clicking */}
        <g opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.2s" fill="freeze" />
          <animateTransform attributeName="transform" type="translate" values="120,60;90,80" dur="1s" begin="1.2s" fill="freeze" />
          <polygon points="0,-6 4,2 0,0 -2,4" fill={G.purple} />
        </g>
        {/* Click ripple */}
        <circle cx="90" cy="80" r="0" fill={G.purple} opacity="0">
          <animate attributeName="r" values="0;12" dur="0.5s" begin="2.2s" fill="freeze" />
          <animate attributeName="opacity" values="0.2;0" dur="0.5s" begin="2.2s" fill="freeze" />
        </circle>
      </WindowFrame>
    </Wrap>
  );
}

function S13_Dashboard() {
  return (
    <Wrap id="s13">
      <WindowFrame>
        {/* Sidebar */}
        <rect x="15" y="30" width="35" height="102" fill={G.faintPurple} />
        {[38, 50, 62, 74].map((y) => (
          <rect key={y} x="22" y={y} width="20" height="5" rx="2.5" fill={G.purple} opacity={y === 38 ? 0.2 : 0.06} />
        ))}
        {/* Agent cards */}
        {[
          { y: 36, name: "Google Ads", status: G.green },
          { y: 62, name: "Support Bot", status: G.green },
          { y: 88, name: "Data Agent", status: "#f59e0b" },
        ].map((a, i) => (
          <g key={a.name} opacity="0">
            <animate attributeName="opacity" values="0;1" dur="0.3s" begin={`${0.4 + i * 0.3}s`} fill="freeze" />
            <rect x="58" y={a.y} width="120" height="20" rx="6" fill="white" stroke={G.border} strokeWidth="0.6" />
            <circle cx="70" cy={a.y + 10} r="4" fill={`url(#s13)`} opacity="0.6" />
            <rect x="80" y={a.y + 6} width="50" height="3.5" rx="1.5" fill={G.text} opacity="0.5" />
            <circle cx="168" cy={a.y + 10} r="3" fill={a.status} opacity="0.7" />
            <rect x="80" y={a.y + 13} width="30" height="2.5" rx="1" fill={G.muted} opacity="0.2" />
          </g>
        ))}
      </WindowFrame>
    </Wrap>
  );
}

function S14_Reproduce() {
  return (
    <Wrap id="s14">
      {/* GitHub repo on left */}
      <FadeIn begin="0.2s">
        <rect x="10" y="30" width="70" height="80" rx="8" fill="white" stroke={G.border} strokeWidth="1" />
        <text x="45" y="50" textAnchor="middle" fontSize="16">🐙</text>
        <text x="45" y="65" textAnchor="middle" fontSize="6" fill={G.text} fontFamily="monospace">template</text>
        <text x="45" y="75" textAnchor="middle" fontSize="5" fill={G.muted}>v1.2.0</text>
      </FadeIn>
      {/* Arrow */}
      <FadeIn begin="0.8s">
        <line x1="82" y1="70" x2="112" y2="70" stroke={G.purple} strokeWidth="1.5" markerEnd="url(#arr14)" />
        <text x="97" y="63" textAnchor="middle" fontSize="5" fill={G.purple} opacity="0.5">clone</text>
      </FadeIn>
      {/* New container on right */}
      <FadeIn begin="1.2s">
        <rect x="120" y="30" width="70" height="80" rx="8" fill={G.faintPurple} stroke={G.purple} strokeWidth="1" strokeOpacity="0.3" />
        <text x="155" y="55" textAnchor="middle" fontSize="18">🤖</text>
        <text x="155" y="72" textAnchor="middle" fontSize="6" fill={G.purple} fontFamily="sans-serif">New Agent</text>
        <text x="155" y="82" textAnchor="middle" fontSize="5" fill={G.muted}>Ready instantly</text>
      </FadeIn>
      {/* Sparkle */}
      <circle cx="155" cy="45" r="0" fill={G.purple} opacity="0">
        <animate attributeName="r" values="0;8;0" dur="0.8s" begin="2s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.3;0" dur="0.8s" begin="2s" fill="freeze" />
      </circle>
      <defs><marker id="arr14" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6" fill={G.purple} /></marker></defs>
    </Wrap>
  );
}

function S15_Security() {
  return (
    <Wrap id="s15">
      {/* Shield */}
      <FadeIn begin="0.2s">
        <path d="M100,20 L140,36 L140,72 Q140,100 100,118 Q60,100 60,72 L60,36 Z" fill={G.faintPurple} stroke={G.purple} strokeWidth="1.2" strokeOpacity="0.3" />
      </FadeIn>
      <FadeIn begin="0.6s"><text x="100" y="62" textAnchor="middle" fontSize="22">🛡️</text></FadeIn>
      {/* Security features */}
      {[
        { x: 20, y: 85, label: "Isolated containers" },
        { x: 100, y: 130, label: "Encrypted credentials" },
        { x: 180, y: 85, label: "Scoped permissions" },
      ].map((s, i) => (
        <g key={s.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin={`${1 + i * 0.3}s`} fill="freeze" />
          <text x={s.x} y={s.y} textAnchor="middle" fontSize="5.5" fill={G.text} fontFamily="sans-serif" opacity="0.6">{s.label}</text>
        </g>
      ))}
    </Wrap>
  );
}

function S16_Conversation() {
  return (
    <Wrap id="s16">
      {/* Natural conversation flow */}
      {[
        { y: 14, right: true, text: "How are my campaigns?", begin: "0.2s" },
        { y: 38, right: false, text: "CTR up 12% this week 📈", begin: "0.7s" },
        { y: 62, right: true, text: "Pause the underperformers", begin: "1.2s" },
        { y: 86, right: false, text: "Done. 3 ads paused ✅", begin: "1.7s" },
        { y: 110, right: true, text: "Send a report to the team", begin: "2.2s" },
      ].map((m) => (
        <g key={m.text} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin={m.begin} fill="freeze" />
          <rect
            x={m.right ? 60 : 20}
            y={m.y}
            width={120}
            height="18"
            rx="8"
            fill={m.right ? G.purple : "white"}
            stroke={m.right ? "none" : G.border}
            strokeWidth="0.8"
            opacity={m.right ? 0.1 : 1}
          />
          <text x={m.right ? 70 : 30} y={m.y + 12} fontSize="6.5" fill={m.right ? G.purple : G.text} fontFamily="sans-serif">{m.text}</text>
        </g>
      ))}
    </Wrap>
  );
}

function S17_Iterate() {
  return (
    <Wrap id="s17">
      {/* Circular improvement loop */}
      <FadeIn begin="0.2s">
        <circle cx="100" cy="65" r="40" fill="none" stroke={G.purple} strokeWidth="1" strokeDasharray="4,3" opacity="0.15" />
      </FadeIn>
      {/* Stages around the circle */}
      {[
        { angle: -90, icon: "💬", label: "Chat" },
        { angle: -18, icon: "🔧", label: "Refine" },
        { angle: 54, icon: "🧪", label: "Test" },
        { angle: 126, icon: "📊", label: "Evaluate" },
        { angle: 198, icon: "✨", label: "Improve" },
      ].map((s, i) => {
        const rad = (s.angle * Math.PI) / 180;
        const x = 100 + Math.cos(rad) * 48;
        const y = 65 + Math.sin(rad) * 42;
        return (
          <g key={s.label} opacity="0">
            <animate attributeName="opacity" values="0;1" dur="0.3s" begin={`${0.4 + i * 0.3}s`} fill="freeze" />
            <circle cx={x} cy={y} r="13" fill="white" stroke={G.border} strokeWidth="0.8" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="9">{s.icon}</text>
            <text x={x} y={y + 18} textAnchor="middle" fontSize="5" fill={G.muted} fontFamily="sans-serif">{s.label}</text>
          </g>
        );
      })}
      {/* Rotating arrow */}
      <circle cx="100" cy="65" r="3" fill={G.purple} opacity="0">
        <animate attributeName="opacity" values="0;0.5" dur="0.3s" begin="2s" fill="freeze" />
        <animateTransform attributeName="transform" type="rotate" values="0,100,65;360,100,65" dur="4s" begin="2s" repeatCount="indefinite" />
        <animate attributeName="cx" values="100;140" dur="0.01s" fill="freeze" />
      </circle>
    </Wrap>
  );
}

function S18_Team() {
  return (
    <Wrap id="s18">
      {/* Multiple agent avatars */}
      {[
        { x: 40, y: 40, label: "Ads Manager", begin: "0.3s" },
        { x: 100, y: 30, label: "Support", begin: "0.6s" },
        { x: 160, y: 40, label: "Analytics", begin: "0.9s" },
        { x: 60, y: 85, label: "Scheduler", begin: "1.2s" },
        { x: 140, y: 85, label: "Reporter", begin: "1.5s" },
      ].map((a, i) => (
        <g key={a.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin={a.begin} fill="freeze" />
          <circle cx={a.x} cy={a.y} r="14" fill={`url(#s18)`} opacity={0.6 + i * 0.08} />
          <text x={a.x} y={a.y + 4} textAnchor="middle" fontSize="11" fill="white">🤖</text>
          <text x={a.x} y={a.y + 28} textAnchor="middle" fontSize="5.5" fill={G.text} fontFamily="sans-serif">{a.label}</text>
        </g>
      ))}
      {/* Connection web */}
      <FadeIn begin="1.8s">
        <line x1="40" y1="40" x2="100" y2="30" stroke={G.purple} strokeWidth="0.5" opacity="0.1" />
        <line x1="100" y1="30" x2="160" y2="40" stroke={G.purple} strokeWidth="0.5" opacity="0.1" />
        <line x1="40" y1="40" x2="60" y2="85" stroke={G.purple} strokeWidth="0.5" opacity="0.1" />
        <line x1="160" y1="40" x2="140" y2="85" stroke={G.purple} strokeWidth="0.5" opacity="0.1" />
        <line x1="60" y1="85" x2="140" y2="85" stroke={G.purple} strokeWidth="0.5" opacity="0.1" />
      </FadeIn>
    </Wrap>
  );
}

function S19_Deploy() {
  return (
    <Wrap id="s19">
      {/* Cloud shape */}
      <FadeIn begin="0.2s">
        <ellipse cx="100" cy="50" rx="60" ry="30" fill={G.faintPurple} stroke={G.purple} strokeWidth="0.8" strokeOpacity="0.15" />
        <text x="100" y="46" textAnchor="middle" fontSize="7" fill={G.purple} opacity="0.4" fontFamily="sans-serif">Your infrastructure</text>
      </FadeIn>
      {/* Deployment targets */}
      {[
        { x: 40, y: 105, icon: "☁️", label: "Cloud", begin: "0.6s" },
        { x: 100, y: 105, icon: "🏢", label: "On-prem", begin: "1s" },
        { x: 160, y: 105, icon: "💻", label: "Desktop", begin: "1.4s" },
      ].map((d) => (
        <g key={d.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin={d.begin} fill="freeze" />
          <line x1="100" y1="72" x2={d.x} y2={d.y - 14} stroke={G.purple} strokeWidth="0.8" strokeDasharray="3,2" opacity="0.15" />
          <circle cx={d.x} cy={d.y} r="14" fill="white" stroke={G.border} strokeWidth="0.8" />
          <text x={d.x} y={d.y + 4} textAnchor="middle" fontSize="11">{d.icon}</text>
          <text x={d.x} y={d.y + 26} textAnchor="middle" fontSize="5.5" fill={G.muted} fontFamily="sans-serif">{d.label}</text>
        </g>
      ))}
    </Wrap>
  );
}

function S20_AlwaysOn() {
  return (
    <Wrap id="s20">
      {/* 24/7 center */}
      <FadeIn begin="0.2s">
        <circle cx="100" cy="60" r="32" fill={`url(#s20)`} opacity="0.06" />
        <text x="100" y="55" textAnchor="middle" fontSize="11" fontWeight="bold" fill={G.purple} fontFamily="sans-serif">24 / 7</text>
        <text x="100" y="68" textAnchor="middle" fontSize="6" fill={G.muted} fontFamily="sans-serif">Always on</text>
      </FadeIn>
      {/* Activity pulse rings */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx="100" cy="60" r="32" fill="none" stroke={G.purple} strokeWidth="0.8" opacity="0">
          <animate attributeName="r" values="32;60" dur="2.5s" begin={`${0.6 + i * 0.8}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0" dur="2.5s" begin={`${0.6 + i * 0.8}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* Time indicators */}
      {[
        { x: 30, y: 110, label: "🌅 Morning report" },
        { x: 100, y: 120, label: "☀️ Midday check" },
        { x: 170, y: 110, label: "🌙 Overnight watch" },
      ].map((t, i) => (
        <g key={t.label} opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin={`${1.5 + i * 0.3}s`} fill="freeze" />
          <text x={t.x} y={t.y} textAnchor="middle" fontSize="5" fill={G.text} fontFamily="sans-serif" opacity="0.5">{t.label}</text>
        </g>
      ))}
    </Wrap>
  );
}

// ─── Scene registry ─────────────────────────────────────────────────────────

const SCENES: Scene[] = [
  { title: "Describe your agent", subtitle: "Tell the Architect what your digital employee should do", render: S01_Describe },
  { title: "Every agent has a soul", subtitle: "Personality, purpose, and rules — not just configuration", render: S02_Soul },
  { title: "The Architect builds", subtitle: "Soul, skills, tools — written into your agent's workspace", render: S03_Architect },
  { title: "Modular skills", subtitle: "Each skill is a focused capability your agent masters", render: S04_Skills },
  { title: "Connect any tool", subtitle: "Google Ads, Slack, Gmail, databases — plug in what you need", render: S05_Tools },
  { title: "Test in real-time", subtitle: "Switch to live mode and talk to your agent instantly", render: S06_Test },
  { title: "Ship to GitHub", subtitle: "Push your agent as a template — ready to reproduce", render: S07_Ship },
  { title: "Own container, own world", subtitle: "Every agent gets an isolated workspace from day one", render: S08_Container },
  { title: "Memory that persists", subtitle: "Your agent remembers context, preferences, and history", render: S09_Memory },
  { title: "Multi-channel presence", subtitle: "Slack, Telegram, Discord, email, web — all at once", render: S10_Channels },
  { title: "Smart triggers", subtitle: "Schedules, webhooks, and events start your agent automatically", render: S11_Triggers },
  { title: "Built-in browser", subtitle: "Your agent can see and interact with any website", render: S12_LiveBrowser },
  { title: "Agent dashboard", subtitle: "Monitor status, health, and activity across all your agents", render: S13_Dashboard },
  { title: "Reproduce from template", subtitle: "Clone a GitHub repo into a new container — agent ready instantly", render: S14_Reproduce },
  { title: "Enterprise security", subtitle: "Isolated containers, encrypted credentials, scoped permissions", render: S15_Security },
  { title: "Natural conversation", subtitle: "Talk to your agent like a teammate, not a command line", render: S16_Conversation },
  { title: "Continuous improvement", subtitle: "Chat, refine, test, evaluate — your agent gets better every cycle", render: S17_Iterate },
  { title: "Build a team", subtitle: "Create multiple agents that work together on complex workflows", render: S18_Team },
  { title: "Deploy anywhere", subtitle: "Cloud, on-premises, or desktop — your agents go where you need", render: S19_Deploy },
  { title: "Always on", subtitle: "Your digital employees work around the clock, never miss a beat", render: S20_AlwaysOn },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function OnboardingSequence({ className = "" }: { className?: string }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [phase, setPhase] = useState<"scene" | "transition">("scene");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "scene") {
      timer = setTimeout(() => setPhase("transition"), SCENE_DURATION);
    } else {
      timer = setTimeout(() => {
        setSceneIndex((prev) => (prev + 1) % SCENES.length);
        setPhase("scene");
      }, TRANSITION_DURATION);
    }
    return () => clearTimeout(timer);
  }, [phase, sceneIndex]);

  const scene = SCENES[sceneIndex];

  return (
    <div className={`flex flex-col items-center gap-5 ${className}`}>
      {/* Animation area */}
      <div className="relative w-[200px] h-[140px] flex items-center justify-center">
        {phase === "scene" ? (
          <div key={`scene-${sceneIndex}`} className="stage-enter">
            {scene.render()}
          </div>
        ) : (
          <div key={`trans-${sceneIndex}`} className="spark">
            <AnimatedRuhLogo mode="alive" size={72} />
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="text-center space-y-1 min-h-[44px]">
        {phase === "scene" && (
          <div key={`caption-${sceneIndex}`} className="stage-enter">
            <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
              {scene.title}
            </p>
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
              {scene.subtitle}
            </p>
          </div>
        )}
      </div>

      {/* Scene counter */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {SCENES.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === sceneIndex ? "12px" : "4px",
                height: "4px",
                borderRadius: i === sceneIndex ? "2px" : "50%",
                backgroundColor: i === sceneIndex
                  ? G.purple
                  : i < sceneIndex
                  ? `rgba(174, 0, 208, 0.25)`
                  : "rgba(174, 0, 208, 0.08)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
