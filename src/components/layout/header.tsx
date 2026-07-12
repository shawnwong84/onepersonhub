"use client";

import { Bell, CheckCheck, Search, Sun, Moon, LogOut, User } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/lib/hooks/use-theme";
import { useRouter } from "next/navigation";
import { cn, formatRelativeTime } from "@/lib/utils";

interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  href: string;
  readAt?: string | null;
  createdAt: string;
}

interface CurrentUser {
  name: string;
  username: string;
  role: string;
  permissions: string[];
}

export function Header({ title, description, actions }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=8");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (
        notificationRef.current &&
        !notificationRef.current.contains(e.target as Node)
      ) {
        setNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          authenticated?: boolean;
          user?: { name: string; username: string; role: string };
          permissions?: string[];
        } | null) => {
          if (!cancelled && data?.authenticated && data.user) {
            setCurrentUser({
              name: data.user.name,
              username: data.user.username,
              role: data.user.role,
              permissions: data.permissions || [],
            });
          }
        }
      )
      .catch(() => {
        // Avatar just falls back to a generic icon; nothing else depends on this.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchNotifications();

    const events = new EventSource("/api/realtime?channel=global");
    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type === "notification") {
          fetchNotifications();
        }
      } catch {
        // Ignore heartbeat and malformed events.
      }
    };

    return () => events.close();
  }, [fetchNotifications]);

  const handleLogout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
  };

  const markNotificationRead = async (notification: NotificationData) => {
    if (!notification.readAt) {
      setUnreadCount((count) => Math.max(0, count - 1));
      setNotifications((items) =>
        items.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item
        )
      );
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id }),
      });
    }

    setNotificationOpen(false);
    if (notification.href) {
      router.push(notification.href);
    }
  };

  const markAllRead = async () => {
    setUnreadCount(0);
    setNotifications((items) =>
      items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
  };

  const toggleNotificationOpen = () => {
    setNotificationOpen((open) => {
      const opening = !open;
      // Clear the badge as soon as the panel is opened (persisted server-side
      // too), but leave each item's unread highlight in `notifications` alone
      // so the user can still see which ones were new during this viewing -
      // it'll only disappear on the next fetch.
      if (opening && unreadCount > 0) {
        setUnreadCount(0);
        fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markAllRead: true }),
        }).catch(() => {});
      }
      return opening;
    });
  };

  return (
    <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-owly-surface border-b border-owly-border transition-theme">
      <div className="animate-fade-in min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold text-owly-text truncate">{title}</h2>
        {description && (
          <p className="hidden sm:block text-sm text-owly-text-light mt-0.5 truncate">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {searchOpen && (
          <input
            type="text"
            placeholder="Search..."
            className="px-3 py-1.5 text-sm border border-owly-border rounded-lg bg-owly-surface text-owly-text focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary w-36 sm:w-64 animate-slide-in-down transition-theme"
            autoFocus
            onBlur={() => setSearchOpen(false)}
          />
        )}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="p-2 text-owly-text-light hover:text-owly-text hover:bg-owly-primary-50 rounded-lg transition-colors"
          title="Search"
        >
          <Search className="h-5 w-5" />
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 text-owly-text-light hover:text-owly-text hover:bg-owly-primary-50 rounded-lg transition-colors"
          title={theme === "light" ? "Dark mode" : "Light mode"}
        >
          {theme === "light" ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </button>

        <div className="relative" ref={notificationRef}>
          <button
            onClick={toggleNotificationOpen}
            className="relative p-2 text-owly-text-light hover:text-owly-text hover:bg-owly-primary-50 rounded-lg transition-colors"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-owly-danger px-1 text-[10px] font-bold leading-4 text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notificationOpen && (
            <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-lg border border-owly-border bg-owly-surface shadow-lg animate-scale-in transition-theme">
              <div className="flex items-center justify-between border-b border-owly-border px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-owly-text">Notifications</h3>
                  <p className="text-xs text-owly-text-light">
                    {unreadCount === 0
                      ? "No unread alerts"
                      : `${unreadCount} unread ${unreadCount === 1 ? "alert" : "alerts"}`}
                  </p>
                </div>
                <button
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-owly-primary hover:bg-owly-primary-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark read
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell className="mx-auto h-8 w-8 text-owly-text-light/40" />
                    <p className="mt-2 text-sm font-medium text-owly-text">
                      No notifications yet
                    </p>
                    <p className="mt-1 text-xs text-owly-text-light">
                      Workflow approvals and channel alerts will appear here.
                    </p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => markNotificationRead(notification)}
                      className={cn(
                        "block w-full border-b border-owly-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-owly-primary-50",
                        !notification.readAt && "bg-owly-primary-50/50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-1 h-2 w-2 flex-shrink-0 rounded-full",
                            notification.readAt
                              ? "bg-owly-border"
                              : notification.priority === "urgent"
                                ? "bg-owly-danger"
                                : "bg-amber-500"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-owly-text">
                              {notification.title}
                            </p>
                            <span className="flex-shrink-0 text-xs text-owly-text-light">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-owly-text-light">
                            {notification.message}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {actions}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title={currentUser?.name}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-owly-primary text-white text-sm font-medium hover:bg-owly-primary-dark transition-colors"
          >
            {currentUser?.name?.trim()?.charAt(0).toUpperCase() || "?"}
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-owly-surface border border-owly-border rounded-lg shadow-lg py-1 z-50 animate-scale-in transition-theme">
              {currentUser && (
                <div className="px-4 py-2 border-b border-owly-border">
                  <p className="text-sm font-medium text-owly-text truncate">{currentUser.name}</p>
                  <p className="text-xs text-owly-text-light capitalize">{currentUser.role}</p>
                </div>
              )}
              {currentUser?.permissions.includes("settings:read") && (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-owly-text hover:bg-owly-primary-50 transition-colors"
                >
                  <User className="h-4 w-4" />
                  Instance Settings
                </button>
              )}
              <div className="border-t border-owly-border my-1" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-owly-danger hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
