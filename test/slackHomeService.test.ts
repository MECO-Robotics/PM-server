import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlackClient, SlackMessage } from "../src/slack/client";

function buildMessage(seed: Partial<SlackMessage> & Pick<SlackMessage, "channelKey" | "channelName" | "channelId" | "ts" | "text">): SlackMessage {
  return {
    threadTs: null,
    authorId: "U123",
    authorName: "Build Lead",
    postedAt: "2026-04-28T20:00:00.000Z",
    replyCount: 0,
    replies: [],
    ...seed,
  };
}

test("slack home response maps live messages into alerts, recap, and summaries", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSlackHandles = process.env.SLACK_ALERT_USERGROUP_HANDLES;
  const previousBuildChannel = process.env.SLACK_CHANNEL_BUILD_ID;
  const previousRecapChannel = process.env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID;
  const previousProgrammingChannel = process.env.SLACK_CHANNEL_PROGRAMMING_ID;
  const previousScoutingChannel = process.env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID;
  const previousTransportationChannel = process.env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID;

  try {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.SLACK_ALERT_USERGROUP_HANDLES = "allmentors,allstudents";
    process.env.SLACK_CHANNEL_BUILD_ID = "CBUILD";
    process.env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID = "CRECAP";
    process.env.SLACK_CHANNEL_PROGRAMMING_ID = "CPROG";
    process.env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID = "CSCOUT";
    process.env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID = "CTRANS";

    const { buildSlackHomeResponse } = await import("../src/slack/homeService");

    const client: SlackClient = {
      async listUserGroups() {
        return [
          {
            id: "SMENTORS",
            handle: "allmentors",
            name: "All Mentors",
          },
        ];
      },
      async listChannelMessages(input) {
        if (input.channelKey === "build") {
          return [
            buildMessage({
              channelKey: "build",
              channelName: "build",
              channelId: "CBUILD",
              ts: "1777416000.000000",
              text: "<!subteam^SMENTORS|@allmentors> please review the drivetrain checklist.",
              replies: [
                {
                  ts: "1777416060.000000",
                  authorId: "U456",
                  authorName: "Mentor",
                  text: "I will review it.",
                  postedAt: "2026-04-28T20:01:00.000Z",
                },
              ],
            }),
          ];
        }

        if (input.channelKey === "meetingPlansRecaps") {
          return [
            buildMessage({
              channelKey: "meetingPlansRecaps",
              channelName: "meeting-plans-n-recaps",
              channelId: "CRECAP",
              ts: "1777412400.000000",
              text: "Meeting recap\n- Programming: test autos\n- Mentors: review CAD",
              postedAt: "2026-04-28T19:00:00.000Z",
            }),
          ];
        }

        return [];
      },
    };

    const response = await buildSlackHomeResponse({
      members: [
        {
          id: "mentor-1",
          name: "Mentor One",
          email: "mentor@example.com",
          role: "mentor",
          elevated: false,
          seasonId: "season",
        },
      ],
      userEmail: "MENTOR@example.com",
      slackClient: client,
    });

    assert.equal(response.userEmail, "mentor@example.com");
    assert.equal(response.slackConnected, true);
    assert.equal(response.slackError, null);
    assert.equal(response.unreadAlerts.length, 1);
    assert.deepEqual(response.unreadAlerts[0]?.mentionedHandles, ["allmentors"]);
    assert.equal(response.meetingRecap?.todos.length, 2);
    assert.equal(response.meetingRecap?.todos[0]?.assigneeLabel, "Programming");
    assert.equal(response.summaries.length, 1);
    assert.equal(response.summaries[0]?.messageCount, 2);
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousSlackHandles === undefined) {
      delete process.env.SLACK_ALERT_USERGROUP_HANDLES;
    } else {
      process.env.SLACK_ALERT_USERGROUP_HANDLES = previousSlackHandles;
    }

    if (previousBuildChannel === undefined) {
      delete process.env.SLACK_CHANNEL_BUILD_ID;
    } else {
      process.env.SLACK_CHANNEL_BUILD_ID = previousBuildChannel;
    }

    if (previousRecapChannel === undefined) {
      delete process.env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID;
    } else {
      process.env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID = previousRecapChannel;
    }

    if (previousProgrammingChannel === undefined) {
      delete process.env.SLACK_CHANNEL_PROGRAMMING_ID;
    } else {
      process.env.SLACK_CHANNEL_PROGRAMMING_ID = previousProgrammingChannel;
    }

    if (previousScoutingChannel === undefined) {
      delete process.env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID;
    } else {
      process.env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID = previousScoutingChannel;
    }

    if (previousTransportationChannel === undefined) {
      delete process.env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID;
    } else {
      process.env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID = previousTransportationChannel;
    }
  }
});
