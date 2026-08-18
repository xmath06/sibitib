import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
  PageOrientation,
} from "docx";
import { parseHTML } from "linkedom";

const SUPER: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ",
};

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", "i": "ᵢ", "n": "ₙ", "x": "ₓ",
};

const SYMS: Record<string, string> = {
  "\\times": "×", "\\cdot": "·", "\\div": "÷", "\\pm": "±", "\\mp": "∓",
  "\\leq": "≤", "\\le": "≤", "\\geq": "≥", "\\ge": "≥", "\\neq": "≠", "\\ne": "≠",
  "\\approx": "≈", "\\equiv": "≡", "\\infty": "∞", "\\pi": "π", "\\alpha": "α",
  "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\theta": "θ", "\\lambda": "λ",
  "\\mu": "μ", "\\sigma": "σ", "\\phi": "φ", "\\epsilon": "ε", "\\Delta": "Δ",
  "\\Omega": "Ω", "\\sum": "∑", "\\prod": "∏", "\\int": "∫", "\\in": "∈",
  "\\notin": "∉", "\\subset": "⊂", "\\subseteq": "⊆", "\\supset": "⊃", "\\cup": "∪",
  "\\cap": "∩", "\\forall": "∀", "\\exists": "∃", "\\rightarrow": "→", "\\to": "→",
  "\\Rightarrow": "⇒", "\\leftarrow": "←", "\\leftrightarrow": "↔", "\\mid": "|",
  "\\propto": "∝", "\\partial": "∂", "\\circ": "∘", "\\degree": "°",
  "\\quad": " ", "\\qquad": "  ", "\\,": " ", "\\;": " ", "\\!": "", "\\ ": " ",
};

export function latexToText(src: string): string {
  let s = src.replace(/\\left/g, "").replace(/\\right/g, "");

  s = s.replace(
    /\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_m, a: string, b: string) => `(${latexToText(a)})/(${latexToText(b)})`,
  );
  s = s.replace(
    /\\sqrt\[(\d+)\]?\{([^{}]*)\}/g,
    (_m, n: string, x: string) => `∛(${latexToText(x)})`,
  );
  s = s.replace(
    /\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_m, x: string) => `√(${latexToText(x)})`,
  );
  s = s.replace(/\\text\{([^{}]*)\}/g, (_m, x: string) => x);

  s = s.replace(
    /\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}/g,
    (_m, body: string) => {
      const rows = body.split("\\\\").map((r) =>
        r.split("&").map((c) => latexToText(c.trim())).join("  "),
      );
      return rows.join("  ;  ");
    },
  );
  s = s.replace(/\\begin\{[^{}]*\}/g, "").replace(/\\end\{[^{}]*\}/g, "");

  s = s.replace(
    /\^\{([^{}]*)\}/g,
    (_m, x: string) => [...latexToText(x)].map((c) => SUPER[c] ?? `^${c}`).join(""),
  );
  s = s.replace(/\^([a-zA-Z0-9])/g, (_m, x: string) => SUPER[x] ?? `^${x}`);
  s = s.replace(
    /\_\{([^{}]*)\}/g,
    (_m, x: string) => [...latexToText(x)].map((c) => SUB[c] ?? `_${c}`).join(""),
  );
  s = s.replace(/\_([a-zA-Z0-9])/g, (_m, x: string) => SUB[x] ?? `_${x}`);

  for (const [k, v] of Object.entries(SYMS)) s = s.split(k).join(v);

  s = s.replace(/\\,/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

interface InlineFmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sub?: boolean;
  sup?: boolean;
}

function fmtRuns(fmt: InlineFmt) {
  return {
    bold: fmt.bold ?? false,
    italics: fmt.italic ?? false,
    underline: fmt.underline ? {} : undefined,
    subScript: fmt.sub ?? false,
    superScript: fmt.sup ?? false,
  };
}

function inlineRuns(node: any, fmt: InlineFmt = {}): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of node.childNodes ?? []) {
    if (child.nodeType === 3) {
      const text = (child.data ?? "").replace(/\s+/g, " ");
      if (text) runs.push(new TextRun({ text, ...fmtRuns(fmt) }));
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      if (tag === "br") runs.push(new TextRun({ break: 1 }));
      else if (tag === "strong" || tag === "b") runs.push(...inlineRuns(child, { ...fmt, bold: true }));
      else if (tag === "em" || tag === "i") runs.push(...inlineRuns(child, { ...fmt, italic: true }));
      else if (tag === "u") runs.push(...inlineRuns(child, { ...fmt, underline: true }));
      else if (tag === "sub") runs.push(...inlineRuns(child, { ...fmt, sub: true }));
      else if (tag === "sup") runs.push(...inlineRuns(child, { ...fmt, sup: true }));
      else if (tag === "img") runs.push(new TextRun({ text: "[gambar]", ...fmtRuns(fmt) }));
      else if (tag === "span" && /\bmath-latex\b/.test(child.getAttribute?.("class") ?? "")) {
        const latex = child.getAttribute?.("data-latex") ?? child.textContent ?? "";
        runs.push(new TextRun({ text: latexToText(latex), italics: true }));
      } else runs.push(...inlineRuns(child, fmt));
    }
  }
  return runs;
}

function inlineHtmlRuns(html: string): TextRun[] {
  const { document } = parseHTML(`<div id="__root">${html}</div>`);
  const root = document.getElementById("__root");
  return root ? inlineRuns(root) : [];
}

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4 },
  bottom: { style: BorderStyle.SINGLE, size: 4 },
  left: { style: BorderStyle.SINGLE, size: 4 },
  right: { style: BorderStyle.SINGLE, size: 4 },
};

function buildTable(el: any): Table {
  const rows: TableRow[] = [];
  const trs: any[] = Array.from(el.querySelectorAll("tr"));
  if (!trs.length) trs.push(el);
  for (const tr of trs) {
    const cells: TableCell[] = [];
    const tds: any[] = Array.from(tr.querySelectorAll("td, th"));
    for (const td of tds) {
      const content = walkBlocks(td);
      cells.push(
        new TableCell({
          children: content.length ? content : [new Paragraph({ children: [] })],
          borders: cellBorders,
          verticalAlign: "center",
        }),
      );
    }
    if (cells.length) rows.push(new TableRow({ children: cells }));
  }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4 },
      bottom: { style: BorderStyle.SINGLE, size: 4 },
      left: { style: BorderStyle.SINGLE, size: 4 },
      right: { style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
      insideVertical: { style: BorderStyle.SINGLE, size: 4 },
    },
  });
}

function walkBlocks(node: any, depth = 0, indentLeft = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const child of node.childNodes ?? []) {
    if (child.nodeType === 3) {
      const text = (child.data ?? "").replace(/\s+/g, " ").trim();
      if (text)
        out.push(
          new Paragraph({
            children: [new TextRun({ text })],
            indent: indentLeft ? { left: indentLeft } : undefined,
          }),
        );
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      if (tag === "p" || tag === "div") {
        out.push(
          new Paragraph({
            children: inlineRuns(child),
            spacing: { after: 120, line: 276 },
            indent: indentLeft ? { left: indentLeft } : undefined,
          }),
        );
      } else if (/^h[1-6]$/.test(tag)) {
        out.push(
          new Paragraph({
            children: inlineRuns(child),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 160, after: 120 },
            indent: indentLeft ? { left: indentLeft } : undefined,
          }),
        );
      } else if (tag === "ul" || tag === "ol") {
        const ordered = tag === "ol";
        let counter = 0;
        const items = Array.from(child.childNodes).filter(
          (c: any) => c.nodeType === 1 && c.tagName.toLowerCase() === "li",
        );
        for (const li of items) {
          counter += 1;
          const prefix = ordered ? `${counter}. ` : "• ";
          out.push(
            new Paragraph({
              children: [new TextRun(prefix), ...inlineRuns(li)],
              indent: { left: (indentLeft || depth * 360) + 360, hanging: 240 },
              spacing: { after: 60, line: 276 },
            }),
          );
          out.push(...walkBlocks(li, depth + 1, indentLeft));
        }
      } else if (tag === "table") {
        out.push(buildTable(child));
      } else if (tag === "blockquote") {
        out.push(
          new Paragraph({
            children: inlineRuns(child),
            indent: { left: (indentLeft || 0) + 360 },
            spacing: { after: 120 },
          }),
        );
      } else if (tag === "img") {
        out.push(new Paragraph({ children: [new TextRun({ text: "[gambar]" })] }));
      } else if (tag === "li" || tag === "td" || tag === "th" || tag === "tr") {
        out.push(...walkBlocks(child, depth, indentLeft));
      } else {
        out.push(...walkBlocks(child, depth, indentLeft));
      }
    }
  }
  return out;
}

export function htmlToDocxBlocks(html: string, indentLeft = 0): (Paragraph | Table)[] {
  const { document } = parseHTML(`<div id="__root">${html}</div>`);
  const root = document.getElementById("__root");
  return root ? walkBlocks(root, 0, indentLeft) : [];
}

export function htmlParagraph(html: string, spacing = {}): Paragraph {
  return new Paragraph({ children: inlineHtmlRuns(html), spacing });
}

export function paragraph(
  text: string,
  opts: { bold?: boolean; italic?: boolean; align?: "center" | "left" | "right" | "both" } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    children: [new TextRun({ text, bold: opts.bold ?? false, italics: opts.italic ?? false })],
    spacing: { after: 100, line: 276 },
  });
}

export function questionParagraph(number: number, html: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${number}. `, bold: true }), ...inlineHtmlRuns(html)],
    spacing: { before: 160, after: 80, line: 276 },
  });
}

export function optionParagraph(letter: string, text: string, detail = ""): Paragraph {
  const runs: TextRun[] = [new TextRun({ text: `   ${letter}. `, bold: true }), ...inlineHtmlRuns(text)];
  if (detail) runs.push(new TextRun({ text: detail }));
  return new Paragraph({
    children: runs,
    indent: { left: 360, hanging: 240 },
    spacing: { after: 60, line: 276 },
  });
}

export async function buildDocx(
  children: (Paragraph | Table)[],
  options: { title?: string; landscape?: boolean } = {},
): Promise<Uint8Array> {
  const doc = new Document({
    creator: "SIBITIB CBT",
    title: options.title,
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 24 } },
      },
    },
    sections: [
      {
        properties: options.landscape
          ? { page: { size: { orientation: PageOrientation.LANDSCAPE } } }
          : undefined,
        children,
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";
}