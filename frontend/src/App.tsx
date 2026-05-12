import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useAuthStore } from "@/store/authStore";
import LoginPage       from "@/pages/LoginPage";
import RegisterPage    from "@/pages/RegisterPage";
import DashboardPage   from "@/pages/DashboardPage";
import ProposalsPage   from "@/pages/ProposalsPage";
import TreasuryPage    from "@/pages/TreasuryPage";
import DocumentsPage   from "@/pages/DocumentsPage";
import AnnouncementsPage from "@/pages/AnnouncementsPage";
import MaintenancePage   from "@/pages/MaintenancePage";
import ViolationsPage    from "@/pages/ViolationsPage";
import MeetingsPage      from "@/pages/MeetingsPage";
import CalendarPage      from "@/pages/CalendarPage";
import ArcPage           from "@/pages/ArcPage";
import ParkingPage       from "@/pages/ParkingPage";
import VendorsPage       from "@/pages/VendorsPage";
import DiscussionsPage  from "@/pages/DiscussionsPage";
import AmenitiesPage    from "@/pages/AmenitiesPage";

const S = {
  paper:    "#F9F6F0",
  navy:     "#1B2D4F",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
};

const NAV_TABS = [
  { to: "/dashboard",     label: "Dashboard"     },
  { to: "/proposals",     label: "Proposals"     },
  { to: "/treasury",      label: "Treasury"      },
  { to: "/documents",     label: "Documents"     },
  { to: "/announcements", label: "Announcements" },
  { to: "/maintenance",   label: "Maintenance"   },
  { to: "/violations",    label: "Violations"    },
  { to: "/meetings",      label: "Meetings"      },
  { to: "/calendar",      label: "Calendar"      },
  { to: "/arc",           label: "ARC"           },
  { to: "/parking",       label: "Parking"       },
  { to: "/vendors",       label: "Vendors"       },
  { to: "/discussions",  label: "Discussions"   },
  { to: "/amenities",    label: "Amenities"     },
] as const;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/" state={{ from: location }} replace />;
  return <>{children}</>;
}

function AppShell() {
  const { logout } = useAuth();
  const { isAuthenticated, isLoading } = useAuthStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: S.paper }}>
      {isAuthenticated && (
        <header style={{
          borderBottom: `1px solid ${S.rule}`, padding: "0 2rem",
          display: "flex", alignItems: "center", gap: "2rem",
          height: 56, background: S.navy, color: S.paper,
        }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.8rem", letterSpacing: "0.12em", fontWeight: 700 }}>
            QUORUM
          </span>
          <nav style={{ display: "flex", gap: "1.5rem", marginLeft: "auto" }}>
            {NAV_TABS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) => ({
                  background: "none", border: "none",
                  color: isActive ? S.paper : S.inkLight,
                  fontFamily: S.mono, fontSize: "0.65rem",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  cursor: "pointer", padding: "0 0 2px", textDecoration: "none",
                  borderBottom: isActive ? `1px solid ${S.paper}` : "1px solid transparent",
                })}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={logout}
            style={{
              marginLeft: "2rem", background: "none",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.55)", fontFamily: S.mono,
              fontSize: "0.58rem", letterSpacing: "0.1em",
              textTransform: "uppercase", padding: "0.3rem 0.75rem", cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </header>
      )}

      <main style={{ flex: 1, padding: isAuthenticated ? "2.5rem 2rem" : "0", maxWidth: isAuthenticated ? 960 : "none", margin: "0 auto", width: "100%" }}>
        {!isLoading && (
          <Routes>
            <Route path="/"              element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
            <Route path="/register"      element={<ProtectedRoute><RegisterPage /></ProtectedRoute>} />
            <Route path="/dashboard"     element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/proposals"     element={<ProtectedRoute><ProposalsPage /></ProtectedRoute>} />
            <Route path="/treasury"      element={<ProtectedRoute><TreasuryPage /></ProtectedRoute>} />
            <Route path="/documents"     element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
            <Route path="/announcements" element={<ProtectedRoute><AnnouncementsPage /></ProtectedRoute>} />
            <Route path="/maintenance"   element={<ProtectedRoute><MaintenancePage /></ProtectedRoute>} />
            <Route path="/violations"    element={<ProtectedRoute><ViolationsPage /></ProtectedRoute>} />
            <Route path="/meetings"      element={<ProtectedRoute><MeetingsPage /></ProtectedRoute>} />
            <Route path="/calendar"      element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
            <Route path="/arc"           element={<ProtectedRoute><ArcPage /></ProtectedRoute>} />
            <Route path="/parking"       element={<ProtectedRoute><ParkingPage /></ProtectedRoute>} />
            <Route path="/vendors"       element={<ProtectedRoute><VendorsPage /></ProtectedRoute>} />
            <Route path="/discussions"   element={<ProtectedRoute><DiscussionsPage /></ProtectedRoute>} />
            <Route path="/amenities"     element={<ProtectedRoute><AmenitiesPage /></ProtectedRoute>} />
            <Route path="*"              element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
