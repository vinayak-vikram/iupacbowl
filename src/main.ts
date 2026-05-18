import './style.css';
import SmilesDrawer from 'smiles-drawer';
import { fetchRandomCompound, type Compound } from './pubchem';
import { FUNCTIONAL_GROUPS, detectFunctionalGroups, loadRDKit, type GroupId } from './functionalGroups';

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
      </div>
      <div id="iupac-name" hidden></div>
      <div id="meta"></div>
    </div>

    <div id="error" hidden></div>
  </div>
`;

const slider    = document.querySelector<HTMLInputElement>('#complexity')!;
const label     = document.querySelector<HTMLSpanElement>('#complexity-value')!;
const fetchBtn  = document.querySelector<HTMLButtonElement>('#fetch-btn')!;
const canvas    = document.querySelector<HTMLCanvasElement>('#structure')!;
const groupsEl  = document.querySelector<HTMLDivElement>('#groups')!;
const checkBtn  = document.querySelector<HTMLButtonElement>('#check-btn')!;
const nextBtn   = document.querySelector<HTMLButtonElement>('#next-btn')!;
const iupacEl   = document.querySelector<HTMLDivElement>('#iupac-name')!;
const metaEl    = document.querySelector<HTMLDivElement>('#meta')!;
const errorEl   = document.querySelector<HTMLDivElement>('#error')!;
const opts      = document.querySelectorAll<HTMLLabelElement>('.group-opt');
const boxes     = document.querySelectorAll<HTMLInputElement>('#group-grid input');

const drawer = new SmilesDrawer.Drawer({ width: 600, height: 380 });
const dark   = window.matchMedia('(prefers-color-scheme: dark)');

let correct: GroupId[] = [];

function reset() {
  boxes.forEach(b => { b.checked = false; b.disabled = false; });
  opts.forEach(o => o.removeAttribute('data-state'));
  iupacEl.hidden = true;
  checkBtn.hidden = false;
  nextBtn.hidden = true;
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
