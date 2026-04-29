import { slackConfig } from "../config/env";
import type { SlackChannelKey } from "../domain/types";

export interface SlackUserGroup {
  id: string;
  handle: string;
  name: string;
}

export interface SlackMessage {
  channelKey: SlackChannelKey;
  channelName: string;
  channelId: string;
  ts: string;
  threadTs: string | null;
  authorId: string | null;
  authorName: string;
  text: string;
  postedAt: string;
  replyCount: number;
  replies: SlackMessageReply[];
}

export interface SlackMessageReply {
  ts: string;
  authorId: string | null;
  authorName: string;
  text: string;
  postedAt: string;
}

export interface SlackClient {
  listUserGroups(): Promise<SlackUserGroup[]>;
  listChannelMessages(input: {
    channelKey: SlackChannelKey;
    channelName: string;
    channelId: string;
    limit?: number;
  }): Promise<SlackMessage[]>;
}

interface SlackApiResponse {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

interface SlackUsergroupRecord {
  id?: unknown;
  handle?: unknown;
  name?: unknown;
  date_delete?: unknown;
  deleted_by?: unknown;
  deleted?: unknown;
}

interface SlackMessageRecord {
  ts?: unknown;
  thread_ts?: unknown;
  user?: unknown;
  username?: unknown;
  bot_profile?: { name?: unknown };
  text?: unknown;
  subtype?: unknown;
  reply_count?: unknown;
}

function assertSlackEnabled() {
  if (!slackConfig.botToken) {
    throw new Error("Slack bot token is not configured.");
  }

  return slackConfig.botToken;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatSlackTimestamp(ts: string) {
  const seconds = Number(ts.split(".")[0]);
  if (!Number.isFinite(seconds)) {
    return new Date(0).toISOString();
  }

  return new Date(seconds * 1000).toISOString();
}

function toSlackError(payload: SlackApiResponse, fallback: string) {
  return new Error(payload.error ? `Slack API error: ${payload.error}` : fallback);
}

export class SlackWebClient implements SlackClient {
  private readonly token: string;

  constructor(token = assertSlackEnabled()) {
    this.token = token;
  }

  private async request<T extends SlackApiResponse>(
    method: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const url = new URL(`https://slack.com/api/${method}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    const payload = (await response.json()) as T;
    if (!response.ok || payload.ok !== true) {
      throw toSlackError(payload, `Slack API request failed with ${response.status}.`);
    }

    return payload;
  }

  async listUserGroups(): Promise<SlackUserGroup[]> {
    const payload = await this.request<SlackApiResponse & { usergroups?: unknown }>(
      "usergroups.list",
      { include_disabled: false },
    );

    const records = Array.isArray(payload.usergroups)
      ? (payload.usergroups as SlackUsergroupRecord[])
      : [];

    return records
      .filter((record) => !record.deleted && !record.date_delete && !record.deleted_by)
      .map((record) => ({
        id: readString(record.id) ?? "",
        handle: readString(record.handle) ?? "",
        name: readString(record.name) ?? "",
      }))
      .filter((record) => record.id && record.handle);
  }

  async listChannelMessages(input: {
    channelKey: SlackChannelKey;
    channelName: string;
    channelId: string;
    limit?: number;
  }): Promise<SlackMessage[]> {
    const payload = await this.request<SlackApiResponse & { messages?: unknown }>(
      "conversations.history",
      {
        channel: input.channelId,
        limit: input.limit ?? 25,
        inclusive: true,
      },
    );

    const records = Array.isArray(payload.messages)
      ? (payload.messages as SlackMessageRecord[])
      : [];

    const messages = records
      .map((record) => this.mapMessageRecord(input, record))
      .filter((message): message is SlackMessage => message !== null);

    return Promise.all(
      messages.map(async (message) => ({
        ...message,
        replies: await this.listReplies(input.channelId, message),
      })),
    );
  }

  private async listReplies(channelId: string, message: SlackMessage) {
    if (message.replyCount <= 0) {
      return [];
    }

    const payload = await this.request<SlackApiResponse & { messages?: unknown }>(
      "conversations.replies",
      {
        channel: channelId,
        ts: message.threadTs ?? message.ts,
        limit: 20,
      },
    );

    const records = Array.isArray(payload.messages)
      ? (payload.messages as SlackMessageRecord[])
      : [];

    return records
      .slice(1)
      .map((record) => this.mapReplyRecord(record))
      .filter((reply): reply is SlackMessageReply => reply !== null);
  }

  private mapMessageRecord(
    input: { channelKey: SlackChannelKey; channelName: string; channelId: string },
    record: SlackMessageRecord,
  ): SlackMessage | null {
    const ts = readString(record.ts);
    const text = readString(record.text);
    if (!ts || !text) {
      return null;
    }

    const authorName =
      readString(record.username) ??
      readString(record.bot_profile?.name) ??
      readString(record.user) ??
      "Slack";

    return {
      channelKey: input.channelKey,
      channelName: input.channelName,
      channelId: input.channelId,
      ts,
      threadTs: readString(record.thread_ts),
      authorId: readString(record.user),
      authorName,
      text,
      postedAt: formatSlackTimestamp(ts),
      replyCount: readNumber(record.reply_count),
      replies: [],
    };
  }

  private mapReplyRecord(record: SlackMessageRecord): SlackMessageReply | null {
    const ts = readString(record.ts);
    const text = readString(record.text);
    if (!ts || !text) {
      return null;
    }

    return {
      ts,
      authorId: readString(record.user),
      authorName:
        readString(record.username) ??
        readString(record.bot_profile?.name) ??
        readString(record.user) ??
        "Slack",
      text,
      postedAt: formatSlackTimestamp(ts),
    };
  }
}
