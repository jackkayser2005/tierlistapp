"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_META,
  formatActivity,
  type ActivityEntry,
} from "@/lib/presence";
import { useMultiplayer, useActivityLog } from "@/hooks/use-multiplayer";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function ActivityIcon({ action }: { action: ActivityEntry["action"] }) {
  // Small colored dot reflecting the action tone.
  const tone = ACTIVITY_META[action]?.tone ?? "text-muted-foreground";
  return (
    <span
      className={cn(
        "mt-1 size-1.5 shrink-0 rounded-full",
        tone.replace("text-", "bg-")
      )}
    />
  );
}

export function ActivityFeed({ className }: { className?: string }) {
  const { status } = useMultiplayer();
  const activity = useActivityLog();
  const reversed = React.useMemo(() => [...activity].reverse(), [activity]);

  if (status !== "connected") return null;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="rf-section-label">activity</span>
        <span className="text-[10px] text-muted-foreground/60">
          live
        </span>
      </div>
      <div className="rf-inset rf-scroll max-h-56 overflow-y-auto rounded-xl p-2.5">
        {reversed.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground/70">
            No activity yet — make a move!
          </p>
        ) : (
          <ul className="space-y-2">
            {reversed.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2">
                <ActivityIcon action={entry.action} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug text-foreground/85">
                    {formatActivity(entry)}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                  {timeAgo(entry.ts)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
