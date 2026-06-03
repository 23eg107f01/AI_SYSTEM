import { Navigate, Outlet } from "react-router-dom";
import { getStoredUser, isRole, AuthUser } from "../utils/auth";
import React from "react";

interface ProtectedRouteProps {
  allowedRoles?: ("customer" | "agent" | "manager" | "admin")[];
  children?: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const user = getStoredUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !isRole(user, ...allowedRoles)) {
    // Redirect based on role if unauthorized
    if (user.role === "customer") {
      return <Navigate to="/chat" replace />;
    } else if (user.role === "agent") {
      return <Navigate to="/agent" replace />;
    } else if (user.role === "manager") {
      return <Navigate to="/dashboard" replace />;
    } else if (user.role === "admin") {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
