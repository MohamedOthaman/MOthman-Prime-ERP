/**
 * DefaultDashboard — fallback dashboard for roles that don't have a specific dashboard.
 * Renders the existing stock overview (Index page) as the default landing page.
 */
import Index from "@/pages/Index";

export default function DefaultDashboard() {
  return <Index />;
}
