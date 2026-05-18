const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

export interface Compound {
  cid: number;
  iupacName: string;
  molecularFormula: string;
  heavyAtomCount: number;
  molecularWeight: number;
  smiles: string;
}

const WEIGHTS: Record<string, number> = { C: 0.1, H: 0 };

function getWeight(formula: string): number {
  let c = 0;
  for (const [, element, n] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    const count = n ? parseInt(n) : 1;
    c += (WEIGHTS[element] ?? 1) * count;
  }
  return c;
}

function complexityToConstraints(complexity: number): { maxCid: number; maxHeavyAtoms: number } {
  const t = (complexity - 1) / 9;
  return {
    maxHeavyAtoms: Math.round(1 + t * 12),
    maxCid: Math.round(300 * Math.pow(100, t)),
  };
}

function sequentialCids(count: number, maxCid: number): number[] {
  const start = Math.max(1, Math.floor(Math.random() * (maxCid - count)));
  return Array.from({ length: count }, (_, i) => start + i);
}

async function batchFetch(cids: number[]): Promise<Compound[]> {
  const props = 'IUPACName,MolecularFormula,HeavyAtomCount,MolecularWeight,IsomericSMILES';
  const url = `${BASE}/compound/cid/${cids.join(',')}/property/${props}/JSON`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const rows: any[] = data?.PropertyTable?.Properties ?? [];
  return rows
    .filter((r) => r.IUPACName && r.SMILES)
    .map((r) => ({
      cid: r.CID,
      iupacName: r.IUPACName,
      molecularFormula: r.MolecularFormula,
      heavyAtomCount: r.HeavyAtomCount,
      molecularWeight: r.MolecularWeight,
      smiles: r.SMILES,
    }));
}

export async function fetchRandomCompound(complexity: number = 5): Promise<Compound> {
  const { maxCid, maxHeavyAtoms } = complexityToConstraints(complexity);

  for (let attempt = 0; attempt < 8; attempt++) {
    const cids = sequentialCids(200, maxCid);
    const compounds = await batchFetch(cids);
    const valid = compounds.filter((c) => getWeight(c.molecularFormula) <= maxHeavyAtoms);
    if (valid.length > 0) return valid[Math.floor(Math.random() * valid.length)];
  }

  throw new Error('no satisfactory compound found');
}
