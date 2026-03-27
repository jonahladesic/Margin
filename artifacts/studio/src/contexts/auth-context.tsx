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
    const res = await fetch("/api/current-user");
    if (!res.ok) return null;
    return await res.json();
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
 * Hook to get the current user + role switching.
 * Uses module-level shared state to avoid React Query dependency issues.
 */
export function useCurrentUser() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    _listeners.add(listener);
    doInitialFetch();
    return () => { _listeners.delete(listener); };
  }, []);

  const switchUser = useCallback(async (userId: string) => {
    try {
      const res = await fetch("/api/dev/switch-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) return;
      const newUser = await res.json();
      _user = newUser;
      notify();
      // Also reload the page to refresh all data for the new user
      window.location.reload();
    } catch {
      // ignore
    }
  }, []);

  const role = _user?.role ?? "designer";

  return {
    user: _user,
    allUsers: _allUsers,
    isLoading: !_initialFetchDone,
    isDesigner: role === "designer",
    isPM: role === "pm",
    isAdmin: role === "admin",
    switchUser,
    isSwitching: false,
  };
}
