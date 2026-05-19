---
feature: League Documents
number: 10
source-paths:
  - src/components/BylawsModal.tsx
diagram: ../diagrams/features/league-documents.md
status: no diagram
---

## Intent
Lets members read or download the official league bylaws without leaving the site.

## Key Behaviors
- Click Bylaws in the hamburger dropdown to open BylawsModal
- View PDF embedded in iframe via Google Drive embed URL (when source type is 'pdf')
- View inline HTML content (when source type is 'text')
- Download link available in modal header for PDF documents

## Conditional Paths
- If no active bylaws document exists in Firestore, modal shows "No bylaws document available"
- Loading state shown while Firestore query is in flight
- If source.type is 'pdf': renders an iframe using driveEmbedUrl plus a download fallback link using driveDownloadUrl
- If source.type is 'text': renders doc.source.content via dangerouslySetInnerHTML

## External Dependencies
- Firestore: documents collection (useActiveDocument queries type='bylaws', seasonYear='2025-2026', active=true)
- Google Drive embed URL constructed by driveEmbedUrl; download URL by driveDownloadUrl — both from src/utils/drive.ts

## Known Issues
**Hardcoded season year:** `BylawsModal` calls `useActiveDocument('bylaws', '2025-2026')` (`BylawsModal.tsx:46`) with a literal season string instead of reading from `useSeasonYear()`. The bylaws document for future seasons will not display after rollover. Fix: call `useSeasonYear()` and pass the result as the second argument.

## Notes
Document file IDs are stored in Firestore; actual PDFs live in Google Drive. The modal supports both PDF (Drive iframe) and plain HTML text render modes.
