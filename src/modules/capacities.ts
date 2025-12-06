/**
 * Capacities API Client
 * Handles all interactions with the Capacities API
 */

import { getPref } from "../utils/prefs";

const API_BASE_URL = "https://api.capacities.io";

export interface SaveWeblinkParams {
  url: string;
  titleOverwrite?: string;
  descriptionOverwrite?: string;
  tags?: string[];
  mdText?: string;
}

export interface SaveWeblinkResponse {
  spaceId: string;
  id: string;
  structureId: string;
  title: string;
  description: string;
  tags: string[];
}

export interface SpaceInfo {
  id: string;
  title: string;
  icon?: {
    type: "emoji" | "iconify";
    val: string;
    color?: string;
    colorHex?: string;
  };
}

export interface CapacitiesError {
  status: number;
  message: string;
}

export class CapacitiesClient {
  private apiToken: string;
  private spaceId: string;

  constructor() {
    this.apiToken = getPref("apiToken") || "";
    this.spaceId = getPref("spaceId") || "";
  }

  /**
   * Refresh credentials from preferences
   */
  public refreshCredentials(): void {
    this.apiToken = getPref("apiToken") || "";
    this.spaceId = getPref("spaceId") || "";
  }

  /**
   * Check if the client is properly configured
   */
  public isConfigured(): boolean {
    return Boolean(this.apiToken && this.spaceId);
  }

  /**
   * Get current space ID
   */
  public getSpaceId(): string {
    return this.spaceId;
  }

  /**
   * Make an API request to Capacities
   */
  private async makeRequest<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST";
      body?: object;
    } = {},
  ): Promise<T> {
    const { method = "GET", body } = options;

    if (!this.apiToken) {
      throw new Error("Capacities API token not configured");
    }

    const requestInit: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
    };

    if (body) {
      requestInit.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, requestInit);

    if (!response.ok) {
      const errorText = await response.text();
      throw {
        status: response.status,
        message: `Capacities API error: ${response.status} ${response.statusText} - ${errorText}`,
      } as CapacitiesError;
    }

    const text = await response.text();
    if (!text.trim()) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Get list of spaces
   */
  public async getSpaces(): Promise<{ spaces: SpaceInfo[] }> {
    return this.makeRequest<{ spaces: SpaceInfo[] }>("/spaces");
  }

  /**
   * Save a weblink to Capacities
   * The weblink will be analyzed and saved as appropriate object type (MediaPDF, MediaWebResource, etc.)
   */
  public async saveWeblink(
    params: SaveWeblinkParams,
  ): Promise<SaveWeblinkResponse> {
    if (!this.spaceId) {
      throw new Error("Capacities Space ID not configured");
    }

    const requestBody = {
      spaceId: this.spaceId,
      url: params.url,
      ...(params.titleOverwrite && {
        titleOverwrite: params.titleOverwrite.slice(0, 500),
      }),
      ...(params.descriptionOverwrite && {
        descriptionOverwrite: params.descriptionOverwrite.slice(0, 1000),
      }),
      ...(params.tags && { tags: params.tags.slice(0, 30) }),
      ...(params.mdText && { mdText: params.mdText.slice(0, 200000) }),
    };

    return this.makeRequest<SaveWeblinkResponse>("/save-weblink", {
      method: "POST",
      body: requestBody,
    });
  }

  /**
   * Save content to today's daily note
   */
  public async saveToDailyNote(
    mdText: string,
    options: { noTimestamp?: boolean } = {},
  ): Promise<void> {
    if (!this.spaceId) {
      throw new Error("Capacities Space ID not configured");
    }

    const requestBody = {
      spaceId: this.spaceId,
      mdText: mdText.slice(0, 200000),
      ...(options.noTimestamp !== undefined && {
        noTimeStamp: options.noTimestamp,
      }),
    };

    await this.makeRequest<void>("/save-to-daily-note", {
      method: "POST",
      body: requestBody,
    });
  }

  /**
   * Test the connection to Capacities
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.getSpaces();
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let clientInstance: CapacitiesClient | null = null;

export function getCapacitiesClient(): CapacitiesClient {
  if (!clientInstance) {
    clientInstance = new CapacitiesClient();
  }
  return clientInstance;
}

export function resetCapacitiesClient(): void {
  clientInstance = null;
}
