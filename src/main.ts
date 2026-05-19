import './style.css';
import SmilesDrawer from 'smiles-drawer';
import { fetchRandomCompound, fetchCompoundBatch, type Compound } from './pubchem';
import { FUNCTIONAL_GROUPS, detectFunctionalGroups, loadRDKit, type GroupId } from './functionalGroups';
import { fetchCurrentFile, submitReport } from './github';

loadRDKit();

type Mode = 'fg' | 'props' | 'name';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div id="quiz">
    <div id="header">
      <h1>chem practice</h1>
      <span id="score-display"></span>
    </div>

    <nav id="tabs">
      <button class="tab active" data-mode="fg">Functional groups</button>
      <button class="tab" data-mode="props">Properties</button>
      <button class="tab" data-mode="name">Name it</button>
    </nav>

    <div id="controls">
      <label for="complexity">Complexity: <span id="complexity-value">5</span></label>
      <input type="range" id="complexity" min="1" max="10" value="5" />
      <button id="fetch-btn">New compound</button>
    </div>

    <canvas id="structure" hidden></canvas>

    <div id="fg-section" hidden>
      <div id="group-grid">
        ${FUNCTIONAL_GROUPS.map(g => `
          <label class="group-opt" data-id="${g.id}">
            <input type="checkbox" value="${g.id}" />
            <span>${g.label}</span>
          </label>`).join('')}
      </div>
      <div id="group-actions">
        <button id="hint-btn">Hint</button>
        <button id="check-btn">Check</button>
        <button id="next-btn" hidden>Next</button>
        <button id="report-btn" hidden>Report error</button>
      </div>
    </div>

    <div id="props-section" hidden>
      <div id="props-questions"></div>
      <div id="props-actions">
        <button id="props-check-btn">Check</button>
        <button id="props-next-btn" hidden>Next</button>
      </div>
    </div>

    <div id="name-section" hidden>
      <p class="quiz-prompt">Which is the correct IUPAC name?</p>
      <div id="name-options"></div>
      <button id="name-next-btn" hidden>Next</button>
    </div>

    <div id="iupac-name" hidden></div>
    <div id="meta"></div>
    <div id="error" hidden></div>
  </div>

  <div id="report-modal" hidden>
    <div id="report-panel">
      <h2>Report an error</h2>
      <p>Edit the <code>FUNCTIONAL_GROUPS</code> array entries below. Do not change anything outside the array — the CI will reject it.</p>
      <textarea id="report-textarea" spellcheck="false" placeholder="Loading…"></textarea>
      <label for="report-note">Describe your change (optional)</label>
      <input type="text" id="report-note" placeholder="e.g. Fixed ether SMARTS to exclude esters" />
      <div id="report-actions">
        <button id="report-cancel">Cancel</button>
        <button id="report-submit">Submit PR</button>
      </div>
      <div id="report-status"></div>
    </div>
  </div>
`;

// ── Shared elements ──────────────────────────────────────────────────────────
const slider       = document.querySelector<HTMLInputElement>('#complexity')!;
const complexLabel = document.querySelector<HTMLSpanElement>('#complexity-value')!;
const fetchBtn     = document.querySelector<HTMLButtonElement>('#fetch-btn')!;
const canvas       = document.querySelector<HTMLCanvasElement>('#structure')!;
const errorEl      = document.querySelector<HTMLDivElement>('#error')!;
const iupacEl      = document.querySelector<HTMLDivElement>('#iupac-name')!;
const metaEl       = document.querySelector<HTMLDivElement>('#meta')!;
const scoreEl      = document.querySelector<HTMLSpanElement>('#score-display')!;
const tabBtns      = document.querySelectorAll<HTMLButtonElement>('.tab');

// ── FG mode ──────────────────────────────────────────────────────────────────
const fgSection = document.querySelector<HTMLDivElement>('#fg-section')!;
const opts      = document.querySelectorAll<HTMLLabelElement>('.group-opt');
const boxes     = document.querySelectorAll<HTMLInputElement>('#group-grid input');
const hintBtn   = document.querySelector<HTMLButtonElement>('#hint-btn')!;
const checkBtn  = document.querySelector<HTMLButtonElement>('#check-btn')!;
const nextBtn   = document.querySelector<HTMLButtonElement>('#next-btn')!;
const reportBtn = document.querySelector<HTMLButtonElement>('#report-btn')!;

// ── Props mode ────────────────────────────────────────────────────────────────
const propsSection  = document.querySelector<HTMLDivElement>('#props-section')!;
const propsQsEl     = document.querySelector<HTMLDivElement>('#props-questions')!;
const propsCheckBtn = document.querySelector<HTMLButtonElement>('#props-check-btn')!;
const propsNextBtn  = document.querySelector<HTMLButtonElement>('#props-next-btn')!;

// ── Name mode ─────────────────────────────────────────────────────────────────
const nameSection = document.querySelector<HTMLDivElement>('#name-section')!;
const nameOptsEl  = document.querySelector<HTMLDivElement>('#name-options')!;
const nameNextBtn = document.querySelector<HTMLButtonElement>('#name-next-btn')!;

// ── Report modal ──────────────────────────────────────────────────────────────
const reportModal  = document.querySelector<HTMLDivElement>('#report-modal')!;
const reportTA     = document.querySelector<HTMLTextAreaElement>('#report-textarea')!;
const reportNote   = document.querySelector<HTMLInputElement>('#report-note')!;
const reportSubmit = document.querySelector<HTMLButtonElement>('#report-submit')!;
const reportCancel = document.querySelector<HTMLButtonElement>('#report-cancel')!;
const reportStatus = document.querySelector<HTMLDivElement>('#report-status')!;

const drawer = new SmilesDrawer.Drawer({ width: 600, height: 380 });
const dark   = window.matchMedia('(prefers-color-scheme: dark)');

// ── State ─────────────────────────────────────────────────────────────────────
let mode: Mode = 'fg';
let compound: Compound | null = null;
let correctGroups: GroupId[] = [];
let hintsShown: GroupId[] = [];
let score = { correct: 0, total: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateScore() {
  scoreEl.textContent = score.total > 0 ? `${score.correct} / ${score.total}` : '';
}

function drawCompound(c: Compound) {
  SmilesDrawer.parse(
    c.smiles,
    (tree: unknown) => {
      canvas.hidden = false;
      drawer.draw(tree, canvas, dark.matches ? 'dark' : 'light', false);
    },
    () => { canvas.hidden = true; },
  );
}

function showMeta(c: Compound) {
  metaEl.textContent = `${c.molecularFormula} · MW ${c.molecularWeight} · CID ${c.cid}`;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function setMode(m: Mode) {
  const prev = mode;
  mode = m;
  tabBtns.forEach(t => t.classList.toggle('active', t.dataset.mode === m));
  fgSection.hidden = true;
  propsSection.hidden = true;
  nameSection.hidden = true;
  iupacEl.hidden = true;
  errorEl.hidden = true;

  // Name mode needs a 4-compound batch — can't share with other modes
  const needsNewFetch = m === 'name' || prev === 'name';

  if (needsNewFetch || !compound) {
    canvas.hidden = true;
    metaEl.textContent = '';
    compound = null;
    return;
  }

  // Re-render current compound for the new mode — canvas stays visible
  if (m === 'fg') {
    fgReset();
    updateHintBtn();
    fgSection.hidden = false;
  } else if (m === 'props') {
    renderProps(compound);
    propsSection.hidden = false;
  }
}

tabBtns.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode as Mode)));

// ── Functional Groups mode ────────────────────────────────────────────────────
function fgReset() {
  boxes.forEach(b => { b.checked = false; b.disabled = false; });
  opts.forEach(o => o.removeAttribute('data-state'));
  iupacEl.hidden = true;
  checkBtn.hidden = false;
  nextBtn.hidden = true;
  reportBtn.hidden = true;
  hintBtn.disabled = false;
  hintsShown = [];
}

function updateHintBtn() {
  const remaining = correctGroups.filter(id => {
    const box = document.querySelector<HTMLInputElement>(`#group-grid input[value="${id}"]`);
    return box && !box.checked && !hintsShown.includes(id);
  });
  hintBtn.disabled = remaining.length === 0;
}

hintBtn.addEventListener('click', () => {
  const unhinted = correctGroups.filter(id => {
    const box = document.querySelector<HTMLInputElement>(`#group-grid input[value="${id}"]`);
    return box && !box.checked && !hintsShown.includes(id);
  });
  if (unhinted.length === 0) return;
  const pick = unhinted[Math.floor(Math.random() * unhinted.length)];
  hintsShown.push(pick);
  const lbl = document.querySelector<HTMLLabelElement>(`.group-opt[data-id="${pick}"]`);
  if (lbl) lbl.dataset.state = 'hint';
  updateHintBtn();
});

checkBtn.addEventListener('click', () => {
  const selected = new Set([...boxes].filter(b => b.checked).map(b => b.value as GroupId));
  opts.forEach(o => {
    const id      = o.dataset.id as GroupId;
    const present = correctGroups.includes(id);
    const checked = selected.has(id);
    const hinted  = hintsShown.includes(id);
    if (present && checked)         o.dataset.state = 'correct';
    else if (!present && checked)   o.dataset.state = 'wrong';
    else if (present && !checked)   o.dataset.state = hinted ? 'hinted' : 'missed';
    else                            o.removeAttribute('data-state');
  });
  boxes.forEach(b => { b.disabled = true; });

  const wrong  = [...selected].filter(id => !correctGroups.includes(id));
  const missed = correctGroups.filter(id => !selected.has(id));
  score.total++;
  if (wrong.length === 0 && missed.length === 0) score.correct++;
  updateScore();

  iupacEl.hidden = false;
  checkBtn.hidden = true;
  nextBtn.hidden = false;
  reportBtn.hidden = false;
  hintBtn.disabled = true;
});

nextBtn.addEventListener('click', fetchNew);

// ── Properties mode ───────────────────────────────────────────────────────────
type MCQOpt = { text: string; correct: boolean };

function calcDoU(formula: string): number {
  const counts: Record<string, number> = {};
  for (const [, el, n] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    counts[el] = (counts[el] ?? 0) + (n ? parseInt(n) : 1);
  }
  const C = counts['C'] ?? 0;
  const H = counts['H'] ?? 0;
  const N = counts['N'] ?? 0;
  const X = (counts['F'] ?? 0) + (counts['Cl'] ?? 0) + (counts['Br'] ?? 0) + (counts['I'] ?? 0);
  return (2 * C + 2 + N - H - X) / 2;
}

function mwOptions(mw: number): MCQOpt[] {
  const rounded = Math.round(mw / 10) * 10;
  const wrongs = shuffle([-160, -90, 90, 160]).slice(0, 3).map(d => Math.max(10, rounded + d));
  return shuffle([
    { text: `${rounded} g/mol`, correct: true },
    ...wrongs.map(v => ({ text: `${v} g/mol`, correct: false })),
  ]);
}

function douOptions(dou: number): MCQOpt[] {
  const pool = Array.from({ length: 12 }, (_, i) => i).filter(v => v !== dou);
  return shuffle([
    { text: String(dou), correct: true },
    ...shuffle(pool).slice(0, 3).map(v => ({ text: String(v), correct: false })),
  ]);
}

function countOptions(correct: number): MCQOpt[] {
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(v => v !== correct);
  return shuffle([
    { text: String(correct), correct: true },
    ...shuffle(pool).slice(0, 3).map(v => ({ text: String(v), correct: false })),
  ]);
}

function renderProps(c: Compound) {
  const dou = calcDoU(c.molecularFormula);
  const questions: { label: string; opts: MCQOpt[] }[] = [
    { label: 'Molecular weight',          opts: mwOptions(c.molecularWeight) },
    { label: 'Degree of unsaturation',    opts: douOptions(dou) },
    { label: 'Stereocenters',             opts: countOptions(c.stereocenters) },
    { label: 'H-bond donors',             opts: countOptions(c.hbondDonors) },
    { label: 'H-bond acceptors',          opts: countOptions(c.hbondAcceptors) },
  ];

  propsQsEl.innerHTML = questions.map((q, qi) => `
    <div class="prop-q" data-qi="${qi}">
      <p class="q-label">${q.label}</p>
      <div class="mcq-opts">
        ${q.opts.map((o, oi) => `
          <button class="mcq-opt" data-qi="${qi}" data-oi="${oi}" data-correct="${o.correct}">
            ${o.text}
          </button>`).join('')}
      </div>
    </div>
  `).join('');

  propsQsEl.querySelectorAll<HTMLButtonElement>('.mcq-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = btn.dataset.qi!;
      propsQsEl.querySelectorAll<HTMLButtonElement>(`.mcq-opt[data-qi="${qi}"]`)
        .forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  propsCheckBtn.hidden = false;
  propsNextBtn.hidden = true;
}

propsCheckBtn.addEventListener('click', () => {
  const questions = propsQsEl.querySelectorAll<HTMLDivElement>('.prop-q');
  let allCorrect = true;

  questions.forEach(q => {
    const btns     = q.querySelectorAll<HTMLButtonElement>('.mcq-opt');
    const selected = [...btns].find(b => b.classList.contains('selected'));
    btns.forEach(b => {
      b.disabled = true;
      if (b.dataset.correct === 'true') b.dataset.state = 'correct';
    });
    if (!selected || selected.dataset.correct !== 'true') {
      if (selected) selected.dataset.state = 'wrong';
      allCorrect = false;
    }
  });

  score.total++;
  if (allCorrect) score.correct++;
  updateScore();

  iupacEl.hidden = false;
  propsCheckBtn.hidden = true;
  propsNextBtn.hidden = false;
});

propsNextBtn.addEventListener('click', fetchNew);

// ── Name It mode ──────────────────────────────────────────────────────────────
function renderNameOpts(compounds: Compound[], correctIdx: number) {
  const options = shuffle(compounds.map((c, i) => ({ name: c.iupacName, correct: i === correctIdx })));

  nameOptsEl.innerHTML = options.map(o => `
    <button class="name-opt" data-correct="${o.correct}">${o.name}</button>
  `).join('');

  nameOptsEl.querySelectorAll<HTMLButtonElement>('.name-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      nameOptsEl.querySelectorAll<HTMLButtonElement>('.name-opt').forEach(b => {
        b.disabled = true;
        if (b.dataset.correct === 'true') b.dataset.state = 'correct';
        else if (b === btn)              b.dataset.state = 'wrong';
      });
      score.total++;
      if (btn.dataset.correct === 'true') score.correct++;
      updateScore();
      iupacEl.hidden = false;
      nameNextBtn.hidden = false;
    });
  });
}

nameNextBtn.addEventListener('click', fetchNew);

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchNew() {
  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching…';
  canvas.hidden = true;
  fgSection.hidden = true;
  propsSection.hidden = true;
  nameSection.hidden = true;
  iupacEl.hidden = true;
  metaEl.textContent = '';
  errorEl.hidden = true;

  try {
    if (mode === 'name') {
      const batch = await fetchCompoundBatch(Number(slider.value), 4);
      compound = batch[0];
      correctGroups = await detectFunctionalGroups(compound.smiles);
      drawCompound(compound);
      renderNameOpts(batch, 0);
      nameNextBtn.hidden = true;
      nameSection.hidden = false;
    } else if (mode === 'props') {
      compound = await fetchRandomCompound(Number(slider.value));
      correctGroups = await detectFunctionalGroups(compound.smiles);
      drawCompound(compound);
      renderProps(compound);
      propsSection.hidden = false;
    } else {
      compound = await fetchRandomCompound(Number(slider.value));
      correctGroups = await detectFunctionalGroups(compound.smiles);
      drawCompound(compound);
      fgReset();
      updateHintBtn();
      fgSection.hidden = false;
    }
    iupacEl.textContent = compound.iupacName;
    showMeta(compound);
  } catch (err) {
    errorEl.textContent = String(err);
    errorEl.hidden = false;
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'New compound';
  }
}

slider.addEventListener('input', () => { complexLabel.textContent = slider.value; });
fetchBtn.addEventListener('click', fetchNew);

// ── Report modal ──────────────────────────────────────────────────────────────
reportBtn.addEventListener('click', async () => {
  reportModal.hidden = false;
  reportTA.value = 'Loading…';
  reportTA.disabled = true;
  reportSubmit.disabled = true;
  reportStatus.textContent = '';
  reportNote.value = '';
  try {
    const { content } = await fetchCurrentFile();
    const start = content.indexOf('export const FUNCTIONAL_GROUPS = [');
    const end   = content.indexOf('] as const;') + '] as const;'.length;
    reportTA.value = content.slice(start, end);
  } catch (e) {
    reportTA.value = String(e);
  } finally {
    reportTA.disabled = false;
    reportSubmit.disabled = false;
  }
});

reportCancel.addEventListener('click', () => { reportModal.hidden = true; });

reportSubmit.addEventListener('click', async () => {
  reportSubmit.disabled = true;
  reportStatus.textContent = 'Submitting…';
  reportStatus.className = '';
  try {
    const url = await submitReport(reportTA.value, reportNote.value.trim());
    reportStatus.innerHTML = `PR opened: <a href="${url}" target="_blank">${url}</a>`;
    reportStatus.className = 'report-success';
  } catch (e) {
    reportStatus.textContent = String(e);
    reportStatus.className = 'report-error';
  } finally {
    reportSubmit.disabled = false;
  }
});
