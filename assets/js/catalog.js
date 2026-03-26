/* Build catalog grid from README.md table rows.
   Keeps the catalog as a single-source-of-truth: update README -> catalog updates. */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const clampIndex = (i, len) => ((i % len) + len) % len;
  const debounce = (fn, ms) => {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const els = {
    cards: $("#cards"),
    tpl: $("#card-tpl"),
    hint: $("#grid-hint"),
    q: $("#q"),
    chips: $("#chips"),
    statCount: $("#stat-count"),
    statUpdated: $("#stat-updated"),
  };

  if (!els.cards || !els.tpl) return;

  const state = {
    items: [],
    descrBySlug: {},
    q: "",
    category: "all",
  };

  const FORMAT_COLUMNS = [
    { key: "max", label: ".max" },
    { key: "fbx", label: ".fbx" },
    { key: "3ds", label: ".3ds" },
    { key: "obj", label: ".obj" },
    { key: "dwg", label: ".dwg" },
    { key: "rfa", label: ".rfa" },
    { key: "skp", label: ".skp" },
  ];

  const normalizeSpace = (s) =>
    String(s || "")
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const safeUrl = (url) => {
    const u = normalizeSpace(url);
    // allow relative and http(s); block other schemes (e.g. javascript:)
    if (!u) return "";
    if (u.startsWith("./") || u.startsWith("../") || u.startsWith("/"))
      return u;
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(u)) return "";
    return u; // for simple relative like "bench-2/" or "r-bureau-3d-all.zip"
  };

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

  const isFormatAvailable = (cell) => {
    const s = normalizeSpace(cell).toLowerCase();
    if (!s) return false;
    if (/[✅✔☑]/.test(s)) return true;
    if (/[❌✖✘]/.test(s)) return false;
    return /^(да|yes|true|1)$/i.test(s);
  };

  const categoryFromSlug = (slug) => {
    const s = String(slug || "").toLowerCase();
    if (s.startsWith("bench-")) return "benches";
    if (
      s.startsWith("chair-") ||
      s.startsWith("duga-") ||
      s.startsWith("element") ||
      s.startsWith("vasily-")
    )
      return "chairs";
    if (s.startsWith("table-")) return "tables";
    if (s === "tumbochka") return "storage";
    if (s === "cart") return "other";
    return "other";
  };

  const slugFromPath = (p) => {
    const s = String(p || "");
    const m = s.match(/^([a-z0-9-]+)\//i);
    return m ? m[1] : "";
  };

  const parseReadmeTable = (md) => {
    const lines = String(md || "").split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("|")) continue;
      if (l.includes("|:") && l.includes("---")) continue; // separator
      if (/\|\s*Название\s*\|/i.test(l)) continue; // header
      if (!l.includes("](")) continue;
      rows.push(l);
    }

    const items = [];
    for (const row of rows) {
      const rawCells = row.split("|").map((c) => c.trim());
      // remove first/last empty caused by leading/trailing pipes
      const cells = rawCells.filter(
        (c, idx) => !(c === "" && (idx === 0 || idx === rawCells.length - 1)),
      );
      if (cells.length < 4) continue;

      const name = mdLink(cells[0]);
      const preview = mdImage(cells[1]);
      const download = mdLink(cells[2]);
      const view = mdLink(cells[3]);
      const ddd = mdLink(cells[4] || "");
      const formats = {};
      FORMAT_COLUMNS.forEach((format, idx) => {
        formats[format.key] = isFormatAvailable(cells[5 + idx] || "");
      });

      if (!name || !view) continue;

      const slug = slugFromPath(preview || view.url);
      const item = {
        title: name.text || "Без названия",
        externalUrl: name.url || "",
        previewUrl: preview || "",
        downloadUrl: download?.url || "",
        viewUrl: view.url || "",
        dddUrl: ddd?.url || "",
        slug,
        category: categoryFromSlug(slug),
        search: normalizeSpace(name.text).toLowerCase(),
        formats,
      };
      items.push(item);
    }
    return items;
  };

  const formatDate = (d) => {
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };

  const setUpdated = (headerValue) => {
    if (!els.statUpdated) return;
    if (headerValue) {
      const t = Date.parse(headerValue);
      if (!Number.isNaN(t)) {
        els.statUpdated.textContent = formatDate(new Date(t));
        return;
      }
    }
    // fallback: build time from browser
    els.statUpdated.textContent = formatDate(new Date());
  };

  const setCount = (n) => {
    if (!els.statCount) return;
    els.statCount.textContent = String(n);
  };

  const setHint = (text) => {
    if (!els.hint) return;
    els.hint.textContent = text;
  };

  const applyTabRoving = () => {
    if (!els.chips) return;
    const chips = Array.from(
      els.chips.querySelectorAll(".chip[data-category]"),
    );
    chips.forEach((btn) => {
      const active = btn.dataset.category === state.category;
      btn.setAttribute("tabindex", active ? "0" : "-1");
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  };

  const readUrlState = () => {
    try {
      const u = new URL(window.location.href);
      const q = normalizeSpace(u.searchParams.get("q") || "");
      const cat = normalizeSpace(u.searchParams.get("cat") || "");
      return { q, cat };
    } catch {
      return { q: "", cat: "" };
    }
  };

  const writeUrlState = debounce(() => {
    try {
      const u = new URL(window.location.href);
      const q = normalizeSpace(state.q);
      const cat = normalizeSpace(state.category);

      if (q) u.searchParams.set("q", q);
      else u.searchParams.delete("q");

      if (cat && cat !== "all") u.searchParams.set("cat", cat);
      else u.searchParams.delete("cat");

      window.history.replaceState({}, "", u.toString());
    } catch {
      // ignore
    }
  }, 120);

  const render = () => {
    const q = normalizeSpace(state.q).toLowerCase();
    const cat = state.category;

    const total = state.items.length;
    let items = state.items.slice();
    if (cat !== "all") items = items.filter((it) => it.category === cat);
    if (q) items = items.filter((it) => it.search.includes(q));
    const shown = items.length;

    els.cards.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const it of items) {
      const node = els.tpl.content.firstElementChild.cloneNode(true);
      const img = node.querySelector('[data-role="img"]');
      const viewA = node.querySelector('[data-role="view"]');
      const viewTitle = node.querySelector('[data-role="viewTitle"]');
      const descr = node.querySelector('[data-role="descr"]');
      const formats = node.querySelector('[data-role="formats"]');
      const viewBtn = node.querySelector('[data-role="viewBtn"]');
      const downloadBtn = node.querySelector('[data-role="downloadBtn"]');
      const externalBtn = node.querySelector('[data-role="externalBtn"]');
      const dddBtn = node.querySelector('[data-role="dddBtn"]');

      if (img) {
        img.src = it.previewUrl || "assets/img/favicon.ico";
        img.alt = it.title;
      }

      const viewUrl = safeUrl(it.viewUrl);
      if (viewA) viewA.href = viewUrl || "#";
      if (viewTitle) {
        viewTitle.href = viewUrl || "#";
        viewTitle.textContent = it.title;
      }
      if (viewBtn) viewBtn.href = viewUrl || "#";

      if (descr) {
        const lines = state.descrBySlug?.[it.slug];
        if (Array.isArray(lines) && lines.length) {
          descr.textContent = lines.join("\n");
        } else if (typeof lines === "string" && lines.trim()) {
          descr.textContent = lines.trim();
        } else {
          descr.textContent = "";
        }
      }

      if (formats) {
        formats.innerHTML = "";
        for (const format of FORMAT_COLUMNS) {
          const badge = document.createElement("span");
          const available = Boolean(it.formats && it.formats[format.key]);
          badge.className = `format-pill ${available ? "is-available" : "is-unavailable"}`;
          badge.textContent = format.label;
          formats.appendChild(badge);
        }
      }

      const disableLink = (a, label) => {
        if (!a) return;
        a.classList.add("is-disabled");
        a.setAttribute("aria-disabled", "true");
        a.setAttribute("tabindex", "-1");
        a.removeAttribute("href");
        if (label) a.title = `Нет ссылки: ${label}`;
        // keep target/rel/download as-is; pointer-events: none blocks interactions.
      };

      const enableLink = (a, url) => {
        if (!a) return;
        const href = safeUrl(url);
        if (!href) {
          disableLink(a);
          return;
        }
        a.classList.remove("is-disabled");
        a.removeAttribute("aria-disabled");
        a.removeAttribute("tabindex");
        a.href = href;
        a.title = "";
      };

      if (downloadBtn) {
        if (it.downloadUrl) enableLink(downloadBtn, it.downloadUrl);
        else disableLink(downloadBtn, "скачать");
      }

      if (externalBtn) {
        if (it.externalUrl) enableLink(externalBtn, it.externalUrl);
        else disableLink(externalBtn, "купить");
      }

      if (dddBtn) {
        if (it.dddUrl) enableLink(dddBtn, it.dddUrl);
        else disableLink(dddBtn, "3ddd");
      }

      frag.appendChild(node);
    }

    els.cards.appendChild(frag);

    setHint(shown ? `Показано: ${shown} из ${total}` : "Ничего не найдено");
    setCount(total);
    applyTabRoving();
    writeUrlState();
  };

  const setCategory = (cat) => {
    state.category = cat;
    if (els.chips) {
      els.chips.querySelectorAll(".chip").forEach((btn) => {
        const active = btn.dataset.category === cat;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
        btn.setAttribute("tabindex", active ? "0" : "-1");
      });
    }
    render();
  };

  const initEvents = () => {
    if (els.q) {
      els.q.addEventListener("input", () => {
        state.q = els.q.value || "";
        render();
      });

      els.q.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          els.q.value = "";
          state.q = "";
          render();
        }
      });
    }

    if (els.chips) {
      els.chips.addEventListener("click", (e) => {
        const btn = e.target.closest(".chip[data-category]");
        if (!btn) return;
        btn.focus();
        setCategory(btn.dataset.category || "all");
      });

      // Keyboard navigation for role=tab UI: left/right to switch category.
      els.chips.addEventListener("keydown", (e) => {
        const btn = e.target.closest(".chip[data-category]");
        if (!btn || !els.chips.contains(btn)) return;

        const key = e.key;
        const chips = Array.from(
          els.chips.querySelectorAll(".chip[data-category]"),
        );
        const i = chips.indexOf(btn);
        if (i === -1 || !chips.length) return;

        if (key === "Home") {
          e.preventDefault();
          chips[0].focus();
          setCategory(chips[0].dataset.category || "all");
          return;
        }
        if (key === "End") {
          e.preventDefault();
          const last = chips[chips.length - 1];
          last.focus();
          setCategory(last.dataset.category || "all");
          return;
        }

        const isActivateKey = key === "Enter" || key === " ";
        if (isActivateKey) {
          e.preventDefault();
          setCategory(btn.dataset.category || "all");
          return;
        }

        const dir = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();

        const next = chips[clampIndex(i + dir, chips.length)];
        next.focus();
        setCategory(next.dataset.category || "all");
      });
    }

    document.addEventListener("keydown", (e) => {
      // Ctrl/Cmd+K focuses search.
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        if (!els.q) return;
        e.preventDefault();
        els.q.focus();
      }
    });
  };

  const load = async () => {
    setHint("Загрузка…");
    try {
      const res = await fetch("README.md", { cache: "no-store" });
      const md = await res.text();
      setUpdated(res.headers.get("last-modified"));
      state.items = parseReadmeTable(md);
      if (!state.items.length) {
        setHint("Не удалось распарсить таблицу из README.md");
      }
      render();

      // Optional: descriptions generated offline (see scripts/build-descriptions.mjs).
      try {
        const dres = await fetch("assets/data/descriptions.json", {
          cache: "no-store",
        });
        if (dres.ok) {
          const data = await dres.json();
          const bySlug = data?.items || data?.bySlug || data || {};
          if (bySlug && typeof bySlug === "object") {
            state.descrBySlug = bySlug;
            render();
          }
        }
      } catch (_) {
        // ignore
      }
    } catch (err) {
      console.error(err);
      setHint("Ошибка загрузки README.md");
      if (els.statUpdated) els.statUpdated.textContent = "—";
      if (els.statCount) els.statCount.textContent = "—";
    }
  };

  initEvents();
  const initial = readUrlState();
  if (els.q && initial.q) {
    els.q.value = initial.q;
    state.q = initial.q;
  }
  // Apply category after chips are ready; validate against known categories.
  const allowed = new Set([
    "all",
    "chairs",
    "tables",
    "benches",
    "storage",
    "other",
  ]);
  setCategory(allowed.has(initial.cat) ? initial.cat : "all");
  load();
})();
