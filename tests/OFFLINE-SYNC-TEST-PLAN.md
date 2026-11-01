# Offline authorization acceptance checks

These checks use only local Firebase emulators. They do not change production Firebase configuration or data.

1. Start the Auth, Realtime Database, Storage, and Functions emulators with project ID `demo-bsn2a-notes`.
2. Serve this branch on `localhost` and open it with `?firebaseEmulator=1`. Create an account. Confirm it can read School Notes, cannot read Nursing Notes, and can create only its own registration request.
3. Create the initial admin account in the Auth emulator. While the emulator is running, set `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, then use the bootstrap script with the emulator project ID and that account's UID. Sign in as the admin. Confirm the registration request appears in the Group Members approval panel and approve the verified student.
4. Refresh the student token from the app. Confirm the student can read group content but cannot edit notes, reorder content, manage files, change roles, or write another user's presence.
5. Sign in as the admin, disconnect the browser, make a note change, then reconnect. Confirm the queued change appears in the emulator database.
6. While another admin-owned queue item is still offline, sign out and enter visitor mode. Reconnect. Confirm the queue does not replay and the visitor can read only School Notes.
7. Sign back in as the same admin. Confirm only that admin's UID-tagged queue items are sent and Firebase rules authorize them.
8. Check the Storage cases in `npm run test:rules`: visitors can read School Notes illustrations; approved members can read group attachments; only admins can upload.

Existing IndexedDB queue entries created by the group-password build have no Firebase UID and are intentionally not replayed. Review and recreate any needed unsynced edits as an administrator.
