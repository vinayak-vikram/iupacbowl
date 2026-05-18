import './style.css';
import { fetchRandomCompound, type Compound } from './pubchem';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div id="quiz">
    <h1>chem practice</h1>

    <div id="controls">
      <label for="complexity">Complexity: <span id="complexity-value">5</span></label>
      <input type="range" id="complexity" min="1" max="10" value="5" />
      <button id="fetch-btn">Fetch Compound</button>
    </div>

    <div id="result" hidden>
      <div id="iupac-name"></div>
      <div id="meta"></div>
    </div>

    <div id="error" hidden></div>
  </div>
`;

const slider = document.querySelector<HTMLInputElement>('#complexity')!;
const complexityLabel = document.querySelector<HTMLSpanElement>('#complexity-value')!;
const fetchBtn = document.querySelector<HTMLButtonElement>('#fetch-btn')!;
const resultEl = document.querySelector<HTMLDivElement>('#result')!;
const iupacNameEl = document.querySelector<HTMLDivElement>('#iupac-name')!;
const metaEl = document.querySelector<HTMLDivElement>('#meta')!;
const errorEl = document.querySelector<HTMLDivElement>('#error')!;

slider.addEventListener('input', () => {
  complexityLabel.textContent = slider.value;
});

fetchBtn.addEventListener('click', async () => {
  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching...';
  resultEl.hidden = true;
  errorEl.hidden = true;

  try {
    const compound: Compound = await fetchRandomCompound(Number(slider.value));
    iupacNameEl.textContent = compound.iupacName;
    metaEl.textContent = `${compound.molecularFormula}, MW ${compound.molecularWeight}, ${compound.heavyAtomCount} heavy atoms, CID ${compound.cid}`;
    resultEl.hidden = false;
  } catch (err) {
    errorEl.textContent = String(err);
    errorEl.hidden = false;
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch Compound';
  }
});
