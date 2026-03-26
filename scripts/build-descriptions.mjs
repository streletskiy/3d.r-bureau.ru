#!/usr/bin/env node
/**
 * Fetch product pages (the "Купить" links from README.md) and extract dimensions from field="descr".
 * Writes results to assets/data/descriptions.json so the static catalog can display them without CORS.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const normalizeSpace = (s) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const safeUrl = (url) => normalizeSpace(url);

const mdLink = (cell) => {
  const s = normalizeSpace(cell);
  const m = s.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!m) return null;
  return { text: normalizeSpace(m[1]), url: safeUrl(m[2]) };
};

const mdImage = (cell) => {
  const s = normalizeSpace(cell);
  const m = s.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (!m) return null;
  return safeUrl(m[1]);
};

const slugFromPath = (p) => {
  const s = String(p || "");
  const m = s.match(/^([a-z0-9-]+)\//i);
  return m ? m[1] : "";
};

const parseReadmeItems = (md) => {
  const lines = String(md || "").split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l.startsWith("|")) continue;
    if (l.includes("|:") && l.includes("---")) continue;
    if (/\|\s*Название\s*\|/i.test(l)) continue;
    if (!l.includes("](")) continue;
    rows.push(l);
  }

  const items = [];
  for (const row of rows) {
    const rawCells = row.split("|").map((c) => c.trim());
    const cells = rawCells.filter(
      (c, idx) => !(c === "" && (idx === 0 || idx === rawCells.length - 1)),
    );
    if (cells.length < 4) continue;

    const name = mdLink(cells[0]);
    const preview = mdImage(cells[1]);
    const view = mdLink(cells[3]);
    if (!name || !view) continue;

    const slug = slugFromPath(preview || view.url);
    const externalUrl = name.url || "";
    if (!slug || !externalUrl) continue;

    items.push({ slug, externalUrl, title: name.text || slug });
  }
  return items;
};

const decodeEntities = (s) =>
  String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const htmlToText = (html) => {
  let s = String(html || "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, "\n");
  s = s.replace(/<[^>]*>/g, "");
  s = decodeEntities(s);
  s = s.replace(/\r/g, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
};

const extractDescrHtml = (pageHtml) => {
  const html = String(pageHtml || "");

  // Primary: <div ... field="descr">...</div>
  const m1 = html.match(
    /<div[^>]*\bfield=["']descr["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  if (m1) return m1[1];

  // Fallback variants (in case templates differ)
  const m2 = html.match(
    /<[^>]*\bfield=["']descr["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  );
  if (m2) return m2[1];

  return "";
};

const pickDimensions = (text) => {
  const rawLines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out = [];
  for (const line of rawLines) {
    const l = line.replace(/\s+/g, " ").trim();
    if (!l) continue;

    if (/^(Высота|Ширина|Глубина|Длина|Диаметр|Радиус|Толщина)\s*:/i.test(l)) {
      out.push(l);
      continue;
    }

    // Some pages use "Глубина и ширина: ..."
    if (/^(Глубина\s+и\s+ширина)\s*:/i.test(l)) {
      out.push(l);
      continue;
    }
  }

  // Keep it compact; also allow "мм" lines if nothing matched.
  if (!out.length) {
    for (const line of rawLines) {
      const l = line.replace(/\s+/g, " ").trim();
      if (/\bмм\b/i.test(l)) out.push(l);
    }
  }

  // De-dupe preserving order
  const seen = new Set();
  return out.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
};

const fetchHtml = async (url) => {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "3d.r-bureau.ru catalog builder (node fetch)",
      "accept-language": "ru,en;q=0.8",
    },
  });
  const html = await res.text();
  return { ok: res.ok, status: res.status, url: res.url || url, html };
};

const main = async () => {
  const readmePath = path.join(ROOT, "README.md");
  const outPath = path.join(ROOT, "assets", "data", "descriptions.json");

  const md = await fs.readFile(readmePath, "utf8");
  const items = parseReadmeItems(md);

  const result = { generatedAt: new Date().toISOString(), items: {} };

  let okCount = 0;
  let failCount = 0;

  for (const it of items) {
    process.stdout.write(`- ${it.slug}: ${it.externalUrl} ... `);
    try {
      const page = await fetchHtml(it.externalUrl);
      if (!page.ok) {
        failCount++;
        process.stdout.write(`HTTP ${page.status}\n`);
        continue;
      }

      const descrHtml = extractDescrHtml(page.html);
      const descrText = htmlToText(descrHtml);
      const dims = pickDimensions(descrText);

      if (dims.length) {
        result.items[it.slug] = dims;
        okCount++;
        process.stdout.write(`ok (${dims.length} lines)\n`);
      } else {
        failCount++;
        process.stdout.write("no dimensions\n");
      }
    } catch (e) {
      failCount++;
      process.stdout.write(`error\n`);
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");

  process.stdout.write(
    `\nWrote ${outPath}\nOK: ${okCount}, Failed: ${failCount}\n`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
