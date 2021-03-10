#!/usr/bin/env node

require("dotenv").config();
const fetch = require("node-fetch");
const qs = require("query-string");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const TimeAgo = require("javascript-time-ago");
const en = require("javascript-time-ago/locale/en");
TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo();

const {
  GERRIT_ENDPOINT,
  GERRIT_USER,
  GERRIT_PASSWORD,
  SLACK_CHANNEL,
  SLACK_LAMBDA_ENDPOINT,
} = process.env;
const sqs = new SQSClient({ region: "us-east-1" });

const emojisFor = (labels, isCR = false) => {
  if (labels.includes("rejected")) {
    return isCR ? ":minustwo:" : "minusone";
  } else if (labels.includes("disliked")) {
    return ":minusone:";
  } else if (labels.includes("approved")) {
    return isCR ? ":plus2:" : ":+1:";
  } else if (labels.includes("recommended")) {
    return ":+1:";
  }
  return ":crickets:";
};

const formatReviews = ({ cr, qa, pr }) => {
  let reviews = `(CR:${emojisFor(cr, true)})`;
  if (cr.includes("approved")) {
    reviews += ` (QA:${emojisFor(qa)})`;
  }
  if (qa.includes("approved")) {
    reviews += ` (PR:${emojisFor(pr)})`;
  }
  return reviews;
};

const formatPatchset = ({
  _number: number,
  project,
  owner,
  subject,
  reviews,
}) => {
  return `<${GERRIT_ENDPOINT}/c/${number}/|g/${number}> - [${project}] - [${owner}] - _${subject}_ - ${formatReviews(
    reviews
  )}`;
};

const fetchPatchsets = async () => {
  const headers = new fetch.Headers({
    Authorization: `Basic ${Buffer.from(
      `${GERRIT_USER}:${GERRIT_PASSWORD}`
    ).toString("base64")}`,
  });
  const query = qs.stringify({
    q:
      "status:open ownerin:outcomes reviewerin:outcomes label:verified=+1 -label:code-review=-2 -label:lint-review=-2 -age:3w",
    o: ["LABELS", "CURRENT_COMMIT", "DETAILED_ACCOUNTS"],
  });
  const response = await fetch(`${GERRIT_ENDPOINT}/a/changes/?${query}`, {
    headers,
  });

  const text = await response.text();
  const [_, body] = text.split("\n", 2);
  return JSON.parse(body);
};

const transformPatchset = (ps) => ({
  ...ps,
  owner: ps.owner?.name,
  lastUpdate: timeAgo.format(new Date(ps.updated + "Z")),
  reviews: {
    cr: Object.keys(ps.labels["Code-Review"] || {}),
    qa: Object.keys(ps.labels["QA-Review"] || {}),
    pr: Object.keys(ps.labels["Product-Review"] || {}),
  },
});

const run = async () => {
  const patchsets = await fetchPatchsets();
  const rows = patchsets.map(transformPatchset).map(formatPatchset);
  const message = [`${rows.length} outstanding reviews:`, ...rows]
    .sort()
    .join("\n");
  console.log(message);
  sendMessage(message);
};
run();

const sendMessage = async (text) => {
  const message = JSON.stringify({
    channel: SLACK_CHANNEL,
    username: "TicketBot",
    text,
  });
  const params = {
    MessageBody: message,
    QueueUrl: SLACK_LAMBDA_ENDPOINT,
  };
  return sqs.send(new SendMessageCommand(params));
};
