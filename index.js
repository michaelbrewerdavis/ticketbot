#!/usr/bin/env node

require("dotenv").config();

const getStdin = require("get-stdin");
const TimeAgo = require("javascript-time-ago");
const en = require("javascript-time-ago/locale/en");
TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo();

const { GERRIT_ENDPOINT } = process.env;

const emojisFor = (labels, isCR = false) => {
  if (labels.includes("-2")) {
    return ":minustwo:";
  } else if (labels.includes("-1")) {
    return ":minusone:";
  } else if (labels.includes("2")) {
    return ":plus2:";
  } else if (labels.includes("1")) {
    return ":+1:";
  }
  return ":crickets:";
};

const formatReviews = ({ cr, qa, pr }) => {
  let reviews = `(CR:${emojisFor(cr, true)})`;
  if (cr.includes("2")) {
    reviews += ` (QA:${emojisFor(qa)})`;
  }
  if (qa.includes("1")) {
    reviews += ` (PR:${emojisFor(pr)})`;
  }
  return reviews;
};

const formatPatchset = ({
  number,
  project,
  owner,
  subject,
  reviews,
  lastUpdate,
}) => {
  return `<${GERRIT_ENDPOINT}/c/${number}/|g/${number}> - [${project}] - [${owner}] - _${subject}_ - ${formatReviews(
    reviews
  )} - ${lastUpdate}`;
};

const parsePatchsets = async () => {
  const raw = await getStdin();
  const rows = raw
    .toString()
    .split("\n")
    .filter((line) => line)
    .map((line) => JSON.parse(line))
    .filter((line) => !!line.id);
  return rows;
};

const transformPatchset = (ps) => ({
  ...ps,
  owner: ps.owner.name,
  lastUpdate: timeAgo.format(new Date(ps.lastUpdated * 1000)),
  reviews: {
    cr: ps.currentPatchSet.approvals
      .filter((vote) => vote.type === "Code-Review")
      .map((vote) => vote.value),
    qa: ps.currentPatchSet.approvals
      .filter((vote) => vote.type === "QA-Review")
      .map((vote) => vote.value),
    pr: ps.currentPatchSet.approvals
      .filter((vote) => vote.type === "Product-Review")
      .map((vote) => vote.value),
  },
});

const run = async () => {
  const patchsets = await parsePatchsets();
  const rows = patchsets.map(transformPatchset).map(formatPatchset);
  const message = [`${rows.length} outstanding reviews:`, ...rows]
    .sort()
    .join("\n");
  console.log(message);
};
run();
