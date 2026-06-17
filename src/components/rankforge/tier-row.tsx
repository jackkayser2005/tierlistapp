"use client";

import * as React from "react";
import { ChevronUp, ChevronDown, Trash2, Palette } from "lucide-react";
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
    <div className="rf-rise group relative flex overflow-hidden rounded-2xl rf-panel">
      {/* Label cell — fixed width, refined gradient */}
      <div
        className="relative flex w-[4.5rem] shrink-0 flex-col items-center justify-between gap-1 py-2.5 sm:w-24 sm:py-3"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${tier.color} 92%, white 8%), color-mix(in srgb, ${tier.color} 62%, black 38%))`,
          color: textColor,
        }}
      >
        {/* soft highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(80% 50% at 50% 0%, rgba(255,255,255,0.5), transparent 70%)",
          }}
        />
        {/* tier name */}
        <div className="relative flex w-full items-center justify-center px-1">
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
            className="w-full bg-transparent text-center text-2xl font-black tracking-tight uppercase outline-none transition focus:rounded-md focus:bg-black/15 sm:text-[1.75rem]"
            style={{ color: textColor }}
            maxLength={14}
          />
        </div>

        {/* subtle controls — appear on hover, secondary */}
        <div
          className="rf-no-export relative flex items-center gap-0.5 rounded-full bg-black/15 px-1 py-0.5 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Popover open={colorOpen} onOpenChange={setColorOpen}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 rounded-full text-current hover:bg-black/25 hover:text-current"
                aria-label="Change tier color"
              >
                <Palette className="size-3.5" />
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
                className="size-6 rounded-full text-current hover:bg-black/25 hover:text-current disabled:opacity-25"
                aria-label="Move tier up"
                disabled={index === 0}
                onClick={() => reorderTier(tier.id, "up")}
              >
                <ChevronUp className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move up</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 rounded-full text-current hover:bg-black/25 hover:text-current disabled:opacity-25"
                aria-label="Move tier down"
                disabled={index === total - 1}
                onClick={() => reorderTier(tier.id, "down")}
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move down</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 rounded-full text-current hover:bg-black/35 hover:text-current"
                aria-label="Delete tier"
                onClick={() => {
                  deleteTier(tier.id);
                  toast(`Tier “${tier.name}” deleted`, {
                    description: "Its items moved to Unranked.",
                  });
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete tier</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Dropzone */}
      <div className="relative flex-1">
        <DroppableContainer
          id={tier.id}
          itemIds={tierItemIds}
          items={items}
          isHighlighted={isHighlighted}
          className="min-h-[6.5rem] sm:min-h-[7.5rem]"
          emptyState={
            <span className="text-xs text-muted-foreground/70">
              Drop cards here to rank them
            </span>
          }
        />
      </div>
    </div>
  );
}
