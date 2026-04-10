import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { MapPin, ArrowLeft, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.warn("[404] No route for:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 pb-24">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 border border-border">
          <MapPin className="w-7 h-7 text-muted-foreground/50" />
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">404</p>
          <h1 className="text-xl font-bold text-foreground mb-2">Page Not Found</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The page <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{location.pathname}</span> does not exist.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm border border-border rounded-lg px-4 py-2 hover:bg-muted/30 transition text-muted-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go Back
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:opacity-90 transition font-medium"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
