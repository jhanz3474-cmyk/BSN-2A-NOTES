import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const projectIndex = args.indexOf("--project");
const uidIndex = args.indexOf("--uid");
const projectId = projectIndex >= 0 ? args[projectIndex + 1] : "";
const uid = uidIndex >= 0 ? args[uidIndex + 1] : "";

if (!projectId || !uid) {
  console.error("Usage: node bootstrap-admin.mjs --project <staging-project-id> --uid <firebase-auth-uid>");
  process.exit(1);
}

if (projectId.toLowerCase() === "bsn-2a-notes") {
  throw new Error("Refusing to change administrator claims on the production project.");
}

const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const app = initializeApp({
  ...(emulatorHost ? {} : { credential: applicationDefault() }),
  projectId
});

const auth = getAuth(app);
const user = await auth.getUser(uid);

if (String(user.email || "").trim().toLowerCase() !== "tuyormark1@gmail.com") {
  throw new Error("The UID must belong to the owner-supplied initial administrator email.");
}
if (!user.emailVerified) {
  throw new Error("Verify the initial administrator email before assigning administrator claims.");
}

await auth.setCustomUserClaims(uid, {
  ...(user.customClaims || {}),
  approved: true,
  admin: true
});

console.log("Administrator claims were assigned in staging project " + projectId + " to UID " + uid + ".");
