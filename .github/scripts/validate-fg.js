const { execSync } = require('child_process');
const fs = require('fs');

const base = process.env.BASE_REF;
if (!base) {
  console.error('BASE_REF env var not set');
  process.exit(1);
}

const changed = execSync(`git diff --name-only origin/${base}...HEAD`)
  .toString().trim().split('\n').filter(Boolean);

if (!changed.includes('src/functionalGroups.ts')) {
  console.log('functionalGroups.ts not modified — skipping');
  process.exit(0);
}

if (changed.some(f => f !== 'src/functionalGroups.ts')) {
  console.error('FAIL: When modifying functionalGroups.ts, no other files may change.');
  console.error('Changed files:', changed.join(', '));
  process.exit(1);
}

const baseContent = execSync(`git show origin/${base}:src/functionalGroups.ts`).toString();
const headContent = fs.readFileSync('src/functionalGroups.ts', 'utf8');

function splitAroundArray(content) {
  const start = content.indexOf('export const FUNCTIONAL_GROUPS = [');
  const end = content.indexOf('] as const;') + '] as const;'.length;
  if (start === -1 || end < start) {
    console.error('FAIL: Could not locate FUNCTIONAL_GROUPS array boundaries.');
    process.exit(1);
  }
  return { before: content.slice(0, start), after: content.slice(end) };
}

const b = splitAroundArray(baseContent);
const h = splitAroundArray(headContent);

if (b.before !== h.before || b.after !== h.after) {
  console.error('FAIL: Only the FUNCTIONAL_GROUPS array entries may be modified.');
  process.exit(1);
}

console.log('OK: only FUNCTIONAL_GROUPS array was modified.');
