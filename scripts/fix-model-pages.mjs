import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const shouldSkipDir = (name) => {
  if (!name) return true;
  if (name.startsWith(".")) return true;
  return name === "assets" || name === "scripts" || name === "archive";
};

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === ROOT && shouldSkipDir(e.name)) continue;
      out.push(...(await walk(p)));
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
};

const extractTitle = (html) => {
  const m = html.match(/<title>\s*([^<]+?)\s*<\/title>/i);
  return m ? m[1].trim() : "";
};

const setMetaDescriptionToTitle = (html, title) => {
  if (!title) return html;
  const re = /(<meta\s+name=["']description["']\s+content=["'])([^"']*)(["'][^>]*>)/i;
  if (!re.test(html)) return html;
  return html.replace(re, `$1${title}$3`);
};

const ensureArPromptAlt = (html) => {
  // Add alt="" to the AR hand prompt image if missing.
  return html.replace(
    /<img([^>]*?)\s+src=(["'])([^"']*ar_hand_prompt\.png)\2([^>]*?)>/gi,
    (m, pre, q, src, post) => {
      if (/\salt\s*=/.test(m)) return m;
      return `<img${pre} src=${q}${src}${q} alt=""${post}>`;
    },
  );
};

const normalizeViewerFooter = (html, eol) => {
  // Normalize the chunk between </model-viewer> and </body> so we don't accidentally
  // merge tags onto one line while reordering scripts.
  const closeIdx = html.search(/<\/model-viewer>/i);
  if (closeIdx === -1) return html;

  const bodyIdxRel = html.slice(closeIdx).search(/<\/body>/i);
  if (bodyIdxRel === -1) return html;

  const start = closeIdx + "</model-viewer>".length;
  const bodyTagStart = closeIdx + bodyIdxRel;
  const between = html.slice(start, bodyTagStart);

  const bodyIndent = (() => {
    const nl = html.lastIndexOf("\n", bodyTagStart - 1);
    if (nl === -1) return "";
    const raw = html.slice(nl + 1, bodyTagStart);
    return raw.replace(/\r/g, "");
  })();

  const bodyTagEnd = bodyTagStart + "</body>".length;
  const tailAfterBody = html.slice(bodyTagEnd);

  const annMatch = between.match(/<div\s+class=["']annotation["'][^>]*>([\s\S]*?)<\/div>/i);
  const annInner = annMatch ? annMatch[1].trim() : "Дополненная реальность работает только на смартфоне";

  // Remove our known blocks from the "between" section.
  let cleaned = between;
  cleaned = cleaned.replace(/<script[^>]*src=["']\.\.\/assets\/js\/script\.js["'][^>]*>\s*<\/script>\s*/gi, "");
  cleaned = cleaned.replace(/<script[^>]*src=["']https:\/\/unpkg\.com\/@google\/model-viewer\/dist\/model-viewer\.min\.js["'][^>]*>\s*<\/script>\s*/gi, "");
  cleaned = cleaned.replace(/<div\s+class=["']annotation["'][^>]*>[\s\S]*?<\/div>\s*/gi, "");

  // Keep any remaining content (should be empty on our pages).
  const rest = cleaned.trim();

  const indent = "    ";
  const footer =
    eol +
    `${indent}<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>` +
    eol +
    `${indent}<script src="../assets/js/script.js"></script>` +
    eol +
    `${indent}<div class="annotation">${annInner}</div>` +
    (rest ? eol + rest + eol : eol);

  return html.slice(0, start) + footer + bodyIndent + "</body>" + tailAfterBody;
};

const main = async () => {
  const files = await walk(ROOT);
  const targets = files.filter((p) => path.basename(p).toLowerCase() === "index.html" && path.resolve(p) !== path.resolve(path.join(ROOT, "index.html")));

  let touched = 0;
  for (const file of targets) {
    const rel = path.relative(ROOT, file);
    let html = await fs.readFile(file, "utf8");
    if (!/<model-viewer\b/i.test(html)) continue;

    const eol = html.includes("\r\n") ? "\r\n" : "\n";
    const title = extractTitle(html);
    let next = html;
    next = setMetaDescriptionToTitle(next, title);
    next = ensureArPromptAlt(next);
    next = normalizeViewerFooter(next, eol);

    if (next !== html) {
      await fs.writeFile(file, next, "utf8");
      touched += 1;
      process.stdout.write(`updated ${rel}\n`);
    }
  }

  process.stdout.write(`done. updated files: ${touched}\n`);
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
