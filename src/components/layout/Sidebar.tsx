import { NavLink, useLocation, matchPath } from "react-router-dom";
import {
  Sidebar as UiSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useLang } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { getVisibleSections, type SidebarItem } from "@/config/sidebarConfig";
import { SidebarResizeHandle } from "@/components/layout/SidebarResizeHandle";

function isPathActive(currentPath: string, item: SidebarItem): boolean {
  if (item.end) {
    return matchPath({ path: item.path, end: true }, currentPath) !== null;
  }
  return matchPath({ path: item.path, end: false }, currentPath) !== null;
}

export function Sidebar() {
  const { t, dir } = useLang();
  const permissions = usePermissions();
  const sections = getVisibleSections(permissions);
  const { pathname } = useLocation();

  const translate = (labelKey: string, fallback: string): string =>
    t(labelKey, fallback);

  return (
    <UiSidebar
      collapsible="icon"
      side={dir === "rtl" ? "right" : "left"}
      className="border-r-0 bg-transparent top-11 h-[calc(100svh-2.75rem)]"
    >
      <SidebarContent className="gap-0 sidebar-scroll group-data-[collapsible=icon]:overflow-y-auto">
        {sections.map((section) => (
          <SidebarGroup key={section.id} className="px-2 py-2">
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {translate(section.labelKey, section.fallbackLabel)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const label = translate(item.labelKey, item.fallbackLabel);
                  const active = isPathActive(pathname, item);
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={{ children: label, className: "z-[100]" }}
                        size="sm"
                        className="rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[active=true]:bg-muted/60 data-[active=true]:text-foreground data-[active=true]:font-medium transition-colors group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                      >
                        <NavLink to={item.path} end={item.end} className="group-data-[collapsible=icon]:!justify-center">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate group-data-[collapsible=icon]:hidden">{label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarResizeHandle />
    </UiSidebar>
  );
}
