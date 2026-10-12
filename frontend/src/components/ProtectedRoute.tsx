import { Navigate, Outlet } from "react-router-dom";
import { getStoredUser, isRole } from "../utils/auth";
import React from "react";
import PermissionDenied from "./PermissionDenied";

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
    return <PermissionDenied />;
  }

  return children ? <>{children}</> : <Outlet />;
}
