"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type NavDrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

/** Sidebar stays overlay/drawer below xl (covers tablet portrait + landscape). */
export const NAV_DRAWER_MQ = "(min-width: 1280px)";

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const mq = window.matchMedia(NAV_DRAWER_MQ);
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle]
  );

  return (
    <NavDrawerContext.Provider value={value}>
      {children}
    </NavDrawerContext.Provider>
  );
}

export function useNavDrawer(): NavDrawerContextValue {
  const ctx = useContext(NavDrawerContext);
  if (!ctx) {
    throw new Error("useNavDrawer must be used within NavDrawerProvider");
  }
  return ctx;
}
