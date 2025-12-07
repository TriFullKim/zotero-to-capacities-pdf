import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import { getCapacitiesClient, resetCapacitiesClient } from "./capacities";
import { clearProcessedItems, getSyncStats } from "./sync";

export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = _window;
  }

  updatePrefsUI();
  bindPrefEvents();
}

async function updatePrefsUI() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  // Update stats display
  const statsEl = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-stats`,
  ) as HTMLElement;
  if (statsEl) {
    const stats = getSyncStats();
    statsEl.textContent =
      getString("pref-stats") || `Synced items: ${stats.processedCount}`;
  }
}

function bindPrefEvents() {
  const doc = addon.data.prefs?.window?.document;
  if (!doc) return;

  // Test Connection button
  const testConnectionBtn = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-test-connection`,
  );
  testConnectionBtn?.addEventListener("click", async () => {
    await handleTestConnection();
  });

  // Fetch Spaces button
  const fetchSpacesBtn = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-fetch-spaces`,
  );
  fetchSpacesBtn?.addEventListener("click", async () => {
    await handleFetchSpaces();
  });

  // Clear Cache button
  const clearCacheBtn = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-clear-cache`,
  );
  clearCacheBtn?.addEventListener("click", () => {
    handleClearCache();
  });

  // API Token change
  const apiTokenInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-apiToken`,
  ) as HTMLInputElement;
  apiTokenInput?.addEventListener("change", () => {
    resetCapacitiesClient();
  });

  // Space ID change
  const spaceIdInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-spaceId`,
  ) as HTMLInputElement;
  spaceIdInput?.addEventListener("change", () => {
    resetCapacitiesClient();
  });
}

async function handleTestConnection() {
  const win = addon.data.prefs?.window;
  if (!win) return;

  const client = getCapacitiesClient();
  client.refreshCredentials();

  if (!client.isConfigured()) {
    win.alert(
      getString("alert-not-configured-message") ||
        "Please enter API Token and Space ID first.",
    );
    return;
  }

  try {
    const success = await client.testConnection();
    if (success) {
      win.alert(
        getString("alert-connection-success") || "Connection successful!",
      );
    } else {
      win.alert(
        getString("alert-connection-failed") ||
          "Connection failed. Please check your credentials.",
      );
    }
  } catch (err) {
    const error = err as Error;
    win.alert(`Connection error: ${error.message}`);
  }
}

async function handleFetchSpaces() {
  const win = addon.data.prefs?.window;
  if (!win) return;

  const doc = win.document;
  const client = getCapacitiesClient();
  client.refreshCredentials();

  const apiToken = getPref("apiToken");
  if (!apiToken) {
    win.alert(
      getString("alert-no-api-token") || "Please enter API Token first.",
    );
    return;
  }

  try {
    const response = await client.getSpaces();
    const spaces = response.spaces;

    if (spaces.length === 0) {
      win.alert(getString("alert-no-spaces") || "No spaces found.");
      return;
    }

    // Create a simple selection dialog
    const spaceList = spaces
      .map((s, i) => `${i + 1}. ${s.title} (${s.id})`)
      .join("\n");

    const selection = win.prompt(
      `${getString("prompt-select-space") || "Select a space (enter number)"}:\n\n${spaceList}`,
      "1",
    );

    if (selection) {
      const index = parseInt(selection, 10) - 1;
      if (index >= 0 && index < spaces.length) {
        const selectedSpace = spaces[index];
        setPref("spaceId", selectedSpace.id);

        // Update the input field
        const spaceIdInput = doc.querySelector(
          `#zotero-prefpane-${config.addonRef}-spaceId`,
        ) as HTMLInputElement;
        if (spaceIdInput) {
          spaceIdInput.value = selectedSpace.id;
        }

        resetCapacitiesClient();
        win.alert(
          `${getString("alert-space-selected") || "Space selected"}: ${selectedSpace.title}`,
        );
      }
    }
  } catch (err) {
    const error = err as Error;
    win.alert(`Error fetching spaces: ${error.message}`);
  }
}

function handleClearCache() {
  const win = addon.data.prefs?.window;
  if (!win) return;

  const confirmed = win.confirm(
    getString("confirm-clear-cache") ||
      "Are you sure you want to clear the sync history? This will allow all items to be synced again.",
  );

  if (confirmed) {
    clearProcessedItems();
    resetCapacitiesClient();
    updatePrefsUI();
    win.alert(getString("alert-cache-cleared") || "Sync history cleared.");
  }
}
