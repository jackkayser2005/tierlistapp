"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Pencil, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRankForge } from "@/lib/store";
import type { TierItem } from "@/lib/tierlist";

const CARD_SIZE = "size-20 sm:size-24 shrink-0";

interface CardViewProps {
  item: TierItem;
  className?: string;
  dragging?: boolean;
}

/** Pure presentational card — used both in the board and the drag overlay. */
function ItemCardView({ item, className, dragging }: CardViewProps) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = item.type === "image" && item.imageUrl && !imgError;

  return (
    <div
      className={cn(
        "group relative select-none overflow-hidden rounded-xl border border-white/10 bg-card/80 shadow-sm",
        "transition-transform duration-150 will-change-transform",
        dragging
          ? "rotate-2 scale-105 shadow-xl ring-2 ring-white/30"
          : "hover:-translate-y-0.5 hover:shadow-md",
        CARD_SIZE,
        className
      )}
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
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-1.5 pt-5">
            <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-white drop-shadow">
              {item.label}
            </p>
          </div>
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
          {imgError ? <ImageOff className="size-4 text-muted-foreground" /> : null}
          <span className="line-clamp-3 text-xs font-semibold leading-tight text-foreground/90">
            {item.label}
          </span>
        </div>
      )}

      {/* subtle top gloss */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
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
  const updateItemLabel = useRankForge((s) => s.updateItemLabel);
  const [editOpen, setEditOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(item.label);

  React.useEffect(() => {
    setDraft(item.label);
  }, [item.label]);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative", isDragging && "opacity-0")}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <ItemCardView item={item} />
      </div>

      {/* Action buttons — stop pointer propagation so they never start a drag */}
      <div
        onPointerDown={stop}
        className="absolute -right-1.5 -top-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100"
      >
        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="size-6 rounded-full border border-white/10 bg-background/90 shadow-md backdrop-blur"
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
                  Save
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="icon"
          variant="secondary"
          className="size-6 rounded-full border border-white/10 bg-background/90 text-destructive shadow-md backdrop-blur hover:bg-destructive hover:text-white"
          aria-label={`Remove ${item.label}`}
          onClick={() => deleteItem(item.id)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* grip hint */}
      <div className="pointer-events-none absolute bottom-1 left-1 text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="size-3.5" />
      </div>
    </div>
  );
}

/** Lightweight card used inside the DragOverlay (no sortable hooks). */
export function DragOverlayCard({ item }: { item: TierItem }) {
  return <ItemCardView item={item} dragging />;
}
