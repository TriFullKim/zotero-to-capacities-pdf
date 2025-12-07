# Zotero Capacities

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Sync your Zotero PDF annotations to [Capacities](https://capacities.io) - the studio for your mind.

## Features

- **PDF Annotation Sync**: Export highlights, underlines, and notes from PDFs to Capacities
- **Color-coded Highlights**: Annotations are displayed with color emojis matching Zotero's highlight colors
- **Deep Links**: Click on page numbers in Capacities to jump directly to the annotation in Zotero
- **Metadata Extraction**: Automatically includes authors, publication date, DOI, and tags
- **Duplicate Prevention**: Tracks synced items to avoid duplicates
- **Auto-sync** (Optional): Automatically sync when annotations change

## Output Example

```markdown
## Annotations

**Authors:** John Doe, Jane Smith
**Date:** 2024
**DOI:** 10.1234/example

---

> 🟡 This is a highlighted text from the PDF. [_(p.25)_](zotero://open-pdf/...)

Your comment on this highlight goes here.

---

> 🔴 Another important highlight with red color. [_(p.42)_](zotero://open-pdf/...)

Additional notes about this section.
```

## Installation

1. Download the latest `.xpi` file from [Releases](https://github.com/TriFullKim/zotero-capacities/releases)
2. In Zotero, go to `Tools` → `Add-ons`
3. Click the gear icon and select `Install Add-on From File...`
4. Select the downloaded `.xpi` file

## Configuration

### 1. Get Capacities API Token

1. Open Capacities desktop app
2. Go to `Settings` → `Capacities API`
3. Generate and copy your API token

### 2. Get Space ID

1. In Capacities, go to `Settings` → `Space settings`
2. Copy your Space ID

### 3. Configure Plugin

1. In Zotero, go to `Tools` → `Capacities` → `Preferences...`
2. Enter your API Token and Space ID
3. Click `Test Connection` to verify
4. Or click `Fetch Spaces` to select from available spaces

## Usage

### Sync Selected Items

1. Select one or more items in your Zotero library
2. Right-click and select `Sync to Capacities`
3. Or use `Tools` → `Capacities` → `Sync Selected Items`

### Context Menu Options

| Option                   | Description                                |
| ------------------------ | ------------------------------------------ |
| **Sync to Capacities**   | Sync selected items (skips already synced) |
| **Force Sync (Re-sync)** | Re-sync items even if already synced       |

### Zotero Deep Links

Each annotation includes a clickable link like `[*(p.25)*](zotero://open-pdf/...)` that:

- Opens Zotero if not running
- Opens the PDF in Zotero's reader
- Jumps to the exact page and annotation

## Color Mapping

| Zotero Color | Emoji |
| ------------ | ----- |
| Yellow       | 🟡    |
| Red          | 🔴    |
| Green        | 🟢    |
| Blue         | 🔵    |
| Purple       | 🟣    |
| Orange       | 🟠    |
| Gray         | ⚪    |

## Settings

| Setting                  | Description                        |
| ------------------------ | ---------------------------------- |
| **API Token**            | Your Capacities API token          |
| **Space ID**             | Target Capacities space            |
| **Auto-sync**            | Enable automatic sync              |
| **Sync on change**       | Sync when annotations are modified |
| **Include page numbers** | Show page numbers in output        |
| **Include tags**         | Include annotation tags            |
| **Use color emoji**      | Use colored emoji for highlights   |

## API Limitations

- **Rate Limit**: 10 requests per 60 seconds
- **PDF Upload**: Capacities API does not support direct PDF upload. The plugin uses weblinks with DOI/URL.
- **Best Results**: Items with DOI or URL field work best for linking

## Development

### Prerequisites

- Node.js (LTS version)
- Zotero 7 Beta

### Setup

```bash
git clone https://github.com/TriFullKim/zotero-capacities.git
cd zotero-capacities
npm install
```

### Development

```bash
# Start development server with hot reload
npm start

# Build for production
npm run build

# Release new version
npm run release
```

### Project Structure

```
src/
├── modules/
│   ├── capacities.ts      # Capacities API client
│   ├── annotations.ts     # Annotation extraction & markdown formatting
│   ├── sync.ts            # Sync logic & tracking
│   ├── capacitiesUI.ts    # UI components (menus, panels)
│   └── preferenceScript.ts
├── hooks.ts               # Plugin lifecycle
└── index.ts               # Entry point
```

## Credits

- Built with [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
- Inspired by [zotero-to-capacities](https://github.com/davidjaggi/zotero-to-capacities) (Python)
- Uses [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)

## License

AGPL-3.0-or-later

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- [Report Issues](https://github.com/TriFullKim/zotero-capacities/issues)
- [Capacities Documentation](https://docs.capacities.io)
- [Zotero Forums](https://forums.zotero.org)
