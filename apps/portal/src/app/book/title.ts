/**
 * The public form's heading, shared by the page metadata, the server-rendered
 * content and the client-side form. It lives apart from book-page-content.tsx
 * because that file imports the server-only read (lib/bookings/public.ts): a
 * client component importing a constant from it pulls `server-only` into the
 * client bundle and fails the production build (confirmed by the first three
 * deployments of slice 4). Keep this file free of imports.
 */
export const BOOK_PAGE_TITLE = "Request production work from WUWF";
