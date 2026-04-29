import { slackConfig } from "../config/env";
import type {
  Member,
  SlackChannelKey,
  SlackHomeChannel,
  SlackHomeResponse,
} from "../domain/types";

const slackChannelLabels: Record<SlackChannelKey, string> = {
  announcements: "announcements",
  build: "build",
  meetingPlansRecaps: "meeting-plans-n-recaps",
  programming: "programming",
  scoutingStrategy: "scouting-n-strategy",
  transportationAttendance: "transportation-attendance",
};

const slackChannelOrder = Object.keys(slackChannelLabels) as SlackChannelKey[];

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

export function buildSlackHomeResponse(input: {
  members: Member[];
  userEmail?: string | null;
}): SlackHomeResponse {
  const userEmail = normalizeEmail(input.userEmail);
  const member = findMemberForEmail(input.members, userEmail);
  const visibleChannels = getConfiguredChannels();

  return {
    slackEnabled: slackConfig.enabled,
    userEmail: normalizeEmail(member?.email) ?? userEmail,
    alertUsergroupHandles: [...slackConfig.alertUsergroupHandles],
    channels: visibleChannels,
    unreadAlerts: [],
    meetingRecap: null,
    summaries: [],
  };
}
