"use client";

import * as React from "react";
import { Users, Copy, LogOut, Link2, Radio, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMultiplayer } from "@/hooks/use-multiplayer";

function PresenceBadge({ peers }: { peers: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
      <span className="rf-live-dot size-1.5 rounded-full bg-emerald-400" />
      {peers} online
    </span>
  );
}

export function MultiplayerPanel() {
  const {
    status,
    roomId,
    isHost,
    peers,
    hydrated,
    createRoom,
    joinRoom,
    leaveRoom,
    copyShareLink,
  } = useMultiplayer();

  const [joinCode, setJoinCode] = React.useState("");

  // Disconnected state — show create / join controls.
  if (status === "disconnected") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="rf-section-label">collab</span>
        </div>
        <div className="rf-inset rounded-xl p-3">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Go live and rank together in real time. Share a code with a friend
            and edit the same board.
          </p>
          <Button
            onClick={createRoom}
            className="w-full rf-brand text-white hover:opacity-90"
          >
            <Radio className="size-4" /> Start a live room
          </Button>
          <div className="my-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              or join
            </span>
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>
          <div className="flex gap-2">
            <Input
              value={joinCode}
              placeholder="Room code"
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && joinCode.trim()) {
                  joinRoom(joinCode.trim(), false);
                  setJoinCode("");
                }
              }}
              className="font-mono uppercase tracking-wider"
            />
            <Button
              variant="outline"
              disabled={!joinCode.trim()}
              onClick={() => {
                joinRoom(joinCode.trim(), false);
                setJoinCode("");
              }}
            >
              Join
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Connecting state.
  if (status === "connecting") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="rf-section-label">collab</span>
        </div>
        <div className="rf-inset flex items-center gap-2 rounded-xl p-3 text-sm text-muted-foreground">
          <Wifi className="size-4 animate-pulse" />
          Connecting…
        </div>
      </div>
    );
  }

  // Connected state — show room code, presence, share, leave.
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rf-section-label">collab</span>
        <PresenceBadge peers={peers} />
      </div>
      <div className="rf-inset rounded-xl p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Room code
            </p>
            <p className="font-mono text-lg font-bold tracking-[0.2em] text-foreground">
              {roomId}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              isHost
                ? "bg-amber-400/15 text-amber-300"
                : "bg-sky-400/15 text-sky-300"
            )}
          >
            {isHost ? "host" : "guest"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={copyShareLink}>
            <Link2 className="size-3.5" /> Copy link
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={leaveRoom}
          >
            <LogOut className="size-3.5" /> Leave
          </Button>
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/80">
          {peers <= 1
            ? "Waiting for a friend to join with your code…"
            : "Live — every change syncs instantly."}
        </p>
      </div>
    </div>
  );
}

/** Compact presence chip for the header. */
export function PresenceChip() {
  const { status, peers, roomId } = useMultiplayer();
  if (status !== "connected" || !roomId) return null;
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:inline-flex">
      <span className="rf-live-dot size-1.5 rounded-full bg-emerald-400" />
      <Users className="size-3" />
      {peers}
    </span>
  );
}
