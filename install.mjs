#!/usr/bin/env node

import { mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = join(homedir(), ".claude", "skills", "rootcause");
const source = join(__dirname, "SKILL.md");
const dest = join(skillDir, "SKILL.md");

// Create skill directory
mkdirSync(skillDir, { recursive: true });

// Copy SKILL.md
copyFileSync(source, dest);

console.log(`\n  ✓ rootcause skill installed to ${skillDir}\n`);
console.log("  usage:");
console.log('    /rootcause "uploads returning 500 errors"');
console.log('    /rootcause "builds failing since yesterday"');
console.log('    /rootcause "users can\'t log in on mobile"\n');
console.log("  chains with /autofix: npx autofix-skill\n");
