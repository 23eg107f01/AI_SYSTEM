import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ChatPage from "./pages/ChatPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPanel from "./pages/AdminPanel";
import AgentQueue from "./pages/AgentQueue";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./hooks/useAuth";

function App() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Customer Gated Route */}
        <Route element={<ProtectedRoute allowedRoles={["customer"]} />}>
          <Route path="/chat" element={user ? <ChatPage user={user} /> : <Navigate to="/login" />} />
        </Route>

        {/* Manager/Admin Gated Route */}
        <Route element={<ProtectedRoute allowedRoles={["manager", "admin"]} />}>
          <Route path="/dashboard" element={user ? <DashboardPage user={user} /> : <Navigate to="/login" />} />
        </Route>

        {/* Admin Gated Route */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route path="/admin" element={user ? <AdminPanel user={user} /> : <Navigate to="/login" />} />
        </Route>

        {/* Manager handoff route */}
        <Route element={<ProtectedRoute allowedRoles={["manager", "admin"]} />}>
          <Route path="/agent" element={user ? <AgentQueue user={user} /> : <Navigate to="/login" />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
