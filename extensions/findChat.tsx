import { useEffect, useState, useMemo, useCallback } from "react";
import { Chat, findChats } from "./api/chat";
import { ActionPanel, Icon, List } from "@raycast/api";
import { currentUserId } from "./api/user";
import { OpenUrlAction } from "./api/util";
import { CallType, callUser } from "./actions/callAction";
import { usePromise } from "@raycast/utils";
import { getPresence, Presence, defaultPresence } from "./api/presence";
import { usePromiseWithTimeout } from "./hooks/usePromiseWithTimeout";

const chatIcon = {
  oneOnOne: Icon.Person,
  group: Icon.TwoPeople,
  meeting: Icon.Calendar,
};

const presenceIcon: Record<string, string> = {
  Available: "presence/presence_available.svg",
  Away: "presence/presence_away.svg",
  BeRightBack: "presence/presence_away.svg",
  Busy: "presence/presence_busy.svg",
  DoNotDisturb: "presence/presence_dnd.svg",
  InACall: "presence/presence_dnd.svg",
  InAConferenceCall: "presence/presence_dnd.svg",
  Inactive: "presence/presence_offline.svg",
  InAMeeting: "presence/presence_dnd.svg",
  Offline: "presence/presence_offline.svg",
  OffWork: "presence/presence_oof.svg",
  OutOfOffice: "presence/presence_oof.svg",
  PresenceUnknown: "presence/presence_unknown.svg",
  Presenting: "presence/presence_dnd.svg",
  UrgentInterruptionsOnly: "presence/presence_dnd.svg",
};

function chatMemberNames(chat: Chat) {
  const meId = currentUserId();
  const membersButMe = chat.members?.filter((m) => m.userId !== meId);
  return membersButMe?.map((m) => m.displayName) ?? [];
}

function chatTitle(chat: Chat) {
  if (chat.topic) {
    return chat.topic;
  } else {
    const memberNames = chatMemberNames(chat);
    if (memberNames.length) {
      return memberNames.join(", ");
    } else {
      const msgFrom = chat.lastMessagePreview?.from;
      return msgFrom?.application?.displayName ?? msgFrom?.user?.displayName ?? "Unknown";
    }
  }
}

function isValidUserId(userId: string): boolean {
  // Example condition to filter out invalid IDs
  // Assuming valid IDs do not contain ':' and end with '@unq.gbl.spaces'
  return /^[a-f0-9-]{36}$/i.test(userId) && userId !== 'ff6a14a4-44a0-46ac-9eb8-efa979e5e70d';
}

function extractValidUserId(memberId: string): string | null {
  const userId = memberId.split("@")[0];
  if (isValidUserId(userId)) {
    return userId; // Extract the part before '@' which should be the valid user ID
  }
  console.warn(`Invalid user ID for presence request: ${memberId}`);
  return null;
}

function ChatItem({ chat }: { chat: Chat }) {
  const [availability, setAvailability] = useState<string | undefined>(undefined);
  const [iconSource, setIconSource] = useState(chatIcon.oneOnOne); // Default icon

  useEffect(() => {
    if (chat.chatType === "group") {
      setIconSource(chatIcon.group);
      setAvailability(undefined); // No presence status for groups
    } else if (chat.chatType === "meeting") {
      setIconSource(chatIcon.meeting);
      setAvailability(undefined); // No presence status for meetings
    } else {
      const validUserIds = chat.members
        ?.map((m) => extractValidUserId(m.userId))
        .filter((id): id is string => id !== null); // Filter out null values

      const uniqueUserIds = Array.from(new Set(validUserIds)); // Ensure unique user IDs

      console.log("Valid user IDs:", validUserIds);
      console.log("Unique user IDs:", uniqueUserIds);

      async function fetchPresence() {
        if (uniqueUserIds && uniqueUserIds.length > 0) {
          try {
            const presencePromises = uniqueUserIds.map((userId) => {
              console.log(`Fetching presence for userId: ${userId}`);
              return getPresence(userId);
            });

            const presences = await Promise.all(presencePromises);

            console.log("Presence data received:", presences);

            // Combine the presence status, prioritize any non-unknown statuses
            const combinedPresence = presences.find((p) => p.availability === "OutOfOffice") ||
              presences.find((p) => p.availability !== "PresenceUnknown") || defaultPresence();

            setAvailability(combinedPresence.availability);
          } catch (error) {
            console.error("Error fetching presence:", error);
            setAvailability("PresenceUnknown");
          }
        } else {
          setAvailability("PresenceUnknown");
        }
      }

      fetchPresence();
    }
  }, [chat]);

  return (
    <List.Item
      icon={{ source: availability !== undefined ? presenceIcon[availability] || iconSource : iconSource }}
      title={chatTitle(chat)}
      accessories={[{ tag: new Date(chat.lastMessagePreview?.createdDateTime ?? chat.createdDateTime) }]}
      actions={
        <ActionPanel>
          <OpenUrlAction url={chat.webUrl} />
          <OpenUrlAction
            title={"Call Audio"}
            url={chat.webUrl}
            callback={() => callUser(CallType.Audio)}
            icon={Icon.Phone}
            shortcut={{ modifiers: ["cmd"], key: "a" }}
          />
          <OpenUrlAction
            title={"Call Video"}
            url={chat.webUrl}
            callback={() => callUser(CallType.Video)}
            icon={Icon.Camera}
            shortcut={{ modifiers: ["cmd"], key: "v" }}
          />
        </ActionPanel>
      }
    />
  );
}

export default function FindChat() {
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  // Debounce the query input
  const debouncedSetQuery = useMemo(
    () =>
      debounce((query: string) => {
        setDebouncedQuery(query);
      }, 500),
    []
  );

  const handleSearchChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      debouncedSetQuery(newQuery);
    },
    [debouncedSetQuery]
  );

  const { isLoading, data } = usePromise(() => (debouncedQuery ? findChats(debouncedQuery) : Promise.resolve([] as Chat[])), [debouncedQuery]);

  console.log("Search query:", query);
  console.log("Debounced query:", debouncedQuery);
  console.log("Chats data:", data);

  return (
    <List filtering={false} isLoading={isLoading} searchText={query} onSearchTextChange={handleSearchChange}>
      {data?.map((chat) => (
        <ChatItem key={chat.id} chat={chat} />
      ))}
    </List>
  );
}

// Debounce function implementation
function debounce(fn: (...args: any[]) => void, delay: number) {
  let timeoutId: NodeJS.Timeout | undefined;
  return function (...args: any[]) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
