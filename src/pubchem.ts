const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

export interface Compound {
  cid: number;
  iupacName: string;
  molecularFormula: string;
  heavyAtomCount: number;
  molecularWeight: number;
  smiles: string;
  hbondDonors: number;
  hbondAcceptors: number;
  stereocenters: number;
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

const PROPS = 'IUPACName,MolecularFormula,HeavyAtomCount,MolecularWeight,IsomericSMILES,HBondDonorCount,HBondAcceptorCount,DefinedAtomStereoCount';

async function batchFetch(cids: number[]): Promise<Compound[]> {
  const url = `${BASE}/compound/cid/${cids.join(',')}/property/${PROPS}/JSON`;
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
      hbondDonors: r.HBondDonorCount ?? 0,
      hbondAcceptors: r.HBondAcceptorCount ?? 0,
      stereocenters: r.DefinedAtomStereoCount ?? 0,
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

export async function fetchCompoundBatch(complexity: number, count: number): Promise<Compound[]> {
  const { maxCid, maxHeavyAtoms } = complexityToConstraints(complexity);
  const results: Compound[] = [];
  const seen = new Set<number>();
  for (let attempt = 0; attempt < 10 && results.length < count; attempt++) {
    const cids = sequentialCids(200, maxCid);
    const compounds = await batchFetch(cids);
    const valid = compounds.filter((c) => getWeight(c.molecularFormula) <= maxHeavyAtoms && !seen.has(c.cid));
    for (const c of valid) {
      if (results.length >= count) break;
      results.push(c);
      seen.add(c.cid);
    }
  }
  if (results.length < count) throw new Error('not enough compounds found');
  return results;
}
