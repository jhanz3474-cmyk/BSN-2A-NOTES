# BSN 2A Notes — Firebase Authentication and security migration

**Status:** Prepared on `secure-firebase-auth-migration`; not deployed.  
**Production branch:** `main` remains unchanged.  
**Production Firebase:** No Console configuration, Auth user, database record, Storage object, or rule was changed.

## Findings on the target branch

- The branch had a migration plan and emulator configuration, but no `database.rules.json` or `storage.rules`, even though `firebase.json` referenced both.
- The app used a shared client-side group password and a client-side admin password. Neither established an identity Firebase could authorize.
- The Realtime Database paths used by the app are `notes`, `noteLayout`, `memorize`, `memorizeLayout`, `schedule`, `members`, `files`, and `presence`.
- Uploaded files use `group4-note-images`, `group4-note-files`, `group4-memorize-images`, and `group4-files`.
- Local offline writes were held in a shared IndexedDB queue and replayed without an account identity.
- The page calls Firebase AI Logic directly from the browser. `AI_NOTES_SETUP.md` describes a Cloudflare/OpenAI Worker that is absent from the checked branch; this needs owner review before AI access can be claimed as server-authorized.

## Prepared on this branch

- Replaced shared-password login with Firebase email/password sign-in and registration, verification email, and a pending-approval state.
- Added a registration request record that each signed-in user can create once under their own UID.
- Added an App Check protected callable function for an administrator to approve a verified request. The function grants the `approved` custom claim using the Admin SDK.
- Added a guarded bootstrap script for the owner-supplied initial administrator, `tuyormark1@gmail.com`. It requires the account UID, checks the email and verification state, and refuses project ID `bsn-2a-notes`.
- Added Realtime Database and Storage rules. Visitors can read only School Notes and its layout, plus the School Notes image folder. Approved users can read group content and their permitted presence data. Only administrators can write group content or upload files. Presence writes are restricted to `presence/{auth.uid}`.
- Changed Storage uploads and reads to store object paths and use the SDK's rules-checked `getBlob()` operation instead of creating new download-token URLs. Existing token URLs found inside note HTML or file records are resolved to Storage paths in the client before display; records are not rewritten.
- Bound offline queue entries to the current Firebase UID, limited queue replay to administrators, and left legacy untagged entries unsubmitted. Firebase rules still re-authorize every online write.
- Added an explicit localhost-only emulator switch and refreshed the service-worker cache version and module list.

## Tests and local checks

- Added Realtime Database and Storage emulator rules tests in `tests/security.rules.test.mjs`.
- Added manual offline authorization checks in `tests/OFFLINE-SYNC-TEST-PLAN.md`.
- Static JSON parsing and JavaScript syntax checks pass. The emulator suite could not run in the authoring environment because Firebase CLI, npm, and installed dependencies are unavailable; install dependencies and run `npm run test:rules` before rollout.
- The branch has not been deployed and this plan does not apply rules or create Firebase Auth accounts.

## Owner setup still required

1. In a staging Firebase project, enable Email/Password and email verification in Authentication.
2. Replace the hardcoded web app config on this branch with the staging app's config before running against a real project. The current production project ID is blocked at app startup unless the local emulator switch is selected.
3. Create and verify the initial administrator account for `tuyormark1@gmail.com`, copy its UID, then run `functions/bootstrap-admin.mjs` against the staging project. Use Application Default Credentials for staging; no password is stored in the repository.
4. Deploy the callable function only after the staging project, App Check provider, and Functions billing setup are ready. Cloud Functions deployment requires an eligible billing plan.
5. Configure Storage CORS for the staging app origin so browser `getBlob()` reads can succeed.
6. Test account registration, approval, read/write denials, presence ownership, uploads, downloads, and offline replay in the emulators and a staging project before considering any production rollout.
7. Before changing production, back up the Realtime Database and Storage objects/rules. Existing Storage download URLs use long-lived revokable tokens; owners should review/revoke exposed legacy tokens in Firebase Console. This branch does not rewrite existing data or revoke tokens.
8. Move AI generation behind a trusted backend that checks the admin claim before treating AI access as admin-only. The existing browser SDK call is gated in the interface but Firebase Realtime Database and Storage rules do not protect that AI endpoint.

## Rollout boundary

Do not deploy these rules or functions, merge the branch, or change production Firebase configuration/data until the staging configuration and emulator/staging checks are complete and the owner approves the rollout.
