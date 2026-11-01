import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

export const approveRegistration = onCall(
  {
    region: "asia-southeast1",
    enforceAppCheck: true,
    maxInstances: 5
  },
  async (request) => {
    if (
      !request.auth ||
      request.auth.token.admin !== true ||
      request.auth.token.email_verified !== true
    ) {
      throw new HttpsError("permission-denied", "Only a verified administrator can approve accounts.");
    }

    const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
    if (!uid || uid.length > 128) {
      throw new HttpsError("invalid-argument", "A valid account UID is required.");
    }

    const requestRef = getDatabase().ref("registrationRequests/" + uid);
    const requestSnapshot = await requestRef.get();
    if (!requestSnapshot.exists()) {
      throw new HttpsError("not-found", "This account has no registration request.");
    }

    const registration = requestSnapshot.val() || {};
    const auth = getAuth();
    const user = await auth.getUser(uid);

    if (!user.emailVerified) {
      throw new HttpsError("failed-precondition", "The student must verify their email before approval.");
    }
    if (
      !registration.email ||
      !user.email ||
      String(registration.email).trim().toLowerCase() !== String(user.email).trim().toLowerCase()
    ) {
      throw new HttpsError("failed-precondition", "The registration email does not match the Firebase account.");
    }

    const claims = { ...(user.customClaims || {}), approved: true };
    await auth.setCustomUserClaims(uid, claims);

    await requestRef.update({
      status: "approved",
      approvedAt: Date.now(),
      approvedBy: request.auth.uid
    });

    return { approved: true, uid };
  }
);
