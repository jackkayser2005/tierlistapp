"use client";

import * as React from "react";
import { Flame, SlidersHorizontal, ImageDown, FilePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useRankForge } from "@/lib/store";
import type { RankForgeBoard } from "@/lib/tierlist";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { ThemeToggle } from "./theme-toggle";
import { PresenceChip } from "./multiplayer-panel";
import { ControlPanelContent } from "./control-panel";

interface HeaderProps {
  onExportPng: () => void;
  exporting: boolean;
}

export function Header({ onExportPng, exporting }: HeaderProps) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const newBoard = useRankForge((s) => s.newBoard);
  const loadBoard = useRankForge((s) => s.loadBoard);
  const { canEdit } = useMultiplayer();

  const handleNewBoard = () => {
    const s = useRankForge.getState();
    const prev: RankForgeBoard = {
      title: s.title,
      description: s.description,
      tiers: s.tiers,
      items: s.items,
      tierItems: s.tierItems,
      unranked: s.unranked,
      bankedScores: s.bankedScores,
    };
    newBoard();
    toast.success("Started a fresh board", {
      description: "Empty S–D tiers, ready to fill.",
      action: { label: "Undo", onClick: () => loadBoard(prev) },
      duration: 6000,
    });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="rf-brand rf-glow grid size-8 place-items-center rounded-xl">
            <Flame className="size-4.5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-extrabold tracking-tight">
              <span className="rf-brand-text">RankForge</span>
            </span>
            <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground sm:inline">
              beta
            </span>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <PresenceChip />
          {canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewBoard}
              className="hidden gap-1.5 text-muted-foreground hover:text-foreground sm:inline-flex"
              title="Start a fresh, empty board"
            >
              <FilePlus className="size-4" />
              New
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={onExportPng}
            disabled={exporting}
            className="hidden gap-1.5 sm:inline-flex"
          >
            <ImageDown className="size-4" />
            {exporting ? "Rendering…" : "Export PNG"}
          </Button>
          <ThemeToggle />
          {/* Mobile panel trigger */}
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetTrigger asChild>
              <Button className="rf-btn-primary lg:hidden" size="sm">
                <SlidersHorizontal className="size-4" /> Customize
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="rf-scroll w-full overflow-y-auto p-0 sm:max-w-md"
            >
              <SheetHeader className="border-b border-white/[0.06] px-5 py-4">
                <SheetTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-violet-300" />
                  Customize
                </SheetTitle>
              </SheetHeader>
              <div className="px-5 py-5">
                <MobilePanelContent
                  onExportPng={onExportPng}
                  exporting={exporting}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function MobilePanelContent({
  onExportPng,
  exporting,
}: {
  onExportPng: () => void;
  exporting: boolean;
}) {
  return (
    <ControlPanelContent onExportPng={onExportPng} exporting={exporting} />
  );
}
