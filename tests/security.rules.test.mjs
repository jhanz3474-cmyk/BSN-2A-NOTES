import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { get, ref as dbRef, set } from "firebase/database";
import { getBytes, ref as storageRef, uploadBytes } from "firebase/storage";

const projectId = "demo-bsn2a-notes";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    database: {
      rules: await readFile(new URL("../database.rules.json", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 9000
    },
    storage: {
      rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 9199
    }
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const database = context.database();
    await set(dbRef(database, "notes/private-1"), { title: "Private nursing note" });
    await set(dbRef(database, "memorize/public-1"), { title: "Public School Note" });
    await set(dbRef(database, "memorizeLayout"), { order: ["public-1"], updatedAt: 1, version: 1 });
    await set(dbRef(database, "registrationRequests/pending-1"), {
      email: "pending@example.com",
      name: "Pending Student",
      requestedAt: 1
    });
    await uploadBytes(
      storageRef(context.storage(), "group4-memorize-images/school.png"),
      new Uint8Array([1, 2, 3]),
      { contentType: "image/png" }
    );
    await uploadBytes(
      storageRef(context.storage(), "group4-note-files/group.pdf"),
      new Uint8Array([4, 5, 6]),
      { contentType: "application/pdf" }
    );
  });
});

describe("Realtime Database access", () => {
  it("lets visitors read only School Notes and their layout", async () => {
    const database = testEnv.unauthenticatedContext().database();
    await assertSucceeds(get(dbRef(database, "memorize")));
    await assertSucceeds(get(dbRef(database, "memorizeLayout")));
    await assertFails(get(dbRef(database, "notes")));
    await assertFails(get(dbRef(database, "schedule")));
    await assertFails(get(dbRef(database, "members")));
    await assertFails(get(dbRef(database, "files")));
    await assertFails(set(dbRef(database, "memorize/public-2"), { title: "No write" }));
  });

  it("limits pending accounts to their own request and no group data", async () => {
    const database = testEnv.authenticatedContext("pending-1", {
      email: "pending@example.com",
      email_verified: true
    }).database();
    await assertSucceeds(get(dbRef(database, "registrationRequests/pending-1")));
    await assertFails(get(dbRef(database, "registrationRequests/other-user")));
    await assertFails(get(dbRef(database, "notes")));
    await assertFails(get(dbRef(database, "schedule")));
    await assertFails(set(dbRef(database, "registrationRequests/other-user"), {
      email: "other@example.com",
      name: "Other",
      requestedAt: 2
    }));
    await assertFails(set(dbRef(database, "registrationRequests/pending-1/status"), "approved"));
    await assertFails(set(dbRef(database, "approvedUsers/pending-1"), true));
  });

  it("allows a student to create only their own registration request", async () => {
    const database = testEnv.authenticatedContext("new-student", {
      email: "new@example.com",
      email_verified: true
    }).database();
    await assertSucceeds(set(dbRef(database, "registrationRequests/new-student"), {
      email: "new@example.com",
      name: "New Student",
      requestedAt: Date.now()
    }));
    await assertFails(set(dbRef(database, "registrationRequests/new-student"), {
      email: "new@example.com",
      name: "Changed name",
      requestedAt: Date.now()
    }));
  });

  it("lets approved members read group content and write only their own presence", async () => {
    const database = testEnv.authenticatedContext("approved-1", {
      email: "student@example.com",
      email_verified: true,
      approved: true
    }).database();
    await assertSucceeds(get(dbRef(database, "notes")));
    await assertSucceeds(get(dbRef(database, "schedule")));
    await assertSucceeds(get(dbRef(database, "files")));
    await assertFails(set(dbRef(database, "notes/another"), { title: "No write" }));
    await assertSucceeds(set(dbRef(database, "presence/approved-1"), {
      name: "Student",
      connected: true,
      lastSeen: Date.now(),
      updatedAt: Date.now()
    }));
    await assertFails(set(dbRef(database, "presence/other-user"), {
      name: "Student",
      connected: true,
      lastSeen: Date.now(),
      updatedAt: Date.now()
    }));
  });

  it("gives administrators group write access but no client role-management path", async () => {
    const database = testEnv.authenticatedContext("admin-1", {
      email: "admin@example.com",
      email_verified: true,
      admin: true,
      approved: true
    }).database();
    await assertSucceeds(get(dbRef(database, "registrationRequests")));
    await assertSucceeds(set(dbRef(database, "notes/admin-created"), { title: "Allowed" }));
    await assertSucceeds(set(dbRef(database, "memorize/admin-created"), { title: "Allowed" }));
    await assertFails(set(dbRef(database, "approvedUsers/student-1"), true));
    await assertFails(set(dbRef(database, "registrationRequests/pending-1/status"), "approved"));
  });
});

describe("Cloud Storage access", () => {
  it("allows public School Notes images, but denies visitor access to group files", async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(storageRef(storage, "group4-memorize-images/school.png")));
    await assertFails(getBytes(storageRef(storage, "group4-note-files/group.pdf")));
  });

  it("lets approved members read group files but not upload", async () => {
    const storage = testEnv.authenticatedContext("approved-1", {
      email: "student@example.com",
      email_verified: true,
      approved: true
    }).storage();
    await assertSucceeds(getBytes(storageRef(storage, "group4-note-files/group.pdf")));
    await assertFails(uploadBytes(
      storageRef(storage, "group4-files/student-upload.txt"),
      new Uint8Array([7, 8]),
      { contentType: "text/plain" }
    ));
  });

  it("allows administrators to upload group files", async () => {
    const storage = testEnv.authenticatedContext("admin-1", {
      email: "admin@example.com",
      email_verified: true,
      admin: true,
      approved: true
    }).storage();
    await assertSucceeds(uploadBytes(
      storageRef(storage, "group4-files/admin-upload.txt"),
      new Uint8Array([9, 10]),
      { contentType: "text/plain" }
    ));
  });
});
