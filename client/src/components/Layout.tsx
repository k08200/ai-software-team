import { useState, useRef, useEffect, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Zap,
  Settings,
  BookOpen,
  Github,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { PlanBadge } from "./ui/Badge.js";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { to: "/pipeline", label: "New Pipeline", icon: <Zap size={16} /> },
  { to: "/settings", label: "Settings", icon: <Settings size={16} /> },
];

const EXTERNAL_LINKS: NavItem[] = [
  {
    to: "https://docs.example.com",
    label: "Docs",
    icon: <BookOpen size={16} />,
    external: true,
  },
  {
    to: "https://github.com",
    label: "GitHub",
    icon: <Github size={16} />,
    external: true,
  },
];

function SidebarLink({ item }: { item: NavItem }) {
  if (item.external) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <span className="flex-shrink-0 text-gray-500">{item.icon}</span>
        {item.label}
      </a>
    );
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
          isActive
            ? "bg-purple-900/40 text-purple-300 border border-purple-800/50"
            : "text-gray-400 hover:text-white hover:bg-gray-800",
        ].join(" ")
      }
    >
      <span className="flex-shrink-0">{item.icon}</span>
      {item.label}
    </NavLink>
  );
}

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* ------------------------------------------------------------------ */}
      {/* Mobile backdrop                                                       */}
      {/* ------------------------------------------------------------------ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                               */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={[
          "fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-30 flex flex-col transition-transform duration-300",
          "lg:translate-x-0 lg:static lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-label="Sidebar navigation"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Zap size={14} className="text-white" />
          </div>
          <span className="text-white font-bold text-sm leading-tight">
            AI Software Team
          </span>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-gray-500 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}

          <div className="pt-4 mt-4 border-t border-gray-800 space-y-1">
            {EXTERNAL_LINKS.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </div>
        </nav>

        {/* User info footer */}
        {user && (
          <div className="px-3 py-4 border-t border-gray-800">
            <div className="px-3 py-2.5 rounded-xl bg-gray-800/50">
              <p className="text-xs text-white font-medium truncate">
                {user.email}
              </p>
              <div className="flex items-center justify-between mt-1">
                <PlanBadge plan={user.plan} />
                <button
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main content area                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 flex items-center px-4 gap-4 sticky top-0 z-10">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-400 hover:text-white transition-colors"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumb spacer */}
          <div className="flex-1" />

          {/* User menu */}
          {user && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-800 transition-colors text-sm"
                aria-haspopup="true"
                aria-expanded={userMenuOpen}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-300 hidden sm:block max-w-[160px] truncate">
                  {user.email}
                </span>
                <PlanBadge plan={user.plan} />
                <ChevronDown
                  size={14}
                  className={[
                    "text-gray-500 transition-transform duration-200",
                    userMenuOpen ? "rotate-180" : "",
                  ].join(" ")}
                />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                  <div className="px-4 py-3 border-b border-gray-800">
                    <p className="text-xs text-gray-400">Signed in as</p>
                    <p className="text-sm text-white font-medium truncate">
                      {user.email}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
