import { bodyOf, failIfNotOk, get, post } from "./api";
import { showHUD } from "@raycast/api";

export type Availability =
  | "Available"
  | "Busy"
  | "DoNotDisturb"
  | "BeRightBack"
  | "Away"
  | "Offline"
  | "PresenceUnknown"
  | "OffWork"
  | "OutOfOffice";

type Activity =
  | "Available"
  | "Busy"
  | "DoNotDisturb"
  | "BeRightBack"
  | "Away"
  | "OffWork"
  | "Unknown"
  | "OutOfOffice";

function activityFor(availability: Availability): Activity {
  switch (availability) {
    case "Offline":
      return "OffWork";
    case "PresenceUnknown":
      return "Unknown";
    case "OutOfOffice":
      return "OutOfOffice";
    default:
      return availability;
  }
}

function readableAvailability(availability: Availability) {
  return availability
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();
}

export interface Presence {
  id: string;
  availability: string;
  activity: string;
  outOfOfficeSettings?: {
    message: string;
  };
}

export interface MailboxSettings {
  automaticRepliesSetting: {
    status: "disabled" | "alwaysEnabled" | "scheduled";
    externalAudience: "none" | "contactsOnly" | "all";
    scheduledStartDateTime: {
      dateTime: string;
      timeZone: string;
    };
    scheduledEndDateTime: {
      dateTime: string;
      timeZone: string;
    };
    internalReplyMessage: string;
    externalReplyMessage: string;
  };
}

export function defaultPresence(): Presence {
  return { id: "", availability: "PresenceUnknown", activity: "PresenceUnknown" };
}

export async function getPresence(entityId?: string): Promise<Presence> {
  try {
    const userId = entityId ? extractUserId(entityId) : "me";
    if (!userId) {
      console.warn(`Invalid user ID for presence request: ${entityId}`);
      return defaultPresence();
    }
    const path = userId === "me" ? "/me/presence" : `/users/${userId}/presence`;
    console.log(`Fetching presence for userId: ${userId}`);
    const response = await get({ path });
    await failIfNotOk(response, "Getting presence");
    const presence = await bodyOf<Presence>(response);

    // Log the presence data received from the API
    console.log(`Presence data for userId ${userId}:`, presence);

    if (!presence.availability || !presence.activity) {
      console.warn("Presence data is incomplete:", presence);
    }

    // Check if out of office is enabled
    if (presence.outOfOfficeSettings && presence.outOfOfficeSettings.message) {
      presence.availability = "OutOfOffice";
      presence.activity = "OutOfOffice";
    }

    return presence;
  } catch (error) {
    console.error(`Error fetching presence for entityId: ${entityId}`, error);
    return defaultPresence();
  }
}

export async function getMailboxSettings(entityId?: string): Promise<MailboxSettings> {
  try {
    const userId = entityId ? extractUserId(entityId) : "me";
    if (!userId) {
      console.warn(`Invalid user ID for mailbox settings request: ${entityId}`);
      throw new Error("Invalid user ID");
    }
    const path = userId === "me" ? "/me/mailboxSettings" : `/users/${userId}/mailboxSettings`;
    console.log(`Fetching mailbox settings for userId: ${userId}`);
    const response = await get({ path });
    await failIfNotOk(response, "Getting mailbox settings");
    const mailboxSettings = await bodyOf<MailboxSettings>(response);

    // Log the mailbox settings data received from the API
    console.log(`Mailbox settings data for userId ${userId}:`, mailboxSettings);

    return mailboxSettings;
  } catch (error) {
    console.error(`Error fetching mailbox settings for entityId: ${entityId}`, error);
    if (error.message.includes("403")) {
      console.warn("Access denied to mailbox settings. Check if MailboxSettings.Read permission is granted.");
    }
    throw error;
  }
}

function extractUserId(entityId: string): string {
  if (entityId.startsWith("19:") || entityId.includes("thread.v2") || entityId.includes("spaces")) {
    console.warn(`Invalid user ID for presence request: ${entityId}`);
    return ""; // Return an empty string for invalid IDs
  }
  try {
    const parts = entityId.split("@")[0];
    if (parts.includes(":")) {
      return parts.split(":")[1];
    }
    return entityId;
  } catch (error) {
    console.error("Error extracting user ID:", error);
    throw error;
  }
}

async function setPreferredPresence(availability: Availability) {
  const response = await post({
    path: "/me/presence/setUserPreferredPresence",
    body: {
      availability,
      activity: activityFor(availability),
    },
  });
  await failIfNotOk(response, "Setting presence");
}

export async function clearPreferredPresence() {
  const response = await post({
    path: "/me/presence/clearUserPreferredPresence",
    body: {},
  });
  await failIfNotOk(response, "Clearing presence");
}

export async function getAvailability() {
  const presence = await getPresence();
  return presence.availability;
}

export async function setAvailability(availability?: Availability) {
  if (availability) {
    await setPreferredPresence(availability);
  } else {
    await clearPreferredPresence();
  }
  switch (availability) {
    case undefined:
      return await showHUD("Reset availability to default");
    case "Busy":
    case "DoNotDisturb":
      return await showHUD(`Set status to "${readableAvailability(availability)}" (expires in 1 day)`);
    default:
      return await showHUD(`Set status to "${readableAvailability(availability)}" (expires in 7 days)`);
  }
}
