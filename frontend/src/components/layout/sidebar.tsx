import { Link, useRouterState } from "@tanstack/react-router";
import {
  Upload,
  History,
  FileText,
  Settings,
  HelpCircle,
  LogOut,
  User,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useAuth } from "@/contexts/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useTheme } from "@/contexts/theme-context";

export function Sidebar() {
  const router = useRouterState();
  const currentPath = router.location.pathname;

  return (
    <>
      {/* Spacer div that matches sidebar width */}
      <div className={cn("shrink-0 transition-all duration-300 w-64")} />
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r border-border bg-card transition-all duration-300 w-64"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <Link to="/dashboard" className="flex items-center gap-3">
              <img src="/auto-ss.png" alt="Logo" className="h-12 rounded-lg" />
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-3">
            <div className={cn("mb-4", "px-2")}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Documents
              </span>
            </div>

            <NavItem
              to="/dashboard"
              icon={Upload}
              label="Upload"
              active={currentPath === "/dashboard"}
            />
            <NavItem
              to="/dashboard/history"
              icon={History}
              label="History"
              active={currentPath === "/dashboard/history"}
            />
          </nav>

          {/* Footer */}
          {/* <div className="border-t border-border p-3 space-y-1">
            <NavItem
              to="/dashboard"
              icon={HelpCircle}
              label="Help & Support"
              active={false}
            />
            <NavItem
              to="/dashboard"
              icon={Settings}
              label="Settings"
              active={false}
            />
          </div> */}
          <div className="border-t border-border p-3">
            <UserProfile />
          </div>
        </div>
      </aside>
    </>
  );
}

function UserProfile() {
  const { user } = useAuth();
  const { toggleTheme, theme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-full justify-start cursor-pointer h-12"
        >
          <div className="flex items-center">
            <div className="flex items-center gap-2 justify-between px-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-sm font-semibold text-primary-foreground">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || "?"}
              </div>
            </div>
            <div className="flex flex-col items-start">
              <div className="text-sm font-medium leading-none">
                {user?.name || "User"}
              </div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right">
        <DropdownMenuItem onClick={() => toggleTheme()}>
          {theme === "light" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          {theme === "light" ? "Dark Mode" : "Light Mode"}
        </DropdownMenuItem>
        <DropdownMenuItem>
          <LogOut className="h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: string | number;
}

function NavItem({ to, icon: Icon, label, active, badge }: NavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0")} />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
          {badge}
        </span>
      )}
    </Link>
  );
}
