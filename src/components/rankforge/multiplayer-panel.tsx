"use client";

import * as React from "react";
import {
  Radio,
  LogOut,
  Link2,
  Wifi,
  Users,
  Pencil,
  Check,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { PresenceAvatars } from "./avatars";
import { toast } from "sonner";

const AVATAR_COLORS = [
  "#f43f5e", "#fb7185", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
];

function ProfileEditor() {
  const { user, updateUser } = useMultiplayer();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(user.name);
  const [color, setColor] = React.useState(user.color);

  React.useEffect(() => {
    setName(user.name);
    setColor(user.color);
  }, [user.name, user.color]);

  const save = () => {
    updateUser({ name: name.trim() || "Guest", color });
    setOpen(false);
  };

  const shuffle = () => {
    const c = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    setColor(c);
  };

  const initials = user.name.trim().slice(0, 2).toUpperCase() || "G";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 transition hover:bg-white/[0.08]">
          <span
            className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: user.color }}
          >
            {initials}
          </span>
          <span className="max-w-[90px] truncate text-xs font-semibold">
            {user.name}
          </span>
          <Pencil className="size-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your profile
          </p>
          <Input
            value={name}
            maxLength={20}
            placeholder="Display name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Color</span>
              <button
                onClick={shuffle}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Shuffle className="size-3" /> Random
              </button>
            </div>
            <div className="grid grid-cols-9 gap-1.5">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-5 rounded-md transition hover:scale-110",
                    color.toLowerCase() === c.toLowerCase() &&
                      "ring-2 ring-white ring-offset-2 ring-offset-background"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={save}>
            <Check className="size-3.5" /> Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MultiplayerPanel() {
  const {
    status,
    roomId,
    isHost,
    peers,
    members,
    hostId,
    createRoom,
    joinRoom,
    leaveRoom,
    copyShareLink,
  } = useMultiplayer();

  const [joinCode, setJoinCode] = React.useState("");

  if (status === "disconnected") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="rf-section-label">live room</span>
        </div>
        <div className="rf-inset rounded-xl p-3">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Start a room, share the code, and rank together in real time. Up to
            10 friends can join.
          </p>
          <Button onClick={createRoom} className="rf-btn-primary w-full">
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
        <ProfileEditor />
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <div className="space-y-3">
        <span className="rf-section-label">live room</span>
        <div className="rf-inset flex items-center gap-2 rounded-xl p-3 text-sm text-muted-foreground">
          <Wifi className="size-4 animate-pulse" />
          Connecting…
        </div>
      </div>
    );
  }

  // Connected
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rf-section-label">live room</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
          <span className="rf-live-dot size-1.5 rounded-full bg-emerald-400" />
          {peers} online
        </span>
      </div>

      <div className="rf-inset rounded-xl p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Room code
            </p>
            <p className="font-mono text-xl font-black tracking-[0.18em] text-foreground">
              {roomId}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              isHost
                ? "bg-amber-400/15 text-amber-300"
                : "bg-sky-400/15 text-sky-300"
            )}
          >
            {isHost ? "host" : "guest"}
          </span>
        </div>

        {/* Presence avatars */}
        <div className="mt-3 flex items-center gap-2">
          <PresenceAvatars members={members} hostId={hostId} />
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
      </div>

      <ProfileEditor />
    </div>
  );
}

/** Compact presence chip for the header. */
export function PresenceChip() {
  const { status, members, peers } = useMultiplayer();
  if (status !== "connected") return null;
  return (
    <div className="hidden items-center sm:flex">
      <PresenceAvatars members={members} hostId={null} max={4} />
    </div>
  );
}
