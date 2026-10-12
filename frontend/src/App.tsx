import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import PageLoader from "./components/PageLoader";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import NotFoundPage from "./pages/NotFoundPage";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AgentQueue = lazy(() => import("./pages/AgentQueue"));
const TicketsPage = lazy(() => import("./pages/TicketsPage"));
const TicketDetailPage = lazy(() => import("./pages/TicketDetailPage"));

function AppRoutes() {
  const { user } = useAuth();

  return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Support chat route */}
        <Route element={<ProtectedRoute allowedRoles={["customer", "agent", "manager", "admin"]} />}>
          <Route element={<AppShellRoute />}>
          <Route path="/chat" element={user ? <ChatPage user={user} /> : <Navigate to="/login" />} />
          </Route>
        </Route>

        {/* Manager/Admin Gated Route */}
        <Route element={<ProtectedRoute allowedRoles={["agent", "manager", "admin"]} />}>
          <Route element={<AppShellRoute />}>
          <Route path="/tickets" element={user ? <TicketsPage /> : <Navigate to="/login" />} />
          <Route path="/tickets/:ticketId" element={user ? <TicketDetailPage /> : <Navigate to="/login" />} />
          <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/login" />} />
          </Route>
        </Route>

        {/* Admin Gated Route */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route element={<AppShellRoute />}>
          <Route path="/admin" element={user ? <AdminPanel /> : <Navigate to="/login" />} />
          </Route>
        </Route>

        {/* Manager handoff route */}
        <Route element={<ProtectedRoute allowedRoles={["manager", "admin"]} />}>
          <Route element={<AppShellRoute />}>
          <Route path="/agent" element={user ? <AgentQueue /> : <Navigate to="/login" />} />
          </Route>
        </Route>

        {/* Redirect Fallbacks */}
        <Route
          path="/"
          element={
            <Navigate
              to={
                user
                  ? user.role === "customer"
                    ? "/chat"
                    : user.role === "agent"
                    ? "/agent"
                    : user.role === "manager"
                    ? "/dashboard"
                    : "/admin"
                  : "/login"
              }
              replace
            />
          }
        />
        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
  );
}

function AppShellRoute() {
  const { user } = useAuth();
  return user ? <AppShell user={user} /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
