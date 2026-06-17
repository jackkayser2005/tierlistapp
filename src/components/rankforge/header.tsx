"use client";

import * as React from "react";
import { Flame, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useRankForge } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { ControlPanelContent } from "./control-panel";

export function Header() {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const setMeta = useRankForge((s) => s.setMeta);
  const [panelOpen, setPanelOpen] = React.useState(false);

  return (
    <header className="relative overflow-hidden">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(40rem 20rem at 80% -30%, color-mix(in oklch, oklch(0.74 0.19 55) 22%, transparent), transparent 70%)",
        }}
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-6 sm:px-6 sm:pt-8 lg:flex-row lg:items-center lg:justify-between lg:pt-10">
        <div className="flex items-start gap-3">
          <div className="brand-gradient-bg grid size-11 shrink-0 place-items-center rounded-2xl shadow-lg shadow-orange-500/20">
            <Flame className="size-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight sm:text-2xl">
                <span className="brand-gradient">RankForge</span>
              </h1>
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
                PoC
              </span>
            </div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Tier lists for the group chat — settle the debate.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Mobile panel trigger */}
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetTrigger asChild>
              <Button className="lg:hidden" variant="default">
                <SlidersHorizontal className="size-4" /> Customize
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="rf-scroll w-full overflow-y-auto p-0 sm:max-w-md"
            >
              <SheetHeader className="border-b border-white/10 px-5 py-4">
                <SheetTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-amber-300" />
                  Customize
                </SheetTitle>
              </SheetHeader>
              <div className="px-5 py-5">
                <ControlPanelContent />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Editable title + description */}
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-2 sm:px-6">
        <div className="glass rounded-2xl p-4 sm:p-5">
          <Input
            value={title}
            maxLength={60}
            placeholder="Untitled tier list"
            onChange={(e) => setMeta({ title: e.target.value })}
            className="border-0 bg-transparent px-0 text-lg font-bold tracking-tight shadow-none focus-visible:ring-0 sm:text-2xl"
          />
          <Input
            value={description}
            maxLength={140}
            placeholder="Add a short description…"
            onChange={(e) => setMeta({ description: e.target.value })}
            className="mt-1 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
    </header>
  );
}
