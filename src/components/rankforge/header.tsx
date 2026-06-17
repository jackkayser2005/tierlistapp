"use client";

import * as React from "react";
import { Flame, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { PresenceChip } from "./multiplayer-panel";
import { ControlPanelContent } from "./control-panel";

interface HeaderProps {
  onExportPng: () => void;
  exporting: boolean;
}

export function Header({ onExportPng, exporting }: HeaderProps) {
  const [panelOpen, setPanelOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="rf-brand grid size-8 place-items-center rounded-xl shadow-lg shadow-orange-500/20">
            <Flame className="size-4.5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold tracking-tight">
              <span className="rf-brand-text">RankForge</span>
            </span>
            <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">
              PoC
            </span>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <PresenceChip />
          <Button
            variant="outline"
            size="sm"
            onClick={onExportPng}
            disabled={exporting}
            className="hidden sm:inline-flex"
          >
            Export PNG
          </Button>
          <ThemeToggle />
          {/* Mobile panel trigger */}
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetTrigger asChild>
              <Button className="lg:hidden" size="sm">
                <SlidersHorizontal className="size-4" /> Customize
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="rf-scroll w-full overflow-y-auto p-0 sm:max-w-md"
            >
              <SheetHeader className="border-b border-white/[0.06] px-5 py-4">
                <SheetTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-amber-300" />
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
