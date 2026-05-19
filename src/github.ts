import { GH_TOKEN_B64 } from './reportConfig';

const OWNER = 'vinayak-vikram';
const REPO  = 'iupacbowl';
const FILE  = 'src/functionalGroups.ts';
const BASE  = 'main';

function token() { return atob(GH_TOKEN_B64); }

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return res.json();
}

function b64decode(s: string) {
  return decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
}

function b64encode(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}

export async function fetchCurrentFile(): Promise<{ content: string; sha: string }> {
  const data = await api(`/repos/${OWNER}/${REPO}/contents/${FILE}`);
  return { content: b64decode(data.content), sha: data.sha as string };
}

export async function submitReport(editedContent: string, note: string): Promise<string> {
  const id     = Date.now();
  const branch = `report/fix-${id}`;

  const [fileData, refData] = await Promise.all([
    api(`/repos/${OWNER}/${REPO}/contents/${FILE}`),
    api(`/repos/${OWNER}/${REPO}/git/ref/heads/${BASE}`),
  ]);

  // Splice the edited content back into the original file structure
  const original  = b64decode(fileData.content);
  const arrayStart = original.indexOf('export const FUNCTIONAL_GROUPS = [');
  const arrayEnd   = original.indexOf('] as const;') + '] as const;'.length;
  const newFile    = original.slice(0, arrayStart) + editedContent + original.slice(arrayEnd);

  await api(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: refData.object.sha }),
  });

  await api(`/repos/${OWNER}/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `chore: update functional groups [report-${id}]`,
      content: b64encode(newFile),
      sha: fileData.sha,
      branch,
    }),
  });

  const pr = await api(`/repos/${OWNER}/${REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `chore: functional group report [report-${id}]`,
      body: [
        note ? `**Reporter note:** ${note}` : null,
        `*Submitted via in-app report tool · id \`report-${id}\`*`,
      ].filter(Boolean).join('\n\n'),
      head: branch,
      base: BASE,
    }),
  });

  return pr.html_url as string;
}
