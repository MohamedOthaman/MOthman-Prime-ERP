const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'index.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Replace the color values to be more professional (mute primary, success, etc)
css = css.replace(/200 80% 45%/g, "212 95% 50%"); // Primary Light
css = css.replace(/200 80% 55%/g, "212 100% 55%"); // Primary Dark
css = css.replace(/145 65% 38%/g, "142 45% 45%"); // Success Light 
css = css.replace(/145 65% 45%/g, "142 50% 50%"); // Success Dark
css = css.replace(/35 85% 50%/g, "38 65% 50%"); // Warning
css = css.replace(/0 70% 50%/g, "350 65% 50%"); // Destructive Light

// Make background lighter/more corporate 
css = css.replace(/--background: 0 0% 97%;/g, "--background: 210 20% 98%;");
css = css.replace(/--background: 220 20% 10%;/g, "--background: 220 22% 8%;");

// 2. Add mesh gradient to body
const oldBody = `  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans);
  }`;
  
const newBody = `  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans);
    background-image: radial-gradient(at 0% 0%, hsla(210, 80%, 94%, 1) 0px, transparent 50%),
                      radial-gradient(at 100% 0%, hsla(220, 60%, 95%, 1) 0px, transparent 50%),
                      radial-gradient(at 100% 100%, hsla(200, 70%, 94%, 1) 0px, transparent 50%),
                      radial-gradient(at 0% 100%, hsla(230, 60%, 95%, 1) 0px, transparent 50%);
    background-attachment: fixed;
  }

  .dark body {
    background-image: radial-gradient(at 0% 0%, hsla(220, 30%, 15%, 1) 0px, transparent 50%),
                      radial-gradient(at 100% 0%, hsla(210, 30%, 12%, 1) 0px, transparent 50%),
                      radial-gradient(at 100% 100%, hsla(230, 25%, 14%, 1) 0px, transparent 50%),
                      radial-gradient(at 0% 100%, hsla(215, 30%, 13%, 1) 0px, transparent 50%);
  }`;
css = css.replace(oldBody, newBody);

// 3. Replace the utilities block 
const utilsRegex = /\/\* ── Subtle surface card ──────────────────── \*\/[\s\S]*?\/\* iOS-style wheel picker \*\//;
const newUtils = `/* ── Subtle surface card ──────────────────── */

.surface {
  background: hsla(var(--card), 0.65);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid hsla(var(--foreground), 0.08);
  border-radius: 1rem;
  box-shadow: 0 4px 24px -4px hsla(0, 0%, 0%, 0.04), inset 0 1px 0 hsla(0, 0%, 100%, 0.4);
}

.dark .surface {
  background: hsla(var(--card), 0.5);
  border: 1px solid hsla(var(--foreground), 0.1);
  box-shadow: 0 6px 30px -4px hsla(0, 0%, 0%, 0.25), inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
}

/* Light frosted surface — very subtle glass, Apple-style */
.surface-frosted {
  background: hsla(var(--card), 0.4);
  backdrop-filter: blur(32px) saturate(200%);
  -webkit-backdrop-filter: blur(32px) saturate(200%);
  border: 1px solid hsla(var(--foreground), 0.05);
  box-shadow: inset 0 1px 0 hsla(0, 0%, 100%, 0.4);
}

.dark .surface-frosted {
  background: hsla(var(--card), 0.3);
  border: 1px solid hsla(var(--foreground), 0.1);
  box-shadow: inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
}

/* Navigation bar — subtle frosted background */
.surface-nav {
  background: hsla(var(--nav-bg), 0.65);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border-top: 1px solid hsla(var(--foreground), 0.08);
  box-shadow: 0 -4px 24px hsla(0, 0%, 0%, 0.03), inset 1px 1px 0 hsla(0,0%,100%,0.3);
}

.dark .surface-nav {
  background: hsla(var(--nav-bg), 0.5);
  border-top: 1px solid hsla(var(--foreground), 0.1);
  box-shadow: 0 -6px 30px hsla(0, 0%, 0%, 0.3), inset 1px 1px 0 hsla(0,0%,100%,0.05);
}

/* ── Elevation (soft shadows only) ────────── */

.elevation-1 {
  box-shadow:
    0 2px 8px hsla(0, 0%, 0%, 0.04),
    0 1px 2px hsla(0, 0%, 0%, 0.02);
}

.elevation-2 {
  box-shadow:
    0 8px 24px hsla(0, 0%, 0%, 0.06),
    0 2px 8px hsla(0, 0%, 0%, 0.04);
}

.elevation-3 {
  box-shadow:
    0 16px 48px hsla(0, 0%, 0%, 0.08),
    0 4px 16px hsla(0, 0%, 0%, 0.04);
}

/* ── Interactive states ───────────────────── */

.interactive {
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.interactive:hover {
  background: hsla(var(--muted), 0.7);
}

.interactive-lift {
  transition: box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.interactive-lift:hover {
  transform: translateY(-2px);
  box-shadow:
    0 12px 32px hsla(0, 0%, 0%, 0.06),
    0 4px 12px hsla(0, 0%, 0%, 0.04);
}

/* ── Nav item — clean, no glow ────────────── */

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 0;
  cursor: pointer;
  transition: color 0.2s ease;
  color: hsla(var(--nav-inactive), 0.8);
  position: relative;
}

.nav-item:hover {
  color: hsl(var(--foreground));
}

.nav-item-active {
  color: hsl(var(--primary));
  font-weight: 500;
}

.nav-item-active::after {
  content: "";
  position: absolute;
  bottom: 0px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: hsl(var(--primary));
  opacity: 0.9;
}

/* Center nav button — slightly larger, no glow */
.nav-center-btn {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px hsla(var(--primary), 0.3);
}

.nav-center-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px hsla(var(--primary), 0.4);
}

.nav-center-btn:active {
  transform: scale(0.94);
}

/* ── KPI card — flat, data-focused ────────── */

.kpi-card {
  background: hsla(var(--card), 0.65);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid hsla(var(--foreground), 0.06);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px hsla(0, 0%, 0%, 0.03), inset 0 1px 0 hsla(0, 0%, 100%, 0.5);
}

.dark .kpi-card {
  background: hsla(var(--card), 0.5);
  border-color: hsla(var(--foreground), 0.1);
  box-shadow: 0 4px 20px hsla(0, 0%, 0%, 0.2), inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
}

.kpi-card:hover {
  border-color: hsla(var(--primary), 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 30px hsla(0, 0%, 0%, 0.06), inset 0 1px 0 hsla(0, 0%, 100%, 0.5);
}

.dark .kpi-card:hover {
  border-color: hsla(var(--primary), 0.4);
  box-shadow: 0 8px 30px hsla(0, 0%, 0%, 0.3), inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
}

/* ── Quick action button ──────────────────── */

.action-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: hsla(var(--card), 0.55);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid hsla(var(--foreground), 0.08);
  border-radius: 1rem;
  padding: 0.875rem 1rem;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  box-shadow: inset 0 1px 0 hsla(0, 0%, 100%, 0.4);
}

.dark .action-card {
  background: hsla(var(--card), 0.4);
  border-color: hsla(var(--foreground), 0.1);
  box-shadow: inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
}

.action-card:hover {
  background: hsla(var(--muted), 0.8);
  border-color: hsla(var(--foreground), 0.15);
  transform: translateY(-1px);
}

.dark .action-card:hover {
  border-color: hsla(var(--foreground), 0.2);
}

/* iOS-style wheel picker */`;
css = css.replace(utilsRegex, newUtils);

fs.writeFileSync(cssPath, css);
console.log('CSS updated with iOS glassmorphism styles!');
