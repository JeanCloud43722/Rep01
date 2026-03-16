# Knowledge Base — AI Guest Assistant

Place your restaurant's documents here. Supported formats: **PDF, DOCX, TXT, MD**.

## Folder structure

| Folder | What to put here |
|--------|-----------------|
| `menus/` | Current menu PDFs, daily specials, wine lists, seasonal menus |
| `ingredients/` | Allergen information, ingredient lists, nutritional facts |
| `events/` | Event schedules, private dining info, catering packages |
| `facilities/` | Parking instructions, opening hours, location, accessibility info |

You can add sub-folders freely — the category shown to the AI is the top-level folder name.

## Reloading

After adding or updating documents, restart the server (`npm run dev`) to re-index. The documents are processed automatically on startup.

## Tips

- Keep documents up to date — the AI answers based exactly on what's here.
- Plain text (`.txt` or `.md`) files are fastest to process and most reliable.
- For PDFs, ensure the text is selectable (not a scanned image).
- Short, clearly-named files help the AI cite sources accurately.
