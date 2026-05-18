import type { RDKitModule } from '@rdkit/rdkit';

export const FUNCTIONAL_GROUPS = [
  { id: 'alkene',          label: 'Alkene',          smarts: '[CX3]=[CX3]' },
  { id: 'alkyne',          label: 'Alkyne',           smarts: '[CX2]#[CX2]' },
  { id: 'aromatic',        label: 'Aromatic',         smarts: 'a' },
  { id: 'halide',          label: 'Halide',           smarts: '[F,Cl,Br,I]' },
  { id: 'alcohol',         label: 'Alcohol',          smarts: '[OX2H][CX4]' },
  { id: 'phenol',          label: 'Phenol',           smarts: '[OX2H][c]' },
  { id: 'ether',           label: 'Ether',            smarts: '[OD2]([#6])[#6]' },
  { id: 'epoxide',         label: 'Epoxide',          smarts: '[OX2r3]' },
  { id: 'amine',           label: 'Amine',            smarts: '[NX3;!$(NC=O);!$([N+](=O)[O-]);!$(N#*)]' },
  { id: 'imine',           label: 'Imine',            smarts: '[CX3;$([H0][#6]),$([H1])]=[NX2;!$(N~[!#6])]' },
  { id: 'nitro',           label: 'Nitro',            smarts: '[$([NX3](=O)=O),$([NX3+](=O)[O-])]' },
  { id: 'nitrile',         label: 'Nitrile',          smarts: '[NX1]#[CX2]' },
  { id: 'thiol',           label: 'Thiol',            smarts: '[SX2H]' },
  { id: 'sulfide',         label: 'Sulfide',          smarts: '[#6][SX2][#6]' },
  { id: 'aldehyde',        label: 'Aldehyde',         smarts: '[CX3H1](=O)[#6]' },
  { id: 'ketone',          label: 'Ketone',           smarts: '[CX3](=O)([#6])[#6]' },
  { id: 'carboxylic_acid', label: 'Carboxylic acid',  smarts: '[CX3](=O)[OX2H1]' },
  { id: 'ester',           label: 'Ester',            smarts: '[CX3](=O)[OX2H0][#6]' },
  { id: 'enol',            label: 'Enol',             smarts: '[OX2H][CX3]=[CX3]' },
  { id: 'acid_halide',     label: 'Acid halide',      smarts: '[CX3](=O)[F,Cl,Br,I]' },
  { id: 'amide',           label: 'Amide',            smarts: '[CX3](=O)[NX3]' },
  { id: 'acid_anhydride',  label: 'Acid anhydride',   smarts: '[CX3](=O)O[CX3](=O)' },
] as const;

export type GroupId = (typeof FUNCTIONAL_GROUPS)[number]['id'];

let rdkit: RDKitModule | null = null;

export async function loadRDKit(): Promise<RDKitModule> {
  if (!rdkit) {
    const mod = await import('@rdkit/rdkit') as any;
    const init = mod.default ?? mod;
    rdkit = await init({ locateFile: () => '/RDKit_minimal.wasm' });
  }
  return rdkit!;
}

export async function detectFunctionalGroups(smiles: string): Promise<GroupId[]> {
  const RDKit = await loadRDKit();
  const mol = RDKit.get_mol(smiles);
  if (!mol) return [];

  const found: GroupId[] = [];
  try {
    for (const group of FUNCTIONAL_GROUPS) {
      const query = RDKit.get_qmol(group.smarts);
      if (!query) continue;
      try {
        const match = mol.get_substruct_match(query);
        if (match !== '{}') found.push(group.id);
      } finally {
        query.delete();
      }
    }
  } finally {
    mol.delete();
  }

  return found;
}
