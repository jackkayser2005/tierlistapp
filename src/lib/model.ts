export type TierDefinition = {
  id: string;
  name: string;
  description: string;
  color: string;
};

export const DEFAULT_TIERS: TierDefinition[] = [
  { id: "S", name: "S", description: "Iconic", color: "#ff5c45" },
  { id: "A", name: "A", description: "Elite", color: "#ffb84d" },
  { id: "B", name: "B", description: "Solid", color: "#d8ff62" },
  { id: "C", name: "C", description: "Situational", color: "#68d5f2" },
  { id: "D", name: "D", description: "Liability", color: "#a78bfa" },
];

export type TierId = string;

export type Member = {
  id: string;
  name: string;
  color: string;
  avatar?: string;
};

export type VoteList = {
  id: string;
  title: string;
  prompt: string;
  emoji: string;
  status: "live" | "closed";
  createdAt: string;
  tiers: TierDefinition[];
  votes: Record<string, Record<string, TierId>>;
};

export type AppData = {
  version: 1;
  roomName: string;
  roomCode: string;
  members: Member[];
  lists: VoteList[];
};

const colors = ["#ff6b52", "#8b7cff", "#2ec4b6", "#f5a623", "#e75aa2", "#4687ff"];
const names = ["Jack", "Maya", "Theo", "Nina", "Miles", "Sasha"];

const members: Member[] = names.map((name, index) => ({
  id: name.toLowerCase(),
  name,
  color: colors[index],
}));

export function defaultTiers() {
  return DEFAULT_TIERS.map((tier) => ({ ...tier }));
}

export function createTierId() {
  return `tier-${crypto.randomUUID()}`;
}

function demoVotes(offset = 0): VoteList["votes"] {
  const results: VoteList["votes"] = {};
  members.forEach((member, subjectIndex) => {
    results[member.id] = {};
    members.slice(0, 3).forEach((voter, voterIndex) => {
      results[member.id][voter.id] = DEFAULT_TIERS[(subjectIndex + voterIndex + offset) % DEFAULT_TIERS.length].id;
    });
  });
  return results;
}

export function seedData(): AppData {
  return {
    version: 1,
    roomName: "Friday Night Council",
    roomCode: "VIBES",
    members,
    lists: [
      {
        id: "road-trip",
        title: "Road trip passenger",
        prompt: "Who gets the aux, and who gets left at the gas station?",
        emoji: "🚙",
        status: "live",
        createdAt: "2026-07-09",
        tiers: defaultTiers(),
        votes: demoVotes(),
      },
      {
        id: "survival",
        title: "Survives a horror movie",
        prompt: "Final girl energy or gone before the title card?",
        emoji: "🔦",
        status: "closed",
        createdAt: "2026-07-02",
        tiers: defaultTiers(),
        votes: demoVotes(2),
      },
      {
        id: "chef",
        title: "Cooks for the group",
        prompt: "Would you trust them with dinner?",
        emoji: "🍝",
        status: "closed",
        createdAt: "2026-06-28",
        tiers: defaultTiers(),
        votes: demoVotes(1),
      },
    ],
  };
}

export function castVote(data: AppData, listId: string, subjectId: string, voterId: string, tier: TierId): AppData {
  return {
    ...data,
    lists: data.lists.map((list) =>
      list.id === listId && list.tiers.some((item) => item.id === tier)
        ? { ...list, votes: { ...list.votes, [subjectId]: { ...list.votes[subjectId], [voterId]: tier } } }
        : list,
    ),
  };
}

export function updateList(data: AppData, listId: string, patch: Pick<VoteList, "title" | "prompt" | "emoji" | "status" | "tiers">): AppData {
  const tiers = normalizeTiers(patch.tiers);
  const validIds = new Set(tiers.map((tier) => tier.id));
  return {
    ...data,
    lists: data.lists.map((list) => {
      if (list.id !== listId) return list;
      const votes = Object.fromEntries(Object.entries(list.votes).map(([subjectId, subjectVotes]) => [
        subjectId,
        Object.fromEntries(Object.entries(subjectVotes).filter(([, tierId]) => validIds.has(tierId))),
      ]));
      return { ...list, ...patch, tiers, votes };
    }),
  };
}

export function consensus(list: VoteList, memberId: string) {
  const values = Object.values(list.votes[memberId] ?? {});
  if (!values.length) return { tier: null, average: 0, count: 0 };
  const score = (id: string) => {
    const index = list.tiers.findIndex((tier) => tier.id === id);
    return index < 0 ? 0 : list.tiers.length - index;
  };
  const average = values.reduce((sum, id) => sum + score(id), 0) / values.length;
  const tier = list.tiers.reduce((best, candidate) =>
    Math.abs(score(candidate.id) - average) < Math.abs(score(best.id) - average) ? candidate : best,
  );
  return { tier, average, count: values.length };
}

export function leaderboard(data: AppData) {
  return data.members
    .map((member) => {
      const scores = data.lists.flatMap((list) => {
        const result = consensus(list, member.id);
        return result.count && list.tiers.length > 1 ? [(result.average - 1) / (list.tiers.length - 1) * 4 + 1] : [];
      });
      return {
        member,
        score: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
        lists: scores.length,
      };
    })
    .sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name));
}

function normalizeTiers(input: unknown): TierDefinition[] {
  if (!Array.isArray(input)) return defaultTiers();
  const seen = new Set<string>();
  const tiers = input.slice(0, 8).flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as Partial<TierDefinition>;
    const id = typeof raw.id === "string" && raw.id && !seen.has(raw.id) ? raw.id : `tier-${index}-${crypto.randomUUID()}`;
    seen.add(id);
    return [{
      id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 12) : `Tier ${index + 1}`,
      description: typeof raw.description === "string" ? raw.description.trim().slice(0, 90) : "",
      color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_TIERS[index % DEFAULT_TIERS.length].color,
    }];
  });
  return tiers.length >= 2 ? tiers : defaultTiers();
}

export function readData(value: string | null): AppData | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value) as Partial<AppData>;
    if (data.version !== 1 || !Array.isArray(data.members) || !Array.isArray(data.lists) || typeof data.roomCode !== "string") return null;
    return {
      ...data,
      lists: data.lists.map((list) => ({ ...list, tiers: normalizeTiers(list.tiers) })),
    } as AppData;
  } catch {
    return null;
  }
}
