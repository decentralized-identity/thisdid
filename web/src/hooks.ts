import { useCallback, useEffect, useRef, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";
const isThemeMode = (value: string | null): value is ThemeMode =>
  value === "dark" || value === "light" || value === "system";

/** Theme with dark/light/system + persistence + live system-preference tracking. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem("thisdid-theme");
      return isThemeMode(saved) ? saved : "dark";
    } catch {
      return "dark";
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolved: "dark" | "light" =
    mode === "system" ? (systemDark ? "dark" : "light") : mode;

  const set = useCallback((m: ThemeMode) => {
    setMode(m);
    try {
      localStorage.setItem("thisdid-theme", m);
    } catch {
      /* ignore */
    }
  }, []);

  return { mode, resolved, set };
}

/** navigator.clipboard copy with a transient "copied" flag. */
export function useCopy(timeout = 1400) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(
    (text: string) => {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );
  return { copied, copy };
}
