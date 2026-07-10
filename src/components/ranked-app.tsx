"use client";

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Flame,
  ListPlus,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trophy,
  Trash2,
  Upload,
  Users,
  Vote,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  castVote,
  consensus,
  createTierId,
  defaultTiers,
  leaderboard,
  readData,
  seedData,
  updateList,
  type AppData,
  type Member,
  type TierDefinition,
  type TierId,
  type VoteList,
} from "@/lib/model";

const STORAGE_KEY = "ranked-room-v1";
type Tab = "vote" | "results" | "people";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ member, size = "md", ring = false }: { member: Member; size?: "sm" | "md" | "lg" | "xl"; ring?: boolean }) {
  return (
    <span
      className={`avatar avatar-${size}${ring ? " avatar-ring" : ""}`}
      style={{ "--avatar": member.color } as CSSProperties}
      title={member.name}
    >
      {member.avatar ? <img src={member.avatar} alt={member.name} /> : <span>{initials(member.name)}</span>}
    </span>
  );
}

function MemberStack({ members, limit = 4 }: { members: Member[]; limit?: number }) {
  return (
    <span className="member-stack" aria-label={`${members.length} members`}>
      {members.slice(0, limit).map((member) => <Avatar key={member.id} member={member} size="sm" />)}
      {members.length > limit ? <span className="stack-more">+{members.length - limit}</span> : null}
    </span>
  );
}

function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error(`${file.name} is not an image.`));
  if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error(`${file.name} is over 12 MB.`));
  return createImageBitmap(file).then((bitmap) => {
    const size = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 420;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process that photo.");
    context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 420, 420);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  });
}

function ListRail({ data, selected, onSelect, onAdd, onEdit, admin }: {
  data: AppData;
  selected: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: () => void;
  admin: boolean;
}) {
  return (
    <section className="list-rail" aria-label="Tier lists">
      <div className="section-heading">
        <div>
          <span className="eyebrow">The agenda</span>
          <h2>Pick a debate</h2>
        </div>
        {admin ? <div className="list-actions"><button className="text-button" onClick={onEdit}><Pencil size={14} /> Edit list</button><button className="text-button" onClick={onAdd}><Plus size={16} /> New list</button></div> : null}
      </div>
      <div className="list-scroll">
        {data.lists.map((list) => (
          <button key={list.id} className={`list-chip${selected === list.id ? " active" : ""}`} onClick={() => onSelect(list.id)}>
            <span className="list-emoji">{list.emoji}</span>
            <span><strong>{list.title}</strong><small>{list.status === "live" ? "Voting now" : "Results ready"}</small></span>
            {list.status === "live" ? <i>Live</i> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function VoteView({ data, list, viewer, subject, chosen, onVote, onMove }: {
  data: AppData;
  list: VoteList;
  viewer: Member;
  subject: Member;
  chosen: TierId | null;
  onVote: (tier: TierId) => void;
  onMove: (direction: number) => void;
}) {
  const completed = data.members.filter((member) => list.votes[member.id]?.[viewer.id]).length;
  const result = consensus(list, subject.id);
  const voterIds = Object.keys(list.votes[subject.id] ?? {});
  const voters = data.members.filter((member) => voterIds.includes(member.id));

  return (
    <div className="vote-layout">
      <section className="vote-stage">
        <div className="stage-top">
          <div><span className="live-pill"><i /> Live vote</span><h1>{list.title}</h1><p>{list.prompt}</p></div>
          <div className="progress-orb"><strong>{completed}</strong><span>of {data.members.length}</span></div>
        </div>

        <div className="subject-shell">
          <button className="round-button previous" onClick={() => onMove(-1)} aria-label="Previous person"><ChevronLeft /></button>
          <div className="subject-card" style={{ "--subject": subject.color } as CSSProperties}>
            <div className="card-glow" />
            <Avatar member={subject} size="xl" />
            <span className="subject-kicker">Up for debate</span>
            <h2>{subject.name}</h2>
            <div className="mini-consensus">
              <MemberStack members={voters} />
              <span>{result.count ? `${result.count} friend${result.count === 1 ? "" : "s"} voted` : "Be the first to vote"}</span>
            </div>
          </div>
          <button className="round-button next" onClick={() => onMove(1)} aria-label="Next person"><ChevronRight /></button>
        </div>

        <div className="tier-picker">
          <div className="picker-label"><span>Your vote</span><small>Tap once. You can change it later.</small></div>
          <div className="tier-buttons">
            {list.tiers.map((tier) => (
              <button
                key={tier.id}
                className={`tier-button${chosen === tier.id || list.votes[subject.id]?.[viewer.id] === tier.id ? " picked" : ""}`}
                style={{ "--tier": tier.color } as CSSProperties}
                onClick={() => onVote(tier.id)}
                aria-label={`Vote ${tier.name}, ${tier.description}`}
                title={tier.description}
              >
                <strong>{tier.name}</strong><span>{tier.description}</span>
                <i>{chosen === tier.id ? <Check size={16} strokeWidth={3} /> : null}</i>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="pulse-card">
        <div className="pulse-heading"><span><Sparkles size={17} /> Room pulse</span><small>Across every list</small></div>
        <div className="leader-preview">
          {leaderboard(data).slice(0, 4).map((entry, index) => (
            <div className="leader-row" key={entry.member.id}>
              <span className={`rank rank-${index + 1}`}>{index + 1}</span>
              <Avatar member={entry.member} size="md" />
              <span className="leader-name"><strong>{entry.member.name}</strong><small>{entry.lists} lists ranked</small></span>
              <strong className="leader-score">{entry.score.toFixed(1)}</strong>
            </div>
          ))}
        </div>
        <div className="privacy-note"><LockKeyhole size={17} /><span><strong>No peeking.</strong> Individual votes stay private; only the group result is shown.</span></div>
      </aside>
    </div>
  );
}

function ResultsView({ data, list }: { data: AppData; list: VoteList }) {
  const board = list.tiers.map((tier) => ({
    tier,
    members: data.members
      .map((member) => ({ member, result: consensus(list, member.id) }))
      .filter((entry) => entry.result.tier?.id === tier.id)
      .sort((a, b) => b.result.average - a.result.average),
  }));
  const ranking = data.members
    .map((member) => ({ member, ...consensus(list, member.id) }))
    .sort((a, b) => b.average - a.average);

  return (
    <div className="results-layout">
      <section className="results-main">
        <div className="results-hero">
          <span className="eyebrow light">The group has spoken</span>
          <h1>{list.title}</h1>
          <p>{list.prompt}</p>
          <div className="podium">
            {[ranking[1], ranking[0], ranking[2]].filter(Boolean).map((entry, index) => (
              <div className={`podium-person place-${[2, 1, 3][index]}`} key={entry.member.id}>
                {index === 1 ? <Crown className="crown" size={27} /> : null}
                <Avatar member={entry.member} size={index === 1 ? "lg" : "md"} ring />
                <strong>{entry.member.name}</strong><small>{entry.average.toFixed(1)}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="tier-board">
          {board.map(({ tier, members }) => (
            <div className="tier-row" key={tier.id}>
              <div className="tier-label" style={{ "--tier": tier.color } as CSSProperties}><strong>{tier.name}</strong><span>{tier.description}</span></div>
              <div className="tier-members">
                {members.length ? members.map(({ member, result }) => (
                  <div className="result-person" key={member.id}>
                    <Avatar member={member} size="md" />
                    <span><strong>{member.name}</strong><small>{result.count} vote{result.count === 1 ? "" : "s"} · {result.average.toFixed(1)}</small></span>
                  </div>
                )) : <span className="empty-tier">Nobody landed here</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PeopleView({ data, admin, onUpload, uploading, onRename, onRemove }: {
  data: AppData;
  admin: boolean;
  onUpload: () => void;
  uploading: boolean;
  onRename: (id: string, name: string) => void;
  onRemove: (member: Member) => void;
}) {
  return (
    <section className="people-view">
      <div className="people-hero">
        <div><span className="eyebrow">The suspects</span><h1>Your favorite people,<br />ready to be judged.</h1><p>Upload a photo for each friend. We crop and compress it automatically, so everything stays fast.</p></div>
        {admin ? <button className="primary-button" onClick={onUpload} disabled={uploading}><Upload size={18} /> {uploading ? "Processing…" : "Add photos"}</button> : null}
      </div>
      <div className="people-grid">
        {data.members.map((member, index) => (
          <article className="person-tile" key={member.id} style={{ "--subject": member.color } as CSSProperties}>
            <span className="person-number">{String(index + 1).padStart(2, "0")}</span>
            <Avatar member={member} size="xl" />
            {admin ? (
              <input value={member.name} maxLength={24} aria-label={`Name for ${member.name}`} onChange={(event) => onRename(member.id, event.target.value)} />
            ) : <h2>{member.name}</h2>}
            {admin && data.members.length > 2 ? <button className="remove-person" onClick={() => onRemove(member)} aria-label={`Remove ${member.name}`}><X size={15} /></button> : null}
          </article>
        ))}
        {admin ? <button className="add-person-tile" onClick={onUpload}><Camera size={28} /><strong>Add someone</strong><span>JPG, PNG or WebP</span></button> : null}
      </div>
    </section>
  );
}

function ListEditor({ list, onClose, onSave }: {
  list?: VoteList;
  onClose: () => void;
  onSave: (value: Pick<VoteList, "title" | "prompt" | "emoji" | "status" | "tiers">) => void;
}) {
  const [tiers, setTiers] = useState<TierDefinition[]>(() => (list?.tiers ?? defaultTiers()).map((tier) => ({ ...tier })));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function changeTier(id: string, patch: Partial<TierDefinition>) {
    setTiers((current) => current.map((tier) => tier.id === id ? { ...tier, ...patch } : tier));
  }

  function moveTier(index: number, direction: -1 | 1) {
    setTiers((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addTier() {
    if (tiers.length >= 8) return;
    const palette = defaultTiers();
    setTiers((current) => [...current, {
      id: createTierId(),
      name: `T${current.length + 1}`,
      description: "Describe this tier",
      color: palette[current.length % palette.length].color,
    }]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      title: String(form.get("title") ?? "").trim().slice(0, 50),
      prompt: String(form.get("prompt") ?? "").trim().slice(0, 140),
      emoji: String(form.get("emoji") || "🔥").slice(0, 4),
      status: form.get("status") === "closed" ? "closed" : "live",
      tiers,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="create-modal list-editor-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="list-editor-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
        <span className="modal-icon">{list ? <Pencil /> : <ListPlus />}</span>
        <span className="eyebrow">{list ? "List settings" : "Start something"}</span>
        <h2 id="list-editor-title">{list ? "Tune the debate" : "What are we ranking?"}</h2>
        <p>Keep the setup flexible and the voting simple. Each tier can carry its own meaning.</p>

        <div className="list-fields">
          <label><span>List name</span><input name="title" defaultValue={list?.title} maxLength={50} required autoFocus placeholder="Most likely to survive a road trip" /></label>
          <label><span>The prompt</span><textarea name="prompt" defaultValue={list?.prompt} maxLength={140} required placeholder="Who gets the aux, and who gets left at the gas station?" /></label>
          <label className="emoji-field"><span>Cover</span><input name="emoji" defaultValue={list?.emoji ?? "🔥"} maxLength={4} /></label>
          <label className="status-field"><span>Status</span><select name="status" defaultValue={list?.status ?? "live"}><option value="live">Live voting</option><option value="closed">Results only</option></select></label>
        </div>

        <div className="tier-editor-heading">
          <div><strong>Tiers</strong><span>Top is strongest · 2–8 tiers</span></div>
          <button type="button" className="text-button" onClick={addTier} disabled={tiers.length >= 8}><Plus size={15} /> Add tier</button>
        </div>
        <div className="tier-editor">
          {tiers.map((tier, index) => (
            <div className="tier-editor-row" key={tier.id} style={{ "--tier": tier.color } as CSSProperties}>
              <input className="tier-color" type="color" value={tier.color} onChange={(event) => changeTier(tier.id, { color: event.target.value })} aria-label={`Color for ${tier.name}`} />
              <label><span>Name</span><input value={tier.name} maxLength={12} required onChange={(event) => changeTier(tier.id, { name: event.target.value })} /></label>
              <label className="tier-description-field"><span>Description</span><input value={tier.description} maxLength={90} placeholder="What belongs in this tier?" onChange={(event) => changeTier(tier.id, { description: event.target.value })} /></label>
              <div className="tier-row-actions">
                <button type="button" disabled={index === 0} onClick={() => moveTier(index, -1)} aria-label={`Move ${tier.name} up`}><ArrowUp size={15} /></button>
                <button type="button" disabled={index === tiers.length - 1} onClick={() => moveTier(index, 1)} aria-label={`Move ${tier.name} down`}><ArrowDown size={15} /></button>
                <button type="button" disabled={tiers.length <= 2} onClick={() => setTiers((current) => current.filter((item) => item.id !== tier.id))} aria-label={`Remove ${tier.name}`}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
        {list ? <small className="editor-note">Removing a tier also clears votes previously cast for it.</small> : null}
        <button className="primary-button wide" type="submit"><Flame size={18} /> {list ? "Save changes" : "Launch the vote"}</button>
      </form>
    </div>
  );
}

export function RankedApp() {
  const [data, setData] = useState<AppData>(seedData);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("vote");
  const [selectedListId, setSelectedListId] = useState("road-trip");
  const [viewerId, setViewerId] = useState("jack");
  const [admin, setAdmin] = useState(true);
  const [subjectIndex, setSubjectIndex] = useState(0);
  const [chosen, setChosen] = useState<TierId | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = readData(localStorage.getItem(STORAGE_KEY));
    if (stored) setData(stored);
    setHydrated(true);
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const incoming = readData(event.newValue);
        if (incoming) setData(incoming);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const list = data.lists.find((item) => item.id === selectedListId) ?? data.lists[0];
  const viewer = data.members.find((member) => member.id === viewerId) ?? data.members[0];
  const subject = data.members[subjectIndex % data.members.length] ?? data.members[0];
  const roomRanking = useMemo(() => leaderboard(data), [data]);

  function moveSubject(direction: number) {
    setChosen(null);
    setSubjectIndex((index) => (index + direction + data.members.length) % data.members.length);
  }

  function voteFor(tier: TierId) {
    if (chosen) return;
    setChosen(tier);
    setData((current) => castVote(current, list.id, subject.id, viewer.id, tier));
    setToast(`${subject.name} → ${tier}. Vote saved.`);
    window.setTimeout(() => moveSubject(1), 320);
  }

  function selectList(id: string) {
    setSelectedListId(id);
    setSubjectIndex(0);
    setChosen(null);
  }

  function saveList(value: Pick<VoteList, "title" | "prompt" | "emoji" | "status" | "tiers">) {
    if (!value.title || !value.prompt) return;
    if (editorMode === "edit") {
      setData((current) => updateList(current, list.id, value));
      setEditorMode(null);
      setToast("List settings saved.");
      return;
    }
    const newList: VoteList = {
      id: crypto.randomUUID(),
      ...value,
      createdAt: new Date().toISOString(),
      votes: {},
    };
    setData((current) => ({
      ...current,
      lists: [newList, ...current.lists.map((item) => value.status === "live" ? { ...item, status: "closed" as const } : item)],
    }));
    setSelectedListId(newList.id);
    setEditorMode(null);
    setTab("vote");
    setToast("New debate is live.");
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length || !admin) return;
    setUploading(true);
    const accepted = Array.from(files).slice(0, Math.max(0, 32 - data.members.length));
    const added: Member[] = [];
    try {
      for (const file of accepted) {
        const avatar = await compressPhoto(file);
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "New friend";
        added.push({ id: crypto.randomUUID(), name: name.slice(0, 24), color: `hsl(${Math.floor(Math.random() * 360)} 75% 62%)`, avatar });
      }
      setData((current) => ({ ...current, members: [...current.members, ...added] }));
      setToast(`${added.length} ${added.length === 1 ? "friend" : "friends"} added.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Those photos could not be added.");
    } finally {
      setUploading(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  function renameMember(id: string, name: string) {
    setData((current) => ({ ...current, members: current.members.map((member) => member.id === id ? { ...member, name } : member) }));
  }

  function removeMember(member: Member) {
    if (!confirm(`Remove ${member.name} and their votes?`)) return;
    const nextMembers = data.members.filter((item) => item.id !== member.id);
    setData((current) => ({
      ...current,
      members: nextMembers,
      lists: current.lists.map((item) => ({
        ...item,
        votes: Object.fromEntries(Object.entries(item.votes)
          .filter(([subjectId]) => subjectId !== member.id)
          .map(([subjectId, votes]) => [subjectId, Object.fromEntries(Object.entries(votes).filter(([voterId]) => voterId !== member.id))])),
      })),
    }));
    if (viewerId === member.id) setViewerId(nextMembers[0].id);
  }

  function resetDemo() {
    if (!confirm("Reset the room to the original demo?")) return;
    const fresh = seedData();
    setData(fresh);
    setSelectedListId(fresh.lists[0].id);
    setViewerId(fresh.members[0].id);
    setToast("Demo reset.");
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(data.roomCode); } catch { /* clipboard can be blocked on non-secure local hosts */ }
    setToast(`Room code ${data.roomCode} copied.`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("vote")}><span className="brand-mark"><Flame size={20} fill="currentColor" /></span><span><strong>RANKED</strong><small>the group chat, ranked</small></span></button>
        <button className="room-code" onClick={copyCode}><span className="status-dot" /><span><small>{data.roomName}</small><strong>{data.roomCode}</strong></span><Copy size={15} /></button>
        <div className="top-actions">
          <MemberStack members={data.members} />
          <label className="viewer-select"><Avatar member={viewer} size="sm" /><span><small>Voting as</small><select value={viewer.id} onChange={(event) => { setViewerId(event.target.value); setChosen(null); }}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></span></label>
          <button className={`admin-toggle${admin ? " on" : ""}`} onClick={() => setAdmin((value) => !value)} title="Toggle admin preview"><Settings2 size={17} /><span>{admin ? "Admin" : "Voter"}</span></button>
        </div>
      </header>

      <nav className="tabs" aria-label="Main navigation">
        <button className={tab === "vote" ? "active" : ""} onClick={() => setTab("vote")}><Vote size={18} /> Vote</button>
        <button className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}><BarChart3 size={18} /> Results</button>
        <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}><Users size={18} /> People <span>{data.members.length}</span></button>
      </nav>

      <main>
        {tab !== "people" ? <ListRail data={data} selected={list.id} onSelect={selectList} onAdd={() => setEditorMode("create")} onEdit={() => setEditorMode("edit")} admin={admin} /> : null}
        {tab === "vote" ? <VoteView data={data} list={list} viewer={viewer} subject={subject} chosen={chosen} onVote={voteFor} onMove={moveSubject} /> : null}
        {tab === "results" ? <ResultsView data={data} list={list} /> : null}
        {tab === "people" ? <PeopleView data={data} admin={admin} onUpload={() => photoInput.current?.click()} uploading={uploading} onRename={renameMember} onRemove={removeMember} /> : null}
      </main>

      <footer>
        <span><Trophy size={16} /> Current room leader: <strong>{roomRanking[0]?.member.name}</strong></span>
        <button onClick={resetDemo}><RotateCcw size={14} /> Reset demo</button>
      </footer>

      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => uploadPhotos(event.target.files)} />

      {editorMode ? <ListEditor list={editorMode === "edit" ? list : undefined} onClose={() => setEditorMode(null)} onSave={saveList} /> : null}

      {toast ? <div className="toast"><Check size={17} /> {toast}</div> : null}
    </div>
  );
}
