import {
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLang } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { getVisibleNav, type NavPage } from "@/config/navConfig";

/**
 * BottomNav — Multi-bump Scalloped NavBar (1-to-1 match to Original Picture).
 * 
 * Features:
 *  1. Every single icon is housed inside a circular bump, with a larger center bump for Home.
 *  2. A sliding active indicator visually rests *behind* the icons.
 *  3. Top edge is a 100% seamlessly calculated SVG Bezier path.
 */
export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, dir } = useLang();
  const permissions = usePermissions();

  const { left, center, right } = getVisibleNav(permissions);
  const centerLabel = t("home") ?? center.label;

  function isActive(page: NavPage) {
    if (page.path === "/") return location.pathname === "/";
    return (
      location.pathname === page.path ||
      location.pathname.startsWith(`${page.path}/`)
    );
  }

  // Combine pages
  const allTabs = [...left, center, ...right];
  let activeIndex = allTabs.findIndex((page) => isActive(page));
  if (activeIndex === -1) activeIndex = left.length; // Default to center

  const isRtl = dir === "rtl";
  const glassClass = "bg-background/90 backdrop-blur-[24px] saturate-[180%]";

  // --- 1. Programmatically calculate the multi-bump seamless SVG paths --- 
  // Base SVG width is tabs * 100
  const svgWidth = allTabs.length * 100;
  
  let topEdgePath = `M 0,32 `;
  allTabs.forEach((_, i) => {
    const isCenterBump = i === left.length; // Center icon
    const cx = i * 100 + 50;
    
    if (isCenterBump) {
       // Big Bump
      topEdgePath += `L ${cx - 40},32 C ${cx - 20},32 ${cx - 20},0 ${cx},0 C ${cx + 20},0 ${cx + 20},32 ${cx + 40},32 `;
    } else {
       // Small Bump
      topEdgePath += `L ${cx - 30},32 C ${cx - 15},32 ${cx - 15},16 ${cx},16 C ${cx + 15},16 ${cx + 15},32 ${cx + 30},32 `;
    }
  });
  topEdgePath += `L ${svgWidth},32`;

  const maskPath = `M 0,80 L 0,32 ` + topEdgePath.substring(7) + ` L ${svgWidth},80 Z`;
  const maskSvgStr = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${svgWidth} 80' preserveAspectRatio='none'><path d='${maskPath}' /></svg>`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none pb-4 pt-12 overflow-visible">
      {/* 
        Main Container. Max width forms an elegant dock on wider screens.
      */}
      <nav
        id="bottom-nav"
        dir={dir}
        className={`mx-auto max-w-[500px] relative pointer-events-auto rounded-[32px] shadow-2xl shadow-black/10`}
        style={{ height: "80px" }}
      >
        {/* The Masked Container forming the entire Scalloped Bar */}
        <div 
          className={`absolute inset-0 w-full h-full ${glassClass}`}
          style={{
            WebkitMaskImage: `url("data:image/svg+xml,${encodeURIComponent(maskSvgStr)}")`,
            WebkitMaskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat"
          }}
        />

        {/* The crisp contiguous Stroke tracing the scalloped tops */}
        <svg viewBox={`0 0 ${svgWidth} 80`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_-1px_1px_rgba(0,0,0,0.05)] z-20">
          <path d={topEdgePath} fill="none" className="stroke-border" strokeWidth="1.5" />
        </svg>

        {/* The Animated Sliding Indicator (Resting BEHIND the icons) */}
        <div
          className="absolute top-0 bottom-0 z-10 transition-transform duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-end justify-center pointer-events-none"
          style={{
            width: `${100 / allTabs.length}%`,
            ...(isRtl ? { right: 0 } : { left: 0 }),
            transform: `translateX(${isRtl ? -activeIndex * 100 : activeIndex * 100}%)`,
          }}
        >
           {/* The solid highlighted active bubble */}
           <div className={`bg-primary/15 rounded-full transition-all duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-inner border border-primary/10 ${
              activeIndex === left.length ? 'w-[52px] h-[52px] mb-[15px]' : 'w-[42px] h-[42px] mb-[13px]'
           }`} />
        </div>

        {/* Tab Items Grid (Icons and text) */}
        <div
          className="absolute inset-0 w-full h-full grid items-end z-30"
          style={{
            gridTemplateColumns: `repeat(${allTabs.length}, minmax(0, 1fr))`,
          }}
        >
          {allTabs.map((page, index) => {
            const isCenter = index === left.length;
            const active = index === activeIndex;
            return (
              <NavItem
                key={page.id}
                page={page}
                label={isCenter ? centerLabel : page.label}
                active={active}
                isCenter={isCenter}
                onClick={() => navigate(page.path)}
              />
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ─── NavItem — a single bottom nav tab ────────────────────────────────────────

function NavItem({
  page,
  label,
  active,
  isCenter,
  onClick,
}: {
  page: NavPage;
  label: string;
  active: boolean;
  isCenter: boolean;
  onClick: () => void;
}) {
  const Icon: LucideIcon = isCenter ? LayoutDashboard : page.icon;

  return (
    <button
      id={`nav-${page.id}`}
      onClick={onClick}
      className={`flex flex-col items-center justify-end h-full relative cursor-pointer group pb-1.5`}
      aria-label={label}
    >
      <div 
        className={`flex items-center justify-center transition-colors duration-300 ${
          isCenter ? 'mb-[21px]' : 'mb-[15px]'
        } ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
      >
        <Icon className={isCenter ? "w-6 h-6" : "w-[20px] h-[20px]"} strokeWidth={active ? 2 : 1.5} />
      </div>
      
      {/* Label tightly locked at the bottom */}
      <span 
        className={`absolute bottom-[6px] text-[10px] font-medium leading-none truncate max-w-[64px] transition-all duration-300 ${
          active ? "text-primary opacity-100" : "text-muted-foreground opacity-90"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
