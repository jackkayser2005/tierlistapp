"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RoomUser } from "@/lib/presence";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readableTextOn(hex: string): string {
  const c = hex.replace("#", "");
  const full =
    c.length === 3
      ? c.split("").map((ch) => ch + ch).join("")
      : c.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1a1f" : "#ffffff";
}

const PRESENCE_RING: Record<RoomUser["presence"], string> = {
  online: "ring-emerald-400/60",
  idle: "ring-amber-400/50",
  dragging: "ring-sky-400/70",
  voting: "ring-violet-400/70",
};

const PRESENCE_DOT: Record<RoomUser["presence"], string> = {
  online: "bg-emerald-400",
  idle: "bg-amber-400",
  dragging: "bg-sky-400",
  voting: "bg-violet-400",
};

export function Avatar({
  user,
  size = "md",
  showRing = true,
}: {
  user: RoomUser;
  size?: "sm" | "md";
  showRing?: boolean;
}) {
  const dim = size === "sm" ? "size-7 text-[11px]" : "size-9 text-xs";
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "grid place-items-center rounded-full font-bold ring-2 ring-offset-2 ring-offset-background",
          dim,
          showRing && PRESENCE_RING[user.presence]
        )}
        style={{
          backgroundColor: user.color,
          color: readableTextOn(user.color),
        }}
        title={`${user.name} · ${user.presence}`}
      >
        {initials(user.name)}
      </div>
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
          PRESENCE_DOT[user.presence]
        )}
      />
    </div>
  );
}

export function PresenceAvatars({
  members,
  hostId,
  max = 5,
}: {
  members: RoomUser[];
  hostId: string | null;
  max?: number;
}) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1.5 pr-2.5 transition hover:bg-white/[0.08]">
          <div className="flex -space-x-2">
            {visible.map((m) => (
              <div key={m.id} className="relative">
                <Avatar user={m} size="sm" />
              </div>
            ))}
            {overflow > 0 ? (
              <div className="grid size-7 place-items-center rounded-full bg-white/[0.08] text-[11px] font-bold ring-2 ring-background">
                +{overflow}
              </div>
            ) : null}
          </div>
          <span className="text-xs font-semibold text-foreground/80">
            {members.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            In the room
          </p>
          <span className="text-[11px] text-muted-foreground">
            {members.length}/10
          </span>
        </div>
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5">
              <Avatar user={m} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {m.name}
                  {hostId === m.id ? (
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                      host
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {m.presence}
                </p>
              </div>
            </div>
          ))}
          {members.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Nobody here yet
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
