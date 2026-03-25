import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";

type RoleGuardProps = {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
};

export default function RoleGuard({
  children,
  allowedRoles,
}: RoleGuardProps) {
  const { user, loading, role } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}