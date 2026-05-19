---
feature: Carousel Management
number: 15
source-paths:
  - src/pages/admin/CarouselAdmin.tsx
diagram: ../diagrams/features/carousel-management.md
status: no diagram
---

## Intent
Allows admins to control the rotating image carousel on the homepage — uploading, reordering, and removing images.

## Key Behaviors
- View all carousel images sorted by order ascending, with thumbnail preview for http/https URLs
- Add new image via URL string (Firebase Storage upload is not implemented — deferred to future)
- Set display order via numeric order field; new items default to max existing order + 1
- Reorder images using up/down arrow buttons — swaps order field values between adjacent rows (two sequential Firestore writes)
- Edit any image record (title, imageUrl, alt text, description, order)
- Delete an image (window.confirm guard)

## Conditional Paths
- If no carousel images exist, homepage carousel shows nothing
- Order field determines display sequence — lower number appears first
- Save validates only that title is non-empty; imageUrl is not required
- Writes are blocked if no authenticated user is present (belt-and-suspenders check beyond RequireAuth)

## External Dependencies
- Firestore: carouselImages (CRUD)
- Firebase Auth (route guard)

## Known Issues
None

## Notes
CarouselImages are ordered by order field asc in useCarouselImages hook; admin should maintain sequential order values to avoid gaps
