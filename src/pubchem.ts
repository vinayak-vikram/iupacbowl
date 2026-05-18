const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

export interface Compound {
  cid: number;
  iupacName: string;
  molecularFormula: string;
  heavyAtomCount: number; //used as metric for complexity
  molecularWeight: number;
}

function complexityToConstraints(complexity: number): { maxCid: number; maxHeavyAtoms: number } {
  const t = (complexity - 1) / 9;
  return {
    maxHeavyAtoms: Math.round(1 + t * 19), //needs tuning TT
    maxCid: Math.round(100 * Math.pow(100, t)), //just based on random observations from the db
  };
}

function randomCids(count: number, maxCid: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * maxCid) + 1);
}

async function batchFetch(cids: number[]): Promise<Compound[]> {
  const props = 'IUPACName,MolecularFormula,HeavyAtomCount,MolecularWeight';
  const url = `${BASE}/compound/cid/${cids.join(',')}/property/${props}/JSON`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const rows: any[] = data?.PropertyTable?.Properties ?? [];
  return rows
    .filter((r) => r.IUPACName)
    .map((r) => ({
      cid: r.CID,
      iupacName: r.IUPACName,
      molecularFormula: r.MolecularFormula,
      heavyAtomCount: r.HeavyAtomCount,
      molecularWeight: r.MolecularWeight,
    }));
}

export async function fetchRandomCompound(complexity: number = 5): Promise<Compound> {
  const { maxCid, maxHeavyAtoms } = complexityToConstraints(complexity);

  for (let attempt = 0; attempt < 5; attempt++) { //cut?
    const cids = randomCids(20, maxCid);
    const compounds = await batchFetch(cids);
    const valid = compounds.filter((c) => c.heavyAtomCount <= maxHeavyAtoms);
    if (valid.length > 0) {
      return valid[Math.floor(Math.random() * valid.length)];
    }
  }

  throw new Error('no satisfactory compound found');
}
