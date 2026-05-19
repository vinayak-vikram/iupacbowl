import './style.css';
import SmilesDrawer from 'smiles-drawer';
import { fetchRandomCompound, type Compound } from './pubchem';
import { FUNCTIONAL_GROUPS, detectFunctionalGroups, loadRDKit, type GroupId } from './functionalGroups';
import { fetchCurrentFile, submitReport } from './github';

loadRDKit(); // warm up WASM in the background

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div id="quiz">
    <h1>chem practice</h1>

    <div id="controls">
      <label for="complexity">Complexity: <span id="complexity-value">5</span></label>
      <input type="range" id="complexity" min="1" max="10" value="5" />
      <button id="fetch-btn">New compound</button>
    </div>

    <canvas id="structure" hidden></canvas>

    <div id="groups" hidden>
      <div id="group-grid">
        ${FUNCTIONAL_GROUPS.map(g => `
          <label class="group-opt" data-id="${g.id}">
            <input type="checkbox" value="${g.id}" />
            <span>${g.label}</span>
          </label>`).join('')}
      </div>
      <div id="group-actions">
        <button id="check-btn">Check</button>
        <button id="next-btn" hidden>Next</button>
        <button id="report-btn" hidden>Report error</button>
      </div>
      <div id="iupac-name" hidden></div>
      <div id="meta"></div>
    </div>

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

const slider       = document.querySelector<HTMLInputElement>('#complexity')!;
const label        = document.querySelector<HTMLSpanElement>('#complexity-value')!;
const fetchBtn     = document.querySelector<HTMLButtonElement>('#fetch-btn')!;
const canvas       = document.querySelector<HTMLCanvasElement>('#structure')!;
const groupsEl     = document.querySelector<HTMLDivElement>('#groups')!;
const checkBtn     = document.querySelector<HTMLButtonElement>('#check-btn')!;
const nextBtn      = document.querySelector<HTMLButtonElement>('#next-btn')!;
const reportBtn    = document.querySelector<HTMLButtonElement>('#report-btn')!;
const iupacEl      = document.querySelector<HTMLDivElement>('#iupac-name')!;
const metaEl       = document.querySelector<HTMLDivElement>('#meta')!;
const errorEl      = document.querySelector<HTMLDivElement>('#error')!;
const opts         = document.querySelectorAll<HTMLLabelElement>('.group-opt');
const boxes        = document.querySelectorAll<HTMLInputElement>('#group-grid input');
const reportModal  = document.querySelector<HTMLDivElement>('#report-modal')!;
const reportTA     = document.querySelector<HTMLTextAreaElement>('#report-textarea')!;
const reportNote   = document.querySelector<HTMLInputElement>('#report-note')!;
const reportSubmit = document.querySelector<HTMLButtonElement>('#report-submit')!;
const reportCancel = document.querySelector<HTMLButtonElement>('#report-cancel')!;
const reportStatus = document.querySelector<HTMLDivElement>('#report-status')!;

const drawer = new SmilesDrawer.Drawer({ width: 600, height: 380 });
const dark   = window.matchMedia('(prefers-color-scheme: dark)');

let correct: GroupId[] = [];

function reset() {
  boxes.forEach(b => { b.checked = false; b.disabled = false; });
  opts.forEach(o => o.removeAttribute('data-state'));
  iupacEl.hidden = true;
  checkBtn.hidden = false;
  nextBtn.hidden = true;
  reportBtn.hidden = true;
}

function reveal() {
  const selected = new Set([...boxes].filter(b => b.checked).map(b => b.value as GroupId));
  opts.forEach(o => {
    const id = o.dataset.id as GroupId;
    const present  = correct.includes(id);
    const checked  = selected.has(id);
    if (present && checked)   o.dataset.state = 'correct';
    else if (!present && checked) o.dataset.state = 'wrong';
    else if (present && !checked) o.dataset.state = 'missed';
  });
  boxes.forEach(b => { b.disabled = true; });
  iupacEl.hidden = false;
  checkBtn.hidden = true;
  nextBtn.hidden = false;
  reportBtn.hidden = false;
}

async function fetchNew() {
  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching...';
  canvas.hidden = true;
  groupsEl.hidden = true;
  errorEl.hidden = true;

  try {
    const compound: Compound = await fetchRandomCompound(Number(slider.value));
    correct = await detectFunctionalGroups(compound.smiles);
    SmilesDrawer.parse(
      compound.smiles,
      (tree: unknown) => {
        canvas.hidden = false;
        drawer.draw(tree, canvas, dark.matches ? 'dark' : 'light', false);
      },
      () => { canvas.hidden = true; }
    );
    iupacEl.textContent  = compound.iupacName;
    metaEl.textContent   = `${compound.molecularFormula} · MW ${compound.molecularWeight} · CID ${compound.cid}`;
    reset();
    groupsEl.hidden = false;
  } catch (err) {
    errorEl.textContent = String(err);
    errorEl.hidden = false;
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'New compound';
  }
}

slider.addEventListener('input', () => { label.textContent = slider.value; });
fetchBtn.addEventListener('click', fetchNew);
checkBtn.addEventListener('click', reveal);
nextBtn.addEventListener('click', fetchNew);

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

reportCancel.addEventListener('click', () => {
  reportModal.hidden = true;
});

reportSubmit.addEventListener('click', async () => {
  reportSubmit.disabled = true;
  reportStatus.textContent = 'Submitting…';
  reportStatus.className = '';

  try {
    const url = await submitReport(reportTA.value, reportNote.value.trim());
    reportStatus.innerHTML = `PR opened: <a href="${url}" target="_blank">${url}</a>`;
    reportStatus.className = 'report-success';
    reportSubmit.disabled = false;
  } catch (e) {
    reportStatus.textContent = String(e);
    reportStatus.className = 'report-error';
    reportSubmit.disabled = false;
  }
});
