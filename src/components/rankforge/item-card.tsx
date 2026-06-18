"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Pencil, ImageOff, CornerDownLeft, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRankForge } from "@/lib/store";
import { UNRANKED_ID, type TierItem } from "@/lib/tierlist";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { useVotingMode } from "./voting-context";
import { VoteButton } from "./voting-overlay";
import { toast } from "sonner";

const CARD_W = "w-[4.75rem] sm:w-24";
const CARD_H = "h-[4.75rem] sm:h-24";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface CardViewProps {
  item: TierItem;
  className?: string;
  dragging?: boolean;
  focusColor?: string;
  focusName?: string;
  assignedAvatarUrl?: string;
  assignedAvatarColor?: string;
  assignedAvatarName?: string;
}

/** Pure presentational card — used in the board and the drag overlay. */
function ItemCardView({
  item,
  className,
  dragging,
  focusColor,
  focusName,
  assignedAvatarUrl,
  assignedAvatarColor,
  assignedAvatarName,
}: CardViewProps) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = item.type === "image" && item.imageUrl && !imgError;

  return (
    <div
      className={cn(
        "group relative select-none overflow-hidden rounded-xl border bg-card shadow-sm",
        "transition-all duration-150 will-change-transform",
        dragging
          ? "rotate-2 scale-105 shadow-2xl border-white/30 ring-2 ring-violet-400/60"
          : "hover:-translate-y-0.5 hover:shadow-lg",
        focusColor
          ? "border-2"
          : "border-white/10 ring-1 ring-inset ring-white/[0.03]",
        CARD_W,
        CARD_H,
        className
      )}
      style={
        focusColor
          ? { borderColor: focusColor, boxShadow: `0 0 0 2px ${focusColor}40, 0 0 16px ${focusColor}30` }
          : undefined
      }
    >
      {showImage ? (
        <>
          <img
            src={item.imageUrl}
            alt={item.label}
            draggable={false}
            onError={() => setImgError(true)}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-1.5 pt-6">
            <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-white drop-shadow-sm">
              {item.label}
            </p>
          </div>
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center">
          {imgError ? (
            <ImageOff className="size-4 text-muted-foreground/70" />
          ) : (
            <span className="grid size-5 place-items-center rounded-md bg-white/[0.06] text-[10px] font-bold text-muted-foreground">
              {item.label.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="line-clamp-3 text-[11px] font-semibold leading-tight text-foreground/85">
            {item.label}
          </span>
        </div>
      )}

      {/* top gloss */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* focus avatar badge */}
      {focusColor && focusName ? (
        <div
          className="rf-no-export pointer-events-none absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-background text-[9px] font-bold text-white shadow-md"
          style={{ backgroundColor: focusColor }}
          title={`${focusName} is looking at this`}
        >
          {initials(focusName)}
        </div>
      ) : null}

      {/* assigned-user badge (bottom-left) */}
      {assignedAvatarColor ? (
        <div
          className="pointer-events-none absolute -bottom-1 -left-1 size-5 overflow-hidden rounded-full border-2 border-background shadow-md"
          title={`Assigned to ${assignedAvatarName ?? ""}`}
        >
          {assignedAvatarUrl ? (
            <img
              src={assignedAvatarUrl}
              alt={assignedAvatarName ?? ""}
              className="size-full object-cover"
            />
          ) : (
            <div
              className="grid size-full place-items-center text-[9px] font-bold text-white"
              style={{ backgroundColor: assignedAvatarColor }}
            >
              {assignedAvatarName ? initials(assignedAvatarName) : "?"}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface SortableItemCardProps {
  item: TierItem;
  containerId: string;
}

export function SortableItemCard({ item, containerId }: SortableItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { containerId, type: "item" } });

  const deleteItem = useRankForge((s) => s.deleteItem);
  const moveItem = useRankForge((s) => s.moveItem);
  const findContainerOf = useRankForge((s) => s.findContainerOf);
  const updateItemLabel = useRankForge((s) => s.updateItemLabel);
  const assignItem = useRankForge((s) => s.assignItem);
  const { votingMode } = useVotingMode();
  const { focuses, setFocus, clearFocus, status, members } = useMultiplayer();
  const assignedMember = item.assignedUserId
    ? members.find((m) => m.id === item.assignedUserId)
    : undefined;
  const [editOpen, setEditOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(item.label);

  React.useEffect(() => {
    setDraft(item.label);
  }, [item.label]);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const focus = focuses[item.id];
  const focusColor = focus?.userColor;
  const focusName = focus?.userName;

  // Soft-delete: move to unranked with undo toast. If already unranked, hard delete with confirm.
  const handleRemove = () => {
    const currentContainer = findContainerOf(item.id);
    if (currentContainer && currentContainer !== UNRANKED_ID) {
      moveItem(item.id, currentContainer, UNRANKED_ID, -1);
      toast(`Moved “${item.label}” to Unranked`, {
        description: "Undo to remove it permanently.",
        action: {
          label: "Undo",
          onClick: () => {
            if (currentContainer) moveItem(item.id, UNRANKED_ID, currentContainer, -1);
          },
        },
        duration: 5000,
      });
    } else {
      deleteItem(item.id);
      toast(`Removed “${item.label}”`, {
        action: {
          label: "Undo",
          onClick: () => {
            // Best-effort restore — re-add with same data.
            useRankForge.getState().addItem(
              { type: item.type, label: item.label, ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}) },
              UNRANKED_ID
            );
          },
        },
        duration: 5000,
      });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative", isDragging && "opacity-0")}
      onMouseEnter={() => {
        if (status === "connected") setFocus(item.id);
      }}
      onMouseLeave={() => {
        if (status === "connected") clearFocus();
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none active:cursor-grabbing"
      >
        <ItemCardView
          item={item}
          focusColor={focusColor}
          focusName={focusName}
          assignedAvatarColor={assignedMember?.color}
          assignedAvatarName={assignedMember?.name}
        />
      </div>

      {/* Hover actions — hidden in PNG export via rf-no-export */}
      <div
        onPointerDown={stop}
        data-rf-skip="true"
        className="rf-no-export absolute -right-1.5 -top-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100"
      >
        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="size-6 rounded-full border border-white/10 bg-background/95 text-foreground shadow-md backdrop-blur hover:bg-background"
              aria-label={`Rename ${item.label}`}
            >
              <Pencil className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="end">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Rename card
              </label>
              <Input
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateItemLabel(item.id, draft.trim() || item.label);
                    setEditOpen(false);
                  }
                  if (e.key === "Escape") {
                    setDraft(item.label);
                    setEditOpen(false);
                  }
                }}
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(item.label);
                    setEditOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    updateItemLabel(item.id, draft.trim() || item.label);
                    setEditOpen(false);
                  }}
                >
                  <CornerDownLeft className="size-3" /> Save
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {status === "connected" && members.length > 0 ? (
          <Popover open={assignOpen} onOpenChange={setAssignOpen}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className={cn(
                  "size-6 rounded-full border border-white/10 bg-background/95 shadow-md backdrop-blur hover:bg-background",
                  item.assignedUserId && "ring-2 ring-emerald-400/50"
                )}
                aria-label={`Assign ${item.label} to a user`}
              >
                <UserPlus className="size-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="end">
              <div className="space-y-1">
                <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  Assign to
                </p>
                {item.assignedUserId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    onClick={() => {
                      assignItem(item.id, undefined);
                      setAssignOpen(false);
                    }}
                  >
                    <X className="size-3.5" /> Unassign
                  </Button>
                ) : null}
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      assignItem(item.id, m.id);
                      setAssignOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-white/[0.06]",
                      item.assignedUserId === m.id && "bg-white/[0.04]"
                    )}
                  >
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: m.color }}
                    >
                      {initials(m.name)}
                    </span>
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        <Button
          size="icon"
          variant="secondary"
          className="size-6 rounded-full border border-white/10 bg-background/95 text-destructive shadow-md backdrop-blur hover:bg-destructive hover:text-white"
          aria-label={`Remove ${item.label}`}
          onClick={handleRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      <VoteButton item={item} votingMode={votingMode} />
    </div>
  );
}

/** Lightweight card used inside the DragOverlay (no sortable hooks). */
export function DragOverlayCard({ item }: { item: TierItem }) {
  return <ItemCardView item={item} dragging />;
}
