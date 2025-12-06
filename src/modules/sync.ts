/**
 * Sync Module
 * Handles synchronization of Zotero items to Capacities
 */

import { getPref, setPref } from "../utils/prefs";
import { getCapacitiesClient, SaveWeblinkResponse } from "./capacities";
import {
  extractAnnotationsFromItem,
  formatAnnotationsToMarkdown,
  getBestUrlForItem,
  buildDescription,
  ItemAnnotationData,
} from "./annotations";

export interface SyncResult {
  success: boolean;
  itemKey: string;
  itemTitle: string;
  capacitiesId?: string;
  structureId?: string;
  error?: string;
}

export interface SyncProgress {
  current: number;
  total: number;
  currentItem?: string;
}

type ProgressCallback = (progress: SyncProgress) => void;

/**
 * Get the set of already processed item keys
 */
function getProcessedItems(): Set<string> {
  try {
    const json = getPref("processedItems") || "[]";
    const items = JSON.parse(json) as string[];
    return new Set(items);
  } catch {
    return new Set();
  }
}

/**
 * Add an item key to the processed set
 */
function addProcessedItem(itemKey: string): void {
  const processed = getProcessedItems();
  processed.add(itemKey);
  setPref("processedItems", JSON.stringify([...processed]));
}

/**
 * Remove an item key from the processed set
 */
export function removeProcessedItem(itemKey: string): void {
  const processed = getProcessedItems();
  processed.delete(itemKey);
  setPref("processedItems", JSON.stringify([...processed]));
}

/**
 * Check if an item has been processed
 */
export function isItemProcessed(itemKey: string): boolean {
  return getProcessedItems().has(itemKey);
}

/**
 * Clear all processed items
 */
export function clearProcessedItems(): void {
  setPref("processedItems", "[]");
}

/**
 * Sync a single Zotero item to Capacities
 */
export async function syncItemToCapacities(
  item: Zotero.Item,
  options: {
    force?: boolean;
    skipProcessedCheck?: boolean;
  } = {},
): Promise<SyncResult> {
  const client = getCapacitiesClient();

  if (!client.isConfigured()) {
    return {
      success: false,
      itemKey: item.key,
      itemTitle: item.getField("title") as string || "Unknown",
      error: "Capacities API not configured. Please set API token and Space ID.",
    };
  }

  // Check if already processed
  if (!options.force && !options.skipProcessedCheck && isItemProcessed(item.key)) {
    return {
      success: false,
      itemKey: item.key,
      itemTitle: item.getField("title") as string || "Unknown",
      error: "Item already synced. Use force sync to re-sync.",
    };
  }

  // Extract annotations
  const annotationData = await extractAnnotationsFromItem(item);

  if (!annotationData) {
    return {
      success: false,
      itemKey: item.key,
      itemTitle: item.getField("title") as string || "Unknown",
      error: "No PDF attachments or annotations found.",
    };
  }

  if (annotationData.annotations.length === 0) {
    return {
      success: false,
      itemKey: annotationData.itemKey,
      itemTitle: annotationData.itemTitle,
      error: "No annotations found in PDF.",
    };
  }

  // Format annotations to markdown
  const mdText = formatAnnotationsToMarkdown(annotationData);

  // Get URL for weblink
  const url = getBestUrlForItem(annotationData);

  // Build description
  const description = buildDescription(annotationData);

  // Build tags
  const tags = ["zotero", "annotations"];
  if (annotationData.itemDoi) {
    tags.push("research");
  }

  try {
    // Send to Capacities
    const response: SaveWeblinkResponse = await client.saveWeblink({
      url,
      titleOverwrite: annotationData.itemTitle,
      descriptionOverwrite: description,
      tags,
      mdText,
    });

    // Mark as processed
    addProcessedItem(annotationData.itemKey);

    return {
      success: true,
      itemKey: annotationData.itemKey,
      itemTitle: annotationData.itemTitle,
      capacitiesId: response.id,
      structureId: response.structureId,
    };
  } catch (err) {
    const error = err as Error;
    return {
      success: false,
      itemKey: annotationData.itemKey,
      itemTitle: annotationData.itemTitle,
      error: error.message || "Unknown error occurred",
    };
  }
}

/**
 * Sync multiple items to Capacities
 */
export async function syncItemsToCapacities(
  items: Zotero.Item[],
  options: {
    force?: boolean;
    onProgress?: ProgressCallback;
  } = {},
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Report progress
    if (options.onProgress) {
      options.onProgress({
        current: i + 1,
        total,
        currentItem: item.getField("title") as string,
      });
    }

    const result = await syncItemToCapacities(item, { force: options.force });
    results.push(result);

    // Small delay to respect rate limits (10 req/60s = ~6s between requests)
    // We'll use a smaller delay since user is actively waiting
    if (i < items.length - 1) {
      await Zotero.Promise.delay(1000);
    }
  }

  return results;
}

/**
 * Sync selected items in Zotero
 */
export async function syncSelectedItems(
  options: {
    force?: boolean;
    onProgress?: ProgressCallback;
  } = {},
): Promise<SyncResult[]> {
  const zp = Zotero.getActiveZoteroPane();
  const selectedItems = zp.getSelectedItems();

  if (selectedItems.length === 0) {
    return [];
  }

  // Filter to top-level items only
  const topLevelItems = selectedItems.filter((item) => item.isTopLevelItem());

  return syncItemsToCapacities(topLevelItems, options);
}

/**
 * Get sync statistics
 */
export function getSyncStats(): {
  processedCount: number;
} {
  const processed = getProcessedItems();
  return {
    processedCount: processed.size,
  };
}
