"use client";

import * as React from "react";
import {
  Plus,
  Type,
  Link as LinkIcon,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  ClipboardCopy,
  FolderOpen,
  RotateCcw,
  FilePlus,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRankForge, buildExport } from "@/lib/store";
import { normalizeBoard, type RankForgeBoard } from "@/lib/tierlist";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { ColorPicker } from "./color-picker";
import { MultiplayerPanel } from "./multiplayer-panel";
import { VotingControls } from "./voting-controls";
import { ActivityFeed } from "./activity-feed";
import { Leaderboard } from "./leaderboard";
import { downscaleImage, readFileAsDataURL, slugify } from "@/lib/image";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

function SectionShell({
  label,
  helper,
  children,
  action,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <span className="rf-section-label">{label}</span>
          {helper ? (
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              {helper}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddItemSection() {
  const addItem = useRankForge((s) => s.addItem);
  const { logActivity, status } = useMultiplayer();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [text, setText] = React.useState("");
  const [imgLabel, setImgLabel] = React.useState("");
  const [imgUrl, setImgUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const logAdd = (label: string) => {
    if (status === "connected") logActivity("added", label);
  };

  const addText = () => {
    const v = text.trim();
    if (!v) return;
    addItem({ type: "text", label: v });
    setText("");
    logAdd(v);
    toast.success("Card added to Unranked");
  };

  const addImageUrl = async () => {
    const url = imgUrl.trim();
    const label = imgLabel.trim() || "Image";
    if (!url) return;
    setBusy(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not load image URL"));
        img.src = url;
      });
      addItem({ type: "image", label, imageUrl: url });
      setImgUrl("");
      setImgLabel("");
      logAdd(label);
      toast.success("Image card added to Unranked");
    } catch {
      toast.error("That image URL couldn't be loaded");
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const raw = await readFileAsDataURL(file);
        const dataUrl = await downscaleImage(raw, 480, 0.85);
        const label = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Image";
        addItem({ type: "image", label, imageUrl: dataUrl });
        logAdd(label);
      }
      toast.success(
        `${files.length} image${files.length === 1 ? "" : "s"} added to Unranked`
      );
    } catch {
      toast.error("Could not process that image");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <SectionShell
      label="add items"
      helper="Cards land in Unranked — then drag them onto tiers."
    >
      <Tabs defaultValue="text" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="text" className="gap-1.5">
            <Type className="size-3.5" /> Text
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-1.5">
            <LinkIcon className="size-3.5" /> URL
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-1.5">
            <Upload className="size-3.5" /> Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-3">
          <div className="flex gap-2">
            <Input
              value={text}
              placeholder="e.g. The Office, Tacos, that meme…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addText();
              }}
            />
            <Button onClick={addText} size="icon" aria-label="Add text card">
              <Plus className="size-4" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="url" className="mt-3 space-y-2">
          <Input
            value={imgLabel}
            placeholder="Label (optional)"
            onChange={(e) => setImgLabel(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              value={imgUrl}
              placeholder="https://…/image.jpg"
              onChange={(e) => setImgUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addImageUrl();
              }}
            />
            <Button
              onClick={addImageUrl}
              size="icon"
              disabled={busy || !imgUrl.trim()}
              aria-label="Add image from URL"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-3.5 py-3 text-left transition hover:border-amber-300/40 hover:bg-white/[0.04] disabled:opacity-50"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-amber-300">
              <Upload className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {busy ? "Processing…" : "Upload images"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                PNG, JPG, GIF — multiple supported
              </span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </TabsContent>
      </Tabs>
    </SectionShell>
  );
}

function TiersSection() {
  const tiers = useRankForge((s) => s.tiers);
  const addTier = useRankForge((s) => s.addTier);
  const updateTier = useRankForge((s) => s.updateTier);
  const reorderTier = useRankForge((s) => s.reorderTier);
  const deleteTier = useRankForge((s) => s.deleteTier);

  return (
    <SectionShell
      label="manage tiers"
      helper={`${tiers.length} tier${tiers.length === 1 ? "" : "s"} — reorder, recolor, or add more.`}
      action={
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => {
            addTier();
            toast.success("Tier added");
          }}
        >
          <Plus className="size-3.5" /> Add
        </Button>
      }
    >
      <div className="space-y-1.5">
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            className="group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 transition hover:bg-white/[0.04]"
          >
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="size-7 shrink-0 rounded-md border border-white/10 transition hover:scale-105"
                  style={{ backgroundColor: tier.color }}
                  aria-label={`Change color for ${tier.name}`}
                />
              </PopoverTrigger>
              <PopoverContent className="w-60 p-3" align="start">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Tier color
                </p>
                <ColorPicker
                  value={tier.color}
                  onChange={(c) => updateTier(tier.id, { color: c })}
                />
              </PopoverContent>
            </Popover>

            <Input
              value={tier.name}
              maxLength={28}
              onChange={(e) => updateTier(tier.id, { name: e.target.value })}
              className="h-8 flex-1 border-transparent bg-transparent px-1.5 font-semibold shadow-none focus-visible:bg-white/[0.04]"
            />

            <div className="flex items-center opacity-60 transition group-hover:opacity-100">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === 0}
                onClick={() => reorderTier(tier.id, "up")}
                aria-label="Move tier up"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === tiers.length - 1}
                onClick={() => reorderTier(tier.id, "down")}
                aria-label="Move tier down"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  deleteTier(tier.id);
                  toast(`Tier “${tier.name}” deleted`, {
                    description: "Its items moved to Unranked.",
                  });
                }}
                aria-label="Delete tier"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function BoardSection() {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const setMeta = useRankForge((s) => s.setMeta);
  const resetBoard = useRankForge((s) => s.resetBoard);
  const newBoard = useRankForge((s) => s.newBoard);
  const loadBoard = useRankForge((s) => s.loadBoard);

  const snapshotBoard = (): RankForgeBoard => {
    const s = useRankForge.getState();
    return {
      title: s.title,
      description: s.description,
      tiers: s.tiers,
      items: s.items,
      tierItems: s.tierItems,
      unranked: s.unranked,
    };
  };

  const handleNew = () => {
    const prev = snapshotBoard();
    newBoard();
    toast.success("Started a fresh board", {
      description: "Empty S–D tiers, ready to fill.",
      action: { label: "Undo", onClick: () => loadBoard(prev) },
      duration: 6000,
    });
  };

  const handleStarter = () => {
    const prev = snapshotBoard();
    resetBoard();
    toast.success("Loaded the starter board", {
      action: { label: "Undo", onClick: () => loadBoard(prev) },
      duration: 6000,
    });
  };

  return (
    <SectionShell label="board settings">
      <div className="space-y-2">
        <Input
          value={title}
          maxLength={60}
          placeholder="Tier list title"
          onChange={(e) => setMeta({ title: e.target.value })}
        />
        <Textarea
          value={description}
          maxLength={140}
          placeholder="Short description"
          rows={2}
          onChange={(e) => setMeta({ description: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={handleNew} className="rf-btn-primary">
          <FilePlus className="size-4" /> New board
        </Button>
        <Button
          variant="outline"
          onClick={handleStarter}
          className="text-muted-foreground"
        >
          <RotateCcw className="size-4" /> Starter
        </Button>
      </div>
    </SectionShell>
  );
}

function ShareSection({ onExportPng, exporting }: { onExportPng: () => void; exporting: boolean }) {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const tiers = useRankForge((s) => s.tiers);
  const items = useRankForge((s) => s.items);
  const tierItems = useRankForge((s) => s.tierItems);
  const unranked = useRankForge((s) => s.unranked);
  const loadBoard = useRankForge((s) => s.loadBoard);
  const importRef = React.useRef<HTMLInputElement>(null);

  const getBoard = React.useCallback<() => RankForgeBoard>(
    () => ({
      title,
      description,
      tiers,
      items,
      tierItems,
      unranked,
    }),
    [title, description, tiers, items, tierItems, unranked]
  );

  const handleExport = () => {
    const payload = buildExport(getBoard());
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rankforge-${slugify(title)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported JSON file");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(buildExport(getBoard()), null, 2)
      );
      toast.success("Board JSON copied to clipboard");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleImportFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const board = normalizeBoard(parsed);
      loadBoard(board);
      toast.success("Tier list imported");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not import that file"
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <SectionShell label="save & share">
      {/* Primary: PNG export */}
      <Button
        onClick={onExportPng}
        disabled={exporting}
        className="rf-btn-primary w-full"
      >
        <ImageIcon className="size-4" />
        {exporting ? "Rendering…" : "Export as PNG"}
      </Button>

      {/* Secondary: JSON */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={handleExport}>
          <Download className="size-4" /> JSON
        </Button>
        <Button variant="outline" onClick={handleCopy}>
          <ClipboardCopy className="size-4" /> Copy
        </Button>
      </div>

      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={() => importRef.current?.click()}
      >
        <FolderOpen className="size-4" /> Import JSON
      </Button>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => handleImportFile(e.target.files)}
      />
      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Everything also auto-saves to this browser.
      </p>
    </SectionShell>
  );
}

interface ControlPanelContentProps {
  onExportPng: () => void;
  exporting: boolean;
  className?: string;
}

export function ControlPanelContent({
  onExportPng,
  exporting,
  className,
}: ControlPanelContentProps) {
  return (
    <div className={cn("space-y-7", className)}>
      <MultiplayerPanel />
      <Leaderboard />
      <VotingControls />
      <ActivityFeed />
      <AddItemSection />
      <TiersSection />
      <BoardSection />
      <ShareSection onExportPng={onExportPng} exporting={exporting} />
    </div>
  );
}
