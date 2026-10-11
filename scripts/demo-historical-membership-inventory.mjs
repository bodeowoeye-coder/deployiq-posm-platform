import { readFileSync } from "node:fs";
import { assembleHistoricalMembershipInventory } from "../lib/workspace/historicalMembershipInventory.ts";

const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/historical-membership-inventory.synthetic.json", import.meta.url), "utf8"));
const inventory = assembleHistoricalMembershipInventory(fixture);

process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
