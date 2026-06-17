"use client";

import * as React from "react";
import { ChevronUp, ChevronDown, Trash2, Palette, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRankForge } from "@/lib/store";
import { readableTextOn, type Tier } from "@/lib/tierlist";
import { ColorPicker } from "./color-picker";
import { DroppableContainer } from "./droppable-container";
import { toast } from "sonner";

interface TierRowProps {
  tier: Tier;
  index: number;
  total: number;
  isHighlighted: boolean;
}

export function TierRow({ tier, index, total, isHighlighted }: TierRowProps) {
  const items = useRankForge((s) => s.items);
  const tierItemIds = useRankForge((s) => s.tierItems[tier.id] ?? []);
  const updateTier = useRankForge((s) => s.updateTier);
  const reorderTier = useRankForge((s) => s.reorderTier);
  const deleteTier = useRankForge((s) => s.deleteTier);

  const textColor = readableTextOn(tier.color);
  const [colorOpen, setColorOpen] = React.useState(false);
  const [draftName, setDraftName] = React.useState(tier.name);

  React.useEffect(() => {
    setDraftName(tier.name);
  }, [tier.name]);

  const commitName = () => {
    const next = draftName.trim();
    if (next && next !== tier.name) updateTier(tier.id, { name: next });
    else setDraftName(tier.name);
  };

  return (
    <div className="rf-rise group flex overflow-hidden rounded-2xl glass">
      {/* Label cell */}
      <div
        className="relative flex w-20 shrink-0 flex-col justify-between p-2 sm:w-28 sm:p-3"
        style={{
          background: `linear-gradient(150deg, ${tier.color}, color-mix(in srgb, ${tier.color} 55%, #000))`,
          color: textColor,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.45), transparent 60%)",
          }}
        />
        <div className="relative flex items-start justify-center">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraftName(tier.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Tier name"
            className="w-full bg-transparent text-center text-2xl font-black tracking-tight uppercase outline-none transition focus:rounded-md focus:bg-black/20 sm:text-3xl"
            style={{ color: textColor }}
            maxLength={14}
          />
        </div>

        <div className="relative flex items-center justify-center gap-0.5">
          <Popover open={colorOpen} onOpenChange={setColorOpen}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-md text-current hover:bg-black/20 hover:text-current"
                aria-label="Change tier color"
              >
                <Palette className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Tier color
                </p>
                <ColorPicker
                  value={tier.color}
                  onChange={(c) => updateTier(tier.id, { color: c })}
                />
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-md text-current hover:bg-black/20 hover:text-current disabled:opacity-30"
                aria-label="Move tier up"
                disabled={index === 0}
                onClick={() => reorderTier(tier.id, "up")}
              >
                <ChevronUp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move up</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-md text-current hover:bg-black/20 hover:text-current disabled:opacity-30"
                aria-label="Move tier down"
                disabled={index === total - 1}
                onClick={() => reorderTier(tier.id, "down")}
              >
                <ChevronDown className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move down</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-md text-current hover:bg-black/30 hover:text-current"
                aria-label="Delete tier"
                onClick={() => {
                  deleteTier(tier.id);
                  toast(`Tier “${tier.name}” deleted`, {
                    description: "Its items moved to the Unranked pool.",
                  });
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete tier</TooltipContent>
          </Tooltip>
        </div>

        <GripVertical className="pointer-events-none absolute right-1 top-1 size-3.5 opacity-40" />
      </div>

      {/* Dropzone */}
      <div className="relative flex-1">
        <DroppableContainer
          id={tier.id}
          itemIds={tierItemIds}
          items={items}
          isHighlighted={isHighlighted}
          className="min-h-[7rem] sm:min-h-[8rem]"
          emptyState={
            <p className="text-xs text-muted-foreground">
              Drop cards here to rank them
            </p>
          }
        />
      </div>
    </div>
  );
}
