"use client";

import { useSyncExternalStore } from "react";
import { ArrowUp } from "lucide-react";

function subscribe(listener: () => void) {
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}
const getSnapshot = () => window.scrollY > 320;
const getServerSnapshot = () => false;

export default function BackToTop() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!visible) return null;
  return (
    <button
      type="button"
      className="back-to-top"
      aria-label="回到頂部"
      title="Back to top"
      onClick={() => {
        document.getElementById("main")?.focus({ preventScroll: true });
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant" : "smooth",
        });
      }}
    >
      <ArrowUp size={18} aria-hidden="true" />
      <span>回到頂部</span>
    </button>
  );
}
