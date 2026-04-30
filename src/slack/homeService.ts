import { slackConfig } from "../config/env";
import type {
  Member,
  SlackChannelKey,
  SlackHomeAlert,
  SlackHomeChannel,
  SlackHomeMeetingRecap,
  SlackHomeResponse,
  SlackHomeSummary,
  SlackHomeTodo,
} from "../domain/types";
import {
  SlackWebClient,
  type SlackClient,
  type SlackMessage,
  type SlackUserGroup,
} from "./client";

const slackChannelLabels: Record<SlackChannelKey, string> = {
  build: "build",
  meetingPlansRecaps: "meeting-plans-n-recaps",
  programming: "programming",
  scoutingStrategy: "scouting-n-strategy",
  transportationAttendance: "transportation-attendance",
};

const slackChannelOrder = Object.keys(slackChannelLabels) as SlackChannelKey[];
const summaryChannels = new Set<SlackChannelKey>([
  "build",
  "programming",
  "scoutingStrategy",
  "transportationAttendance",
]);

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function findMemberForEmail(members: Member[], email: string | null) {
  if (!email) {
    return null;
  }

  return (
    members.find((member) => normalizeEmail(member.email) === email) ?? null
  );
}

function getConfiguredChannels(): SlackHomeChannel[] {
  return slackChannelOrder.map((key) => ({
    key,
    name: slackChannelLabels[key],
    slackChannelId: slackConfig.channels[key] ?? null,
    visible: true,
  }));
}

function stripSlackMarkup(value: string) {
  return value
    .replace(/<@([A-Z0-9]+)>/g, "@$1")
    .replace(/<!subteam\^([A-Z0-9]+)\|@?([^>]+)>/g, "@$2")
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function messagePreview(message: SlackMessage) {
  return stripSlackMarkup(message.text).replace(/\s+/g, " ").slice(0, 220);
}

function messageHasHandle(message: SlackMessage, handles: string[], userGroups: SlackUserGroup[]) {
  const text = message.text.toLowerCase();
  const matchedHandles = new Set<string>();

  for (const handle of handles) {
    const normalizedHandle = handle.toLowerCase();
    if (
      text.includes(`@${normalizedHandle}`) ||
      text.includes(`!subteam^`) &&
        userGroups.some(
          (group) =>
            group.handle.toLowerCase() === normalizedHandle &&
            text.includes(group.id.toLowerCase()),
        )
    ) {
      matchedHandles.add(handle);
    }
  }

  return [...matchedHandles];
}

function buildAlerts(input: {
  messages: SlackMessage[];
  handles: string[];
  userGroups: SlackUserGroup[];
}): SlackHomeAlert[] {
  return input.messages
    .flatMap((message) => {
      const mentionedHandles = messageHasHandle(
        message,
        input.handles,
        input.userGroups,
      );

      if (mentionedHandles.length === 0) {
        return [];
      }

      return [
        {
          id: `${message.channelId}:${message.ts}`,
          channelKey: message.channelKey,
          channelName: message.channelName,
          slackMessageTs: message.ts,
          authorName: message.authorName,
          text: messagePreview(message),
          mentionedHandles,
          postedAt: message.postedAt,
          read: false,
        },
      ];
    })
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt));
}

function parseTodos(message: SlackMessage): SlackHomeTodo[] {
  const lines = stripSlackMarkup(message.text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines
    .filter((line) => /^[-*•]\s+/.test(line) || /^\[[ xX]\]\s+/.test(line))
    .map((line, index) => {
      const cleaned = line
        .replace(/^[-*•]\s+/, "")
        .replace(/^\[[ xX]\]\s+/, "")
        .trim();
      const assigneeMatch = cleaned.match(/^([^:]{2,40}):\s+(.+)$/);

      return {
        id: `${message.channelId}:${message.ts}:todo-${index + 1}`,
        text: assigneeMatch ? assigneeMatch[2] : cleaned,
        assigneeLabel: assigneeMatch ? assigneeMatch[1] : null,
        complete: /^\[[xX]\]/.test(line),
      };
    });
}

function findMeetingRecap(messages: SlackMessage[]): SlackHomeMeetingRecap | null {
  const recap = messages.find(
    (message) =>
      message.channelKey === "meetingPlansRecaps" &&
      /\brecap\b/i.test(message.text),
  );

  if (!recap) {
    return null;
  }

  return {
    id: `${recap.channelId}:${recap.ts}`,
    channelKey: recap.channelKey,
    channelName: recap.channelName,
    slackMessageTs: recap.ts,
    authorName: recap.authorName,
    text: messagePreview(recap),
    postedAt: recap.postedAt,
    todos: parseTodos(recap),
  };
}

function summarizeChannel(channel: SlackHomeChannel, messages: SlackMessage[]) {
  const channelMessages = messages.filter(
    (message) => message.channelKey === channel.key,
  );

  if (channelMessages.length === 0 || !summaryChannels.has(channel.key)) {
    return null;
  }

  const threadReplyCount = channelMessages.reduce(
    (sum, message) => sum + message.replies.length,
    0,
  );
  const previewMessages = channelMessages
    .slice(0, 4)
    .map((message) => messagePreview(message))
    .filter((preview) => preview.length > 0);
  const sourceMessages = channelMessages.slice(0, 10).map((message) => ({
    id: `${message.channelId}:${message.ts}`,
    authorName: message.authorName,
    text: messagePreview(message),
    postedAt: message.postedAt,
    replyCount: message.replies.length,
  }));

  const summaryParts = previewMessages.length > 0
    ? previewMessages
    : ["No readable message text was found."];

  return {
    id: `summary:${channel.key}`,
    channelKey: channel.key,
    channelName: channel.name,
    title: `Latest in #${channel.name}`,
    summary: summaryParts.join(" "),
    messageCount: channelMessages.length + threadReplyCount,
    updatedAt: channelMessages[0]?.postedAt ?? new Date(0).toISOString(),
    sourceMessages,
  } satisfies SlackHomeSummary;
}

async function fetchSlackMessages(client: SlackClient, channels: SlackHomeChannel[]) {
  const messages: SlackMessage[] = [];
  const errors: string[] = [];

  for (const channel of channels) {
    if (!channel.slackChannelId) {
      continue;
    }

    try {
      messages.push(
        ...(await client.listChannelMessages({
          channelKey: channel.key,
          channelName: channel.name,
          channelId: channel.slackChannelId,
          limit: 25,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`#${channel.name}: ${message}`);
    }
  }

  return {
    messages: messages.sort((left, right) => right.postedAt.localeCompare(left.postedAt)),
    errors,
  };
}

export async function buildSlackHomeResponse(input: {
  members: Member[];
  userEmail?: string | null;
  slackClient?: SlackClient;
}): Promise<SlackHomeResponse> {
  const userEmail = normalizeEmail(input.userEmail);
  const member = findMemberForEmail(input.members, userEmail);
  const visibleChannels = getConfiguredChannels();

  const baseResponse = {
    slackEnabled: slackConfig.enabled,
    slackConnected: false,
    slackError: null,
    userEmail: normalizeEmail(member?.email) ?? userEmail,
    alertUsergroupHandles: [...slackConfig.alertUsergroupHandles],
    channels: visibleChannels,
    unreadAlerts: [],
    meetingRecap: null,
    summaries: [],
  } satisfies SlackHomeResponse;

  if (!slackConfig.enabled && !input.slackClient) {
    return baseResponse;
  }

  try {
    const client = input.slackClient ?? new SlackWebClient();
    const userGroups = await client.listUserGroups();
    const { messages, errors } = await fetchSlackMessages(client, visibleChannels);
    const summaries = visibleChannels
      .map((channel) => summarizeChannel(channel, messages))
      .filter((summary): summary is SlackHomeSummary => summary !== null);

    return {
      ...baseResponse,
      slackConnected: errors.length === 0,
      slackError: errors.length > 0 ? errors.join(" | ") : null,
      unreadAlerts: buildAlerts({
        messages,
        handles: slackConfig.alertUsergroupHandles,
        userGroups,
      }),
      meetingRecap: findMeetingRecap(messages),
      summaries,
    };
  } catch (error) {
    return {
      ...baseResponse,
      slackError: error instanceof Error ? error.message : String(error),
    };
  }
}
