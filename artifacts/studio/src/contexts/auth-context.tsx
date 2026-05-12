import { useState, useEffect, useCallback } from "react";

export interface AppUser {
  id: string;
  replitId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  profileImage: string | null;
  role: "designer" | "pm" | "admin";
  hourlyRate: number | null;
  createdAt: string;
}

// Module-level cache so all hook instances share the same data
let _user: AppUser | null = null;
let _allUsers: AppUser[] = [];
let _listeners: Set<() => void> = new Set();
let _initialFetchDone = false;

function notify() {
  _listeners.forEach((fn) => fn());
}

async function fetchCurrentUser(): Promise<AppUser | null> {
  try {
    const res = await fetch("/api/auth/user", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.authenticated) return null;
    return data.user;
  } catch {
    return null;
  }
}

async function fetchAllUsers(): Promise<AppUser[]> {
  try {
    const res = await fetch("/api/users");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function doInitialFetch() {
  if (_initialFetchDone) return;
  _initialFetchDone = true;
  const [u, all] = await Promise.all([fetchCurrentUser(), fetchAllUsers()]);
  _user = u;
  _allUsers = all;
  notify();
}

/**
 * Hook to get the current user.
 * Uses module-level shared state so all consumers stay in sync.
 */
export function useCurrentUser() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    _listeners.add(listener);
    doInitialFetch();
    return () => { _listeners.delete(listener); };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    _user = null;
    _initialFetchDone = false;
    notify();
    window.location.href = "/login";
  }, []);

  const role = _user?.role ?? "designer";

  return {
    user: _user,
    allUsers: _allUsers,
    isLoading: !_initialFetchDone,
    isDesigner: role === "designer",
    isPM: role === "pm",
    isAdmin: role === "admin",
    logout,
  };
}
