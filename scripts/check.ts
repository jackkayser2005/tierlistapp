import assert from "node:assert/strict";
import { castVote, consensus, leaderboard, seedData, updateList } from "../src/lib/model.ts";

const original = seedData();
const emptyList = { ...original.lists[0], votes: {} };
const voted = castVote({ ...original, lists: [emptyList] }, emptyList.id, "maya", "jack", "S");

assert.equal(consensus(voted.lists[0], "maya").tier?.id, "S");
assert.equal(consensus(voted.lists[0], "maya").count, 1);
assert.equal(original.lists[0].votes.maya.jack, "A");
assert.equal(leaderboard(voted)[0].member.id, "maya");

const customTiers = [
  { id: "goat", name: "GOAT", description: "Best", color: "#ff0000" },
  { id: "fine", name: "Fine", description: "Middle", color: "#00ff00" },
  { id: "nope", name: "Nope", description: "Worst", color: "#0000ff" },
];
const customized = updateList(original, "road-trip", { ...original.lists[0], tiers: customTiers });
const customVoted = castVote(customized, "road-trip", "jack", "jack", "fine");
assert.equal(consensus(customVoted.lists[0], "jack").tier?.id, "fine");
assert.equal(consensus(customized.lists[0], "maya").count, 0, "removed tiers clear invalid votes");
assert.equal(castVote(customized, "road-trip", "maya", "jack", "missing").lists[0].votes.maya?.jack, undefined);
console.log("model check passed");
