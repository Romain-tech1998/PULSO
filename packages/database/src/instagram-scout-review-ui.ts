import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDirectory = fileURLToPath(
  new URL('../ingestion-output/', import.meta.url)
);

interface CrosscheckedReport {
  reviewQueue: {
    generatedAt: string;
    items: Array<{
      reviewId: string;
      handle: string;
      caption?: string;
      permalink?: string;
      sourceTimestamp?: string;
      automation?: {
        decision: string;
        confidence: number;
        reasons: string[];
      };
      extraction?: {
        workingTitle?: string;
        dateMentions: string[];
        timeMentions: string[];
        priceMentions: string[];
        missingFacts: string[];
      };
    }>;
  };
  visualEvidence?: Record<string, { ocrText?: string }>;
  visualAnalysis?: Record<
    string,
    {
      triage?: { decision: string };
      possibleVenueMentions: string[];
    }
  >;
  officialCrosscheck?: {
    generatedAt: string;
    results: Array<{
      reviewId: string;
      venueSourceId: string;
      venueName: string;
      status: 'confirmed_by_official_venue_account' | 'no_official_match';
      matchedPermalink?: string;
      sharedDates: string[];
      sharedDistinctiveTerms: string[];
    }>;
  };
}

async function latestScoutReportPath(): Promise<string> {
  const allNames = await readdir(outputDirectory);
  // Prefer a crosschecked report (produced by instagram-scout-crosscheck.ts,
  // which this file's own CrosscheckedReport type expects) over the plain
  // pilot report it was derived from. Plain sort+reverse alone picks the
  // wrong one: "instagram-scout-pilot-<ts>.json" sorts *after*
  // "instagram-scout-pilot-<ts>-crosschecked.json" for the same timestamp
  // ('.' > '-' in ASCII), so the un-crosschecked report was silently used.
  const crosschecked = allNames
    .filter(
      (name) =>
        name.startsWith('instagram-scout-pilot-') &&
        name.endsWith('-crosschecked.json')
    )
    .sort()
    .reverse();
  if (crosschecked[0]) return join(outputDirectory, crosschecked[0]);

  const plain = allNames
    .filter(
      (name) =>
        name.startsWith('instagram-scout-pilot-') &&
        name.endsWith('.json') &&
        !name.endsWith('-crosschecked.json')
    )
    .sort()
    .reverse();
  const latest = plain[0];
  if (!latest) {
    throw new Error('No Instagram Scout report found.');
  }
  return join(outputDirectory, latest);
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, '\\u003c');
}

function buildReviewHtml(report: CrosscheckedReport): string {
  const itemById = new Map(
    report.reviewQueue.items.map((item) => [item.reviewId, item])
  );
  const crosscheckById = new Map(
    (report.officialCrosscheck?.results ?? []).map((result) => [
      result.reviewId,
      result
    ])
  );
  const postVisualUncertainIds = Object.entries(report.visualAnalysis ?? {})
    .filter(([, analysis]) => analysis.triage?.decision === 'uncertain')
    .map(([reviewId]) => reviewId);
  const uncertainIds =
    postVisualUncertainIds.length > 0
      ? postVisualUncertainIds
      : report.reviewQueue.items
          .filter((item) => item.automation?.decision === 'uncertain')
          .map((item) => item.reviewId);
  const candidateIds = new Set([...uncertainIds, ...crosscheckById.keys()]);
  const candidates = [...candidateIds].map((reviewId) => {
    const crosscheck = crosscheckById.get(reviewId);
    return {
      reviewId,
      venueName: crosscheck?.venueName ?? '',
      status: crosscheck?.status ?? 'not_crosschecked',
      item: itemById.get(reviewId),
      ocrText: report.visualEvidence?.[reviewId]?.ocrText ?? '',
      possibleVenueMentions:
        report.visualAnalysis?.[reviewId]?.possibleVenueMentions ?? []
    };
  });
  const embeddedData = safeJsonForHtml({
    generatedAt:
      report.officialCrosscheck?.generatedAt ?? report.reviewQueue.generatedAt,
    candidates
  });

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pulso Scout — Revue locale</title>
  <style>
    :root { color-scheme: dark; --bg:#09090b; --panel:#151518; --line:#2b2b31; --text:#f7f7f8; --muted:#9d9da7; --accent:#ff4f8b; --ok:#42d392; --warn:#ffc857; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top left,#24111b 0,transparent 32rem),var(--bg); color:var(--text); font:15px/1.5 system-ui,sans-serif; }
    button,select,textarea { font:inherit; }
    header { position:sticky; top:0; z-index:2; display:flex; justify-content:space-between; gap:24px; align-items:center; padding:20px 28px; background:rgba(9,9,11,.92); border-bottom:1px solid var(--line); backdrop-filter:blur(14px); }
    h1,h2,p { margin:0; } h1 { font-size:22px; } h2 { font-size:20px; }
    .eyebrow { color:var(--accent); font-size:12px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .summary { display:flex; gap:10px; flex-wrap:wrap; }
    .pill { padding:7px 11px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:#111114; }
    main { width:min(1180px,calc(100% - 32px)); margin:28px auto 100px; }
    .notice { padding:14px 16px; margin-bottom:20px; border:1px solid #634b16; border-radius:12px; background:#211b0d; color:#f6d57b; }
    .toolbar { display:flex; justify-content:space-between; gap:16px; align-items:center; margin:20px 0; }
    .toolbar select,.action { border:1px solid var(--line); border-radius:10px; background:#18181d; color:var(--text); padding:10px 12px; }
    .action { cursor:pointer; font-weight:700; } .action.primary { border-color:var(--accent); background:var(--accent); color:#18020a; }
    .grid { display:grid; gap:18px; }
    article { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr); gap:22px; padding:22px; border:1px solid var(--line); border-radius:16px; background:linear-gradient(145deg,rgba(31,31,36,.96),rgba(18,18,21,.96)); box-shadow:0 18px 50px rgba(0,0,0,.22); }
    .meta,.chips,.decision-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .meta { color:var(--muted); margin:7px 0 16px; }
    .chip { padding:5px 8px; border-radius:7px; background:#25252b; color:#c9c9d0; font-size:12px; }
    .chip.warning { color:#ffda7b; background:#35290d; }
    .evidence { margin-top:16px; padding:14px; border-left:3px solid var(--accent); border-radius:6px; background:#101013; white-space:pre-wrap; max-height:230px; overflow:auto; }
    .evidence + .evidence { border-color:#7c62ff; }
    a { color:#ff8cb4; } label { display:block; margin:0 0 7px; color:var(--muted); font-weight:700; }
    select,textarea { width:100%; border:1px solid var(--line); border-radius:10px; background:#0e0e11; color:var(--text); padding:11px; }
    textarea { min-height:118px; resize:vertical; }
    .review-controls { display:grid; gap:16px; align-content:start; }
    .state { font-size:13px; color:var(--warn); }
    .state.done { color:var(--ok); }
    .empty { padding:60px 20px; text-align:center; color:var(--muted); border:1px dashed var(--line); border-radius:14px; }
    footer { position:fixed; inset:auto 0 0; display:flex; justify-content:center; gap:12px; padding:14px; border-top:1px solid var(--line); background:rgba(9,9,11,.94); backdrop-filter:blur(14px); }
    @media (max-width:760px) { header { align-items:flex-start; flex-direction:column; } article { grid-template-columns:1fr; } .toolbar { align-items:stretch; flex-direction:column; } footer { justify-content:stretch; } footer button { flex:1; } }
  </style>
</head>
<body>
  <header>
    <div><div class="eyebrow">Pulso Scout</div><h1>Revue locale des preuves Instagram</h1></div>
    <div class="summary"><span class="pill" id="remaining"></span><span class="pill" id="completed"></span></div>
  </header>
  <main>
    <div class="notice">Aucune décision prise ici ne publie un événement. L’export reste une preuve opérateur à intégrer séparément après validation.</div>
    <div class="toolbar">
      <select id="filter" aria-label="Filtrer les candidats"><option value="all">Tous les candidats</option><option value="pending">À revoir</option><option value="done">Décision prise</option></select>
      <button class="action" id="clear">Effacer les décisions locales</button>
    </div>
    <div class="grid" id="cards"></div>
  </main>
  <footer><button class="action primary" id="export">Exporter les décisions JSON</button></footer>
  <script id="review-data" type="application/json">${embeddedData}</script>
  <script>
    const data = JSON.parse(document.getElementById('review-data').textContent);
    const storageKey = 'pulso-scout-review:' + data.generatedAt;
    const outcomes = [
      ['','Choisir une décision'],
      ['accepted','Accepter comme candidat événement'],
      ['duplicate','Doublon'],
      ['not_an_event','Pas un événement'],
      ['outside_mvp','Hors périmètre MVP'],
      ['insufficient_information','Informations insuffisantes'],
      ['stale','Information périmée'],
      ['source_unavailable','Source indisponible']
    ];
    let decisions = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const safeInstagramUrl = value => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && (url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com')) ? url.href : '';
      } catch { return ''; }
    };
    function save() { localStorage.setItem(storageKey, JSON.stringify(decisions)); renderSummary(); }
    function renderSummary() {
      const done = Object.values(decisions).filter(value => value.outcome).length;
      document.getElementById('completed').textContent = done + ' décision' + (done > 1 ? 's' : '');
      document.getElementById('remaining').textContent = (data.candidates.length - done) + ' à revoir';
    }
    function render() {
      const mode = document.getElementById('filter').value;
      const visible = data.candidates.filter(candidate => {
        const done = Boolean(decisions[candidate.reviewId]?.outcome);
        return mode === 'all' || (mode === 'done' ? done : !done);
      });
      document.getElementById('cards').innerHTML = visible.length ? visible.map(candidate => {
        const item = candidate.item || {};
        const extraction = item.extraction || {};
        const saved = decisions[candidate.reviewId] || {};
        const done = Boolean(saved.outcome);
        const permalink = safeInstagramUrl(item.permalink);
        const chips = [
          candidate.venueName,
          ...(extraction.dateMentions || []),
          ...(extraction.timeMentions || []),
          ...(extraction.priceMentions || [])
        ].map(value => '<span class="chip">' + escapeHtml(value) + '</span>').join('');
        return '<article data-id="' + escapeHtml(candidate.reviewId) + '">' +
          '<section><div class="eyebrow">@' + escapeHtml(item.handle) + '</div><h2>' + escapeHtml(extraction.workingTitle || candidate.reviewId) + '</h2>' +
          '<div class="meta"><span>' + escapeHtml(item.sourceTimestamp || 'Date inconnue') + '</span><span>•</span><span>' + escapeHtml(item.automation?.decision || 'non classé') + '</span></div>' +
          '<div class="chips">' + chips + '<span class="chip warning">Aucune correspondance officielle</span></div>' +
          (permalink ? '<p style="margin-top:14px"><a target="_blank" rel="noreferrer" href="' + escapeHtml(permalink) + '">Ouvrir la publication Instagram ↗</a></p>' : '') +
          '<div class="evidence"><strong>Légende</strong>\\n' + escapeHtml(item.caption || 'Aucune légende') + '</div>' +
          '<div class="evidence"><strong>Texte détecté dans le visuel</strong>\\n' + escapeHtml(candidate.ocrText || 'Aucun texte détecté') + '</div></section>' +
          '<section class="review-controls"><div><label>Décision humaine</label><select class="outcome">' + outcomes.map(([value,label]) => '<option value="' + value + '"' + (saved.outcome === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
          '<div><label>Notes de vérification</label><textarea class="notes" placeholder="Pourquoi cette décision ? Quelle preuve manque ?">' + escapeHtml(saved.notes || '') + '</textarea></div>' +
          '<div class="state ' + (done ? 'done' : '') + '">' + (done ? 'Décision enregistrée localement' : 'Décision requise') + '</div></section></article>';
      }).join('') : '<div class="empty">Aucun candidat dans ce filtre.</div>';
      document.querySelectorAll('article').forEach(card => {
        const id = card.dataset.id;
        card.querySelector('.outcome').addEventListener('change', event => {
          decisions[id] = { ...decisions[id], outcome:event.target.value, reviewedAt:new Date().toISOString() };
          save(); render();
        });
        card.querySelector('.notes').addEventListener('input', event => {
          decisions[id] = { ...decisions[id], notes:event.target.value };
          save();
        });
      });
      renderSummary();
    }
    document.getElementById('filter').addEventListener('change', render);
    document.getElementById('clear').addEventListener('click', () => { if (confirm('Effacer toutes les décisions enregistrées dans ce navigateur ?')) { decisions = {}; localStorage.removeItem(storageKey); render(); } });
    document.getElementById('export').addEventListener('click', () => {
      const payload = { generatedAt:new Date().toISOString(), sourceCrosscheckGeneratedAt:data.generatedAt, publicationAuthorized:false, decisions:data.candidates.map(candidate => ({ reviewId:candidate.reviewId, outcome:decisions[candidate.reviewId]?.outcome || 'needs_review', reviewerNotes:decisions[candidate.reviewId]?.notes || '', reviewedAt:decisions[candidate.reviewId]?.reviewedAt })) };
      const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'pulso-scout-decisions.json'; link.click(); URL.revokeObjectURL(link.href);
    });
    render();
  </script>
</body>
</html>`;
}

async function main(): Promise<void> {
  const inputPath = await latestScoutReportPath();
  const report = JSON.parse(
    await readFile(inputPath, 'utf8')
  ) as CrosscheckedReport;
  const outputPath = join(outputDirectory, 'instagram-scout-review.html');
  await writeFile(outputPath, buildReviewHtml(report), 'utf8');
  const postVisualUncertainIds = Object.entries(report.visualAnalysis ?? {})
    .filter(([, analysis]) => analysis.triage?.decision === 'uncertain')
    .map(([reviewId]) => reviewId);
  const uncertainIds =
    postVisualUncertainIds.length > 0
      ? postVisualUncertainIds
      : report.reviewQueue.items
          .filter((item) => item.automation?.decision === 'uncertain')
          .map((item) => item.reviewId);
  const reviewCandidateCount = new Set([
    ...uncertainIds,
    ...(report.officialCrosscheck?.results ?? []).map(
      (result) => result.reviewId
    )
  ]).size;
  console.log(
    JSON.stringify({
      inputPath,
      outputPath,
      reviewCandidates: reviewCandidateCount,
      uncertainCandidates: uncertainIds.length,
      publicationAuthorized: false
    })
  );
}

await main();
