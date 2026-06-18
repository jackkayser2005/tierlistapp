"use client";

import * as React from "react";
import { useMultiplayer } from "@/hooks/use-multiplayer";

/**
 * Renders live cursors for other connected users. Listens to global mousemove
 * and broadcasts position (throttled via rAF in the provider). Renders other
 * users' cursors as colored pointers with name labels.
 */
export function LiveCursors() {
  const { cursors, status, moveCursor, user } = useMultiplayer();

  // Broadcast our own cursor position on mousemove.
  React.useEffect(() => {
    if (status !== "connected") return;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      moveCursor(x, y);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [status, moveCursor]);

  if (status !== "connected") return null;

  return (
    <div className="rf-no-export pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Object.values(cursors).map((c) => {
        if (c.userId === user.id) return null; // don't render our own
        return (
          <div
            key={c.userId}
            className="absolute transition-transform duration-75 ease-out"
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              transform: "translate(-2px, -2px)",
            }}
          >
            {/* cursor pointer SVG */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="drop-shadow-md"
            >
              <path
                d="M3 2L17 9L10 11L7 17L3 2Z"
                fill={c.userColor}
                stroke="white"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            {/* name label */}
            <span
              className="absolute left-4 top-3 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md"
              style={{ backgroundColor: c.userColor }}
            >
              {c.userName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
