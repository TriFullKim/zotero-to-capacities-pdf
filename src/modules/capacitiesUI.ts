/**
 * Capacities UI Components
 * Handles menus, context menus, and UI interactions
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import {
  getCapacitiesClient,
  resetCapacitiesClient,
  SpaceInfo,
} from "./capacities";
import {
  syncSelectedItems,
  syncItemToCapacities,
  isItemProcessed,
  clearProcessedItems,
  SyncResult,
} from "./sync";

/**
 * Register the preferences pane
 */
export function registerPrefs(): void {
  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title") || "Zotero Capacities",
    image: `chrome://${config.addonRef}/content/icons/favicon.png`,
  });
}

/**
 * Register item notifier for auto-sync
 */
export function registerNotifier(): void {
  const callback = {
    notify: async (
      event: string,
      type: string,
      ids: (string | number)[],
      _extraData: Record<string, unknown>,
    ) => {
      if (!getPref("syncOnItemChange")) {
        return;
      }

      // Handle item modifications
      if (type === "item" && (event === "modify" || event === "add")) {
        const items = Zotero.Items.get(ids as number[]) as Zotero.Item[];
        for (const item of items) {
          // Check if it's an annotation being added/modified
          if (item.isAnnotation && item.isAnnotation()) {
            const parentId = item.parentItemID;
            if (parentId) {
              const parentItem = Zotero.Items.get(parentId) as Zotero.Item;
              if (parentItem && parentItem.isPDFAttachment()) {
                const topParentId = parentItem.parentItemID;
                if (topParentId) {
                  const topItem = Zotero.Items.get(topParentId) as Zotero.Item;
                  if (topItem) {
                    // Debounce: wait a bit for multiple changes
                    await Zotero.Promise.delay(2000);
                    await syncItemToCapacities(topItem, { force: true });
                  }
                }
              }
            }
          }
        }
      }
    },
  };

  const notifierID = Zotero.Notifier.registerObserver(callback, [
    "item",
  ]);

  // Unregister on shutdown
  Zotero.Plugins.addObserver({
    shutdown: () => {
      Zotero.Notifier.unregisterObserver(notifierID);
    },
  });
}

/**
 * Register right-click context menu item
 */
export function registerRightClickMenuItem(): void {
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: `${config.addonRef}-sync-to-capacities`,
    label: getString("menu-sync-to-capacities") || "Sync to Capacities",
    icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
    commandListener: async () => {
      await handleSyncSelected();
    },
  });

  // Add submenu for more options
  ztoolkit.Menu.register("item", {
    tag: "menu",
    id: `${config.addonRef}-capacities-menu`,
    label: getString("menu-capacities") || "Capacities",
    icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
    children: [
      {
        tag: "menuitem",
        id: `${config.addonRef}-sync-selected`,
        label: getString("menu-sync-selected") || "Sync Selected",
        commandListener: async () => {
          await handleSyncSelected();
        },
      },
      {
        tag: "menuitem",
        id: `${config.addonRef}-force-sync-selected`,
        label: getString("menu-force-sync") || "Force Sync (Re-sync)",
        commandListener: async () => {
          await handleSyncSelected({ force: true });
        },
      },
      {
        tag: "menuseparator",
      },
      {
        tag: "menuitem",
        id: `${config.addonRef}-open-preferences`,
        label: getString("menu-preferences") || "Preferences...",
        commandListener: () => {
          openPreferences();
        },
      },
    ],
  });
}

/**
 * Register Tools menu item
 */
export function registerToolsMenuItem(win: Window): void {
  ztoolkit.Menu.register("menuTools", {
    tag: "menu",
    id: `${config.addonRef}-tools-menu`,
    label: getString("menu-capacities") || "Capacities",
    children: [
      {
        tag: "menuitem",
        id: `${config.addonRef}-tools-sync`,
        label: getString("menu-sync-selected") || "Sync Selected Items",
        commandListener: async () => {
          await handleSyncSelected();
        },
      },
      {
        tag: "menuitem",
        id: `${config.addonRef}-tools-test-connection`,
        label: getString("menu-test-connection") || "Test Connection",
        commandListener: async () => {
          await handleTestConnection();
        },
      },
      {
        tag: "menuseparator",
      },
      {
        tag: "menuitem",
        id: `${config.addonRef}-tools-clear-cache`,
        label: getString("menu-clear-cache") || "Clear Sync History",
        commandListener: () => {
          handleClearCache();
        },
      },
      {
        tag: "menuseparator",
      },
      {
        tag: "menuitem",
        id: `${config.addonRef}-tools-preferences`,
        label: getString("menu-preferences") || "Preferences...",
        commandListener: () => {
          openPreferences();
        },
      },
    ],
  });
}

/**
 * Handle sync selected items
 */
async function handleSyncSelected(
  options: { force?: boolean } = {},
): Promise<void> {
  const client = getCapacitiesClient();

  if (!client.isConfigured()) {
    showAlert(
      getString("alert-not-configured-title") || "Not Configured",
      getString("alert-not-configured-message") ||
        "Please configure Capacities API token and Space ID in preferences.",
    );
    openPreferences();
    return;
  }

  const zp = Zotero.getActiveZoteroPane();
  const selectedItems = zp.getSelectedItems();

  if (selectedItems.length === 0) {
    showAlert(
      getString("alert-no-selection-title") || "No Selection",
      getString("alert-no-selection-message") ||
        "Please select one or more items to sync.",
    );
    return;
  }

  // Show progress window
  const progressWin = new ztoolkit.ProgressWindow(
    getString("progress-syncing") || "Syncing to Capacities",
    { closeOnClick: false },
  );

  progressWin
    .createLine({
      text: getString("progress-preparing") || "Preparing...",
      type: "default",
      progress: 0,
    })
    .show();

  try {
    const results = await syncSelectedItems({
      force: options.force,
      onProgress: (progress) => {
        const percent = Math.round((progress.current / progress.total) * 100);
        progressWin.changeLine({
          text: `[${percent}%] ${progress.currentItem || ""}`,
          progress: percent,
        });
      },
    });

    // Show results
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    progressWin.changeLine({
      text:
        getString("progress-complete") ||
        `Complete: ${successCount} synced, ${failCount} failed`,
      type: successCount > 0 ? "success" : "fail",
      progress: 100,
    });

    // Log failures
    for (const result of results.filter((r) => !r.success)) {
      ztoolkit.log(`Sync failed for "${result.itemTitle}": ${result.error}`);
    }

    progressWin.startCloseTimer(3000);
  } catch (err) {
    const error = err as Error;
    progressWin.changeLine({
      text: `Error: ${error.message}`,
      type: "fail",
      progress: 100,
    });
    progressWin.startCloseTimer(5000);
  }
}

/**
 * Handle test connection
 */
async function handleTestConnection(): Promise<void> {
  const client = getCapacitiesClient();
  client.refreshCredentials();

  if (!client.isConfigured()) {
    showAlert(
      getString("alert-not-configured-title") || "Not Configured",
      getString("alert-not-configured-message") ||
        "Please configure Capacities API token and Space ID in preferences.",
    );
    return;
  }

  const progressWin = new ztoolkit.ProgressWindow(
    getString("progress-testing") || "Testing Connection",
    { closeOnClick: true },
  );

  progressWin
    .createLine({
      text: getString("progress-connecting") || "Connecting to Capacities...",
      type: "default",
      progress: 50,
    })
    .show();

  try {
    const success = await client.testConnection();

    if (success) {
      progressWin.changeLine({
        text: getString("progress-connection-success") || "Connection successful!",
        type: "success",
        progress: 100,
      });
    } else {
      progressWin.changeLine({
        text: getString("progress-connection-failed") || "Connection failed",
        type: "fail",
        progress: 100,
      });
    }
  } catch (err) {
    const error = err as Error;
    progressWin.changeLine({
      text: `Error: ${error.message}`,
      type: "fail",
      progress: 100,
    });
  }

  progressWin.startCloseTimer(3000);
}

/**
 * Handle clear cache
 */
function handleClearCache(): void {
  clearProcessedItems();
  resetCapacitiesClient();

  const progressWin = new ztoolkit.ProgressWindow(
    getString("progress-cache-cleared") || "Cache Cleared",
    { closeOnClick: true },
  );

  progressWin
    .createLine({
      text: getString("progress-cache-cleared-message") || "Sync history has been cleared.",
      type: "success",
      progress: 100,
    })
    .show()
    .startCloseTimer(2000);
}

/**
 * Open preferences window
 */
function openPreferences(): void {
  Zotero.Utilities.Internal.openPreferences(config.addonID);
}

/**
 * Show alert dialog
 */
function showAlert(title: string, message: string): void {
  const win = Zotero.getMainWindow();
  if (win) {
    win.alert(`${title}\n\n${message}`);
  }
}

/**
 * Register item pane section showing sync status
 */
export function registerItemPaneSection(): void {
  Zotero.ItemPaneManager.registerSection({
    paneID: "capacities-sync-status",
    pluginID: config.addonID,
    header: {
      l10nID: `${config.addonRef}-itempane-header`,
      icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
    },
    sidenav: {
      l10nID: `${config.addonRef}-itempane-sidenav`,
      icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
    },
    onRender: ({ body, item }) => {
      if (!item || !item.isTopLevelItem()) {
        body.textContent = "";
        return;
      }

      const synced = isItemProcessed(item.key);
      const statusText = synced
        ? getString("status-synced") || "Synced to Capacities"
        : getString("status-not-synced") || "Not synced";

      body.innerHTML = `
        <div style="padding: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${synced ? "#5fb236" : "#888"};">
              ${synced ? "\u2713" : "\u25CB"}
            </span>
            <span>${statusText}</span>
          </div>
        </div>
      `;
    },
  });
}
