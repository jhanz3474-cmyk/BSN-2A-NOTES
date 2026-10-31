# BSN 2A Notes — Firebase Authentication Migration (staging only)

Target branch: `secure-firebase-auth-migration`
Production branch: `main` (must remain unchanged until migration is tested)
Initial administrator email supplied by owner: `tuyormark1@gmail.com`

## Current-state findings

- The current page imports Firebase App, Realtime Database, Storage, App Check, and Firebase AI Logic.
- The current login is a client-side group-password check using localStorage; it is not Firebase Authentication.
- The admin check is a client-side password comparison; it is not a trusted authorization boundary.
- The Realtime Database currently has public root read/write rules (`.read: true`, `.write: true`), as shown in the owner's Firebase Console screenshot.
- The app uses Realtime Database collections including notes, memorize, noteLayout, memorizeLayout, schedule, members, files, and presence, plus offline IndexedDB queues.
- Gemini is invoked through Firebase AI Logic. No OpenAI API endpoint or OpenAI secret key was found in the inspected current page.
- The Firebase web config includes a public Firebase API key. This is expected for a web client, but API restrictions, App Check, and Firebase rules must be configured correctly.

## Required target behavior

1. Each group student has an individual Firebase Authentication email/password account.
2. New registrations remain pending until an administrator approves them.
3. Anonymous visitors can read School Notes (the existing `memorize` content and its layout) only.
4. Approved group members can read group content and use member features.
5. Only trusted administrators can create, edit, delete, reorder, or manage group content, members, files, schedules, and AI access.
6. Presence writes are limited to the authenticated user's own presence record.
7. Offline mode remains a local cache/queue only. Queued writes must be re-authorized by Firebase when connectivity returns; offline UI state is never proof of authorization.
8. Existing records must not be deleted or rewritten as part of the migration.

## Authorization design (must be validated against every actual data path)

Use Firebase Authentication as the identity source. Use trusted admin authorization, preferably custom claims set by a trusted Admin SDK environment, or a carefully bootstrapped server-controlled role record. Never let a client write its own admin/approval status.

Suggested Realtime Database structure for a role-record design:
- `admins/{uid}: true` — provisioned only by project owner through trusted console/Admin SDK; clients cannot write this path.
- `approvedUsers/{uid}: true` — written only by an administrator; a user may read only their own status.
- All default access denied.
- `memorize` and `memorizeLayout`: public read, admin write.
- Group data paths: approved-user read, admin write.
- `presence/{uid}`: approved-user read as needed; user may write only their own record.
- Admin/approval role paths: no client writes.

This is a design outline, NOT deployable rules yet. Exact rules must be reconciled with the app's complete path inventory and any multi-location updates before publication. Realtime Database rules cascade; no broad parent grant may override child restrictions.

## Migration blockers / required owner actions

- Enable Email/Password in Firebase Authentication.
- Confirm the Firebase project is on Spark or Blaze and review current Gemini/Firebase usage.
- Create the first Firebase Auth account for `tuyormark1@gmail.com`; do not send its password to anyone or commit it.
- Obtain that account's UID, then provision its administrator role using a trusted owner-only process.
- Decide how student approval is performed (admin UI backed by trusted authorization, or controlled Firebase Console operation during the first phase).
- Inspect and write Storage rules separately; Realtime Database rules do not secure Firebase Storage.
- Check Firebase App Check enforcement and API-key restrictions.
- Test login, registration, visitor access, admin access, denied access, AI requests, uploads/downloads, offline queue replay, and existing data on a staging project before deploying.

## Rollout safety

- Do not change production Realtime Database rules until the new client is deployed and verified against staging.
- Do not merge this branch into `main` until the owner approves the tested migration.
- Export/backup Realtime Database data and current Storage rules before rollout.
- If any test fails, keep production rules and the production site unchanged.
