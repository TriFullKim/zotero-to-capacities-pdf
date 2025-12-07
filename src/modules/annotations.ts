/**
 * Zotero Annotation Extraction and Markdown Conversion
 * Extracts PDF annotations and converts them to Capacities-compatible markdown
 */

import { getPref } from "../utils/prefs";

// Zotero annotation color to emoji mapping
const COLOR_EMOJI_MAP: Record<string, string> = {
  "#ffd400": "\u{1F7E1}", // Yellow
  "#ff6666": "\u{1F534}", // Red
  "#5fb236": "\u{1F7E2}", // Green
  "#2ea8e5": "\u{1F535}", // Blue
  "#a28ae5": "\u{1F7E3}", // Purple
  "#e56eee": "\u{1F7E3}", // Magenta -> Purple
  "#f19837": "\u{1F7E0}", // Orange
  "#aaaaaa": "\u26AA", // Gray
};

// Default color for unknown colors
const DEFAULT_EMOJI = "\u{1F7E1}"; // Yellow

export interface ZoteroAnnotation {
  key: string;
  parentKey: string; // PDF attachment key for deep linking
  annotationType: "highlight" | "underline" | "note" | "image" | "ink";
  annotationText?: string;
  annotationComment?: string;
  annotationColor?: string;
  annotationPageLabel?: string;
  annotationSortIndex?: string;
  annotationPosition?: { pageIndex: number }; // For page number in deep link
  dateAdded: string;
  dateModified: string;
  tags: Array<{ tag: string }>;
}

export interface AnnotationType {
  isImage: boolean; // True for image/area annotations
}

export interface AnnotationFormatted {
  text: string;
  comment?: string;
  color: string;
  colorEmoji: string;
  pageLabel?: string;
  pageIndex?: number; // 0-based page index for deep link
  tags: string[];
  sortIndex: string;
  zoteroLink?: string; // Deep link to annotation in Zotero
  isImage: boolean; // True for image/area annotations
}

export interface ItemAnnotationData {
  itemKey: string;
  itemTitle: string;
  itemUrl?: string;
  itemDoi?: string;
  itemCreators?: string;
  itemDate?: string;
  pdfTitle?: string;
  pdfUrl?: string; // Direct PDF URL for MediaPDF type (e.g., arxiv.org/pdf/xxx.pdf)
  annotations: AnnotationFormatted[];
}

/**
 * Get color emoji from hex color
 */
function getColorEmoji(hexColor?: string): string {
  if (!hexColor) return DEFAULT_EMOJI;

  const normalizedColor = hexColor.toLowerCase();
  return COLOR_EMOJI_MAP[normalizedColor] || DEFAULT_EMOJI;
}

/**
 * Check if URL points directly to a PDF file
 * Detects common PDF hosting patterns (arxiv, direct .pdf links, etc.)
 */
function isPdfUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Direct .pdf extension
  if (lowerUrl.endsWith(".pdf")) {
    return true;
  }

  // ArXiv PDF URLs (arxiv.org/pdf/xxx)
  if (lowerUrl.includes("arxiv.org/pdf/")) {
    return true;
  }

  // Common PDF hosting patterns
  if (
    lowerUrl.includes("/pdf/") &&
    (lowerUrl.includes("arxiv") ||
      lowerUrl.includes("biorxiv") ||
      lowerUrl.includes("medrxiv"))
  ) {
    return true;
  }

  return false;
}

/**
 * Extract annotations from a PDF attachment
 */
export async function extractAnnotationsFromAttachment(
  attachment: Zotero.Item,
): Promise<ZoteroAnnotation[]> {
  if (!attachment.isPDFAttachment()) {
    return [];
  }

  const annotations = attachment.getAnnotations();
  if (!annotations || annotations.length === 0) {
    return [];
  }

  return annotations.map((annot) => {
    // Try to get position info for page index
    let position: { pageIndex: number } | undefined;
    try {
      const positionStr = annot.annotationPosition;
      if (positionStr) {
        const posData =
          typeof positionStr === "string"
            ? JSON.parse(positionStr)
            : positionStr;
        if (posData && typeof posData.pageIndex === "number") {
          position = { pageIndex: posData.pageIndex };
        }
      }
    } catch {
      // Ignore parse errors
    }

    return {
      key: annot.key,
      parentKey: attachment.key, // PDF attachment key for deep linking
      annotationType:
        annot.annotationType as ZoteroAnnotation["annotationType"],
      annotationText: annot.annotationText || undefined,
      annotationComment: annot.annotationComment || undefined,
      annotationColor: annot.annotationColor || undefined,
      annotationPageLabel: annot.annotationPageLabel || undefined,
      annotationSortIndex: annot.annotationSortIndex?.toString() || undefined,
      annotationPosition: position,
      dateAdded: annot.dateAdded,
      dateModified: annot.dateModified,
      tags: annot.getTags(),
    };
  });
}

/**
 * Extract all annotations from a Zotero item (including all PDF attachments)
 */
export async function extractAnnotationsFromItem(
  item: Zotero.Item,
): Promise<ItemAnnotationData | null> {
  // Get the top-level item
  let topItem: Zotero.Item | null = null;
  if (item.isTopLevelItem()) {
    topItem = item;
  } else if (item.parentItemID) {
    topItem = Zotero.Items.get(item.parentItemID) as Zotero.Item;
  }

  if (!topItem) {
    return null;
  }

  // Get PDF attachments
  const attachmentIds = topItem.getAttachments();
  const attachments = Zotero.Items.get(attachmentIds) as Zotero.Item[];
  const pdfAttachments = attachments.filter((att) => att.isPDFAttachment());

  if (pdfAttachments.length === 0) {
    return null;
  }

  // Collect all annotations from all PDFs
  const allAnnotations: AnnotationFormatted[] = [];
  let directPdfUrl: string | undefined;

  for (const pdf of pdfAttachments) {
    // Try to get direct PDF URL from attachment
    const attachmentUrl = pdf.getField("url") as string | undefined;
    if (attachmentUrl && isPdfUrl(attachmentUrl)) {
      directPdfUrl = attachmentUrl;
    }

    const annotations = await extractAnnotationsFromAttachment(pdf);

    for (const annot of annotations) {
      // Build Zotero deep link for this annotation
      // Format: zotero://open-pdf/library/items/{ATTACHMENT_KEY}?page={PAGE}&annotation={ANNOTATION_KEY}
      const pageParam = annot.annotationPosition
        ? `page=${annot.annotationPosition.pageIndex + 1}` // 1-based page number
        : "";
      const annotParam = `annotation=${annot.key}`;
      const queryParams = pageParam ? `${pageParam}&${annotParam}` : annotParam;
      const zoteroLink = `zotero://open-pdf/library/items/${annot.parentKey}?${queryParams}`;

      // Handle image/area annotations
      if (annot.annotationType === "image") {
        // Image annotations - add as figure annotation with deep link
        allAnnotations.push({
          text: "", // No text for image annotations
          comment: annot.annotationComment || undefined,
          color: annot.annotationColor || "#ffd400",
          colorEmoji: getColorEmoji(annot.annotationColor),
          pageLabel: annot.annotationPageLabel,
          pageIndex: annot.annotationPosition?.pageIndex,
          tags: annot.tags.map((t) => t.tag),
          sortIndex: annot.annotationSortIndex || "",
          zoteroLink,
          isImage: true,
        });
      } else if (
        annot.annotationType === "highlight" ||
        annot.annotationType === "underline" ||
        annot.annotationType === "note"
      ) {
        // Text-based annotations - include if has text or comment
        if (annot.annotationText || annot.annotationComment) {
          allAnnotations.push({
            text: annot.annotationText || "",
            comment: annot.annotationComment || undefined,
            color: annot.annotationColor || "#ffd400",
            colorEmoji: getColorEmoji(annot.annotationColor),
            pageLabel: annot.annotationPageLabel,
            pageIndex: annot.annotationPosition?.pageIndex,
            tags: annot.tags.map((t) => t.tag),
            sortIndex: annot.annotationSortIndex || "",
            zoteroLink,
            isImage: false,
          });
        }
      }
      // Skip ink annotations (freehand drawings)
    }
  }

  // Sort annotations by sort index (page order)
  allAnnotations.sort((a, b) => a.sortIndex.localeCompare(b.sortIndex));

  // Get item metadata
  const creators = topItem.getCreators();
  const creatorNames = creators
    .map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim())
    .filter((n) => n)
    .join(", ");

  // Get URL or DOI
  let itemUrl = topItem.getField("url") as string | undefined;
  const itemDoi = topItem.getField("DOI") as string | undefined;

  if (!itemUrl && itemDoi) {
    itemUrl = `https://doi.org/${itemDoi}`;
  }

  // If no URL, try to use Zotero web library link
  if (!itemUrl) {
    const libraryID = topItem.libraryID;
    const library = Zotero.Libraries.get(libraryID);
    if (library && library.libraryType === "user") {
      // Use local Zotero URI as fallback
      itemUrl = `zotero://select/library/items/${topItem.key}`;
    }
  }

  return {
    itemKey: topItem.key,
    itemTitle: topItem.getField("title") as string,
    itemUrl,
    itemDoi,
    itemCreators: creatorNames || undefined,
    itemDate: (topItem.getField("date") as string) || undefined,
    pdfTitle: pdfAttachments[0]?.getField("title") as string,
    pdfUrl: directPdfUrl,
    annotations: allAnnotations,
  };
}

/**
 * Convert annotations to Capacities markdown format
 * Format:
 * - Highlight text = quote with color emoji (NO italic)
 * - Comment = default text below quote
 */
export function formatAnnotationsToMarkdown(data: ItemAnnotationData): string {
  const includePageNumbers = getPref("includePageNumbers") ?? true;
  const includeTags = getPref("includeTags") ?? true;
  const useColorEmoji = getPref("useColorEmoji") ?? true;

  const lines: string[] = [];

  // Header with item info
  lines.push(`## Annotations`);
  lines.push("");

  if (data.itemCreators) {
    lines.push(`**Authors:** ${data.itemCreators}`);
  }
  if (data.itemDate) {
    lines.push(`**Date:** ${data.itemDate}`);
  }
  if (data.itemDoi) {
    lines.push(`**DOI:** ${data.itemDoi}`);
  }

  if (data.itemCreators || data.itemDate || data.itemDoi) {
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Format each annotation
  for (const annot of data.annotations) {
    // Build the quote line with optional Zotero deep link
    const colorPrefix = useColorEmoji ? `${annot.colorEmoji} ` : "";

    // Page info with Zotero deep link if available
    let pageInfo = "";
    if (includePageNumbers && annot.pageLabel) {
      if (annot.zoteroLink) {
        // Clickable link to open annotation in Zotero
        pageInfo = ` [*(p.${annot.pageLabel})*](${annot.zoteroLink})`;
      } else {
        pageInfo = ` *(p.${annot.pageLabel})*`;
      }
    }

    // Handle image/area annotations differently
    if (annot.isImage) {
      // Image annotation - show as figure reference with deep link
      const figureText = `📷 Figure annotation${pageInfo}`;
      lines.push(`> ${colorPrefix}${figureText}`);

      // Comment as regular text below
      if (annot.comment) {
        lines.push("");
        lines.push(annot.comment);
      }
    } else if (annot.text) {
      // Quote block for highlight text - NO italic, just the text
      const quoteLines = annot.text.split("\n").map((line) => `> ${line}`);
      quoteLines[0] = `> ${colorPrefix}${quoteLines[0].slice(2)}${pageInfo}`;
      lines.push(quoteLines.join("\n"));

      // Comment as regular text below quote
      if (annot.comment) {
        lines.push("");
        lines.push(annot.comment);
      }
    }

    // Tags if enabled
    if (includeTags && annot.tags.length > 0) {
      lines.push("");
      lines.push(`Tags: ${annot.tags.map((t) => `#${t}`).join(" ")}`);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Get the best URL for syncing to Capacities
 * Priority: Direct PDF URL (for MediaPDF) > DOI link > URL field > Zotero link
 *
 * Using a direct PDF URL will cause Capacities to create a MediaPDF object type
 * instead of a generic MediaWebResource.
 */
export function getBestUrlForItem(data: ItemAnnotationData): string {
  // Prefer direct PDF URL for MediaPDF type creation
  if (data.pdfUrl) {
    return data.pdfUrl;
  }

  // Check if the item URL is a direct PDF link
  if (
    data.itemUrl &&
    !data.itemUrl.startsWith("zotero://") &&
    isPdfUrl(data.itemUrl)
  ) {
    return data.itemUrl;
  }

  // DOI link (creates MediaWebResource, but good for academic papers)
  if (data.itemDoi) {
    return `https://doi.org/${data.itemDoi}`;
  }

  // Use URL field if available
  if (data.itemUrl && !data.itemUrl.startsWith("zotero://")) {
    return data.itemUrl;
  }

  // Fallback to Zotero URI
  return data.itemUrl || `zotero://select/library/items/${data.itemKey}`;
}

/**
 * Build description for Capacities weblink
 */
export function buildDescription(data: ItemAnnotationData): string {
  const parts: string[] = [];

  if (data.itemCreators) {
    parts.push(data.itemCreators);
  }
  if (data.itemDate) {
    parts.push(`(${data.itemDate})`);
  }

  const desc = parts.join(" ");
  return desc.slice(0, 1000);
}
