import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { usePermissions, type Permissions } from "@/hooks/usePermissions";

type PermissionKey = keyof {
  [K in keyof Permissions as Permissions[K] extends boolean ? K : never]: true;
};

type RoleGuardProps = {
  children: React.ReactNode;
  /** List of raw role strings that are allowed */
  allowedRoles?: string[];
  /** A boolean permission key from usePermissions (e.g. "canManageStock") */
  requiredPermission?: PermissionKey;
};

export default function RoleGuard({
  children,
  allowedRoles,
  requiredPermission,
}: RoleGuardProps) {
  const { user, loading } = useAuth();
  const permissions = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admin+ always passes all guards
  if (permissions.isAdmin) {
    return <>{children}</>;
  }

  // Check allowedRoles list
  if (allowedRoles && !allowedRoles.includes(permissions.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Check permission-key gate
  if (requiredPermission && !permissions[requiredPermission]) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
