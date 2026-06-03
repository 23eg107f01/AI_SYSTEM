import { Link, useNavigate } from "react-router-dom";
import { AuthUser, clearTokens, isRole } from "../utils/auth";

interface Props {
  user: AuthUser;
}

export default function Navbar({ user }: Props) {
  const navigate = useNavigate();

  function handleLogout() {
    clearTokens();
    navigate("/login");
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-6">
        <Link to="/chat" className="font-bold text-blue-600 text-lg tracking-tight">
          AI Support
        </Link>
        <Link to="/chat" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
          Chat
        </Link>
        {isRole(user, "manager", "admin") && (
          <Link to="/agent" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Manager Chats
          </Link>
        )}
        {isRole(user, "manager", "admin") && (
          <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Dashboard
          </Link>
        )}
        {isRole(user, "admin") && (
          <Link to="/admin" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Admin
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
          {user.role}
        </span>
        <span className="text-sm text-gray-500">{user.email}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-red-500 hover:text-red-700 transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
