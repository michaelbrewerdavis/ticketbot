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

const partitionPatchsets = patchsets => {
  const partitioned = {}
  patchsets.forEach(ps => {
    let category
    if (ps.reviews.cr.includes('-1') || ps.reviews.qa.includes('-1')) {
      category = 'revision'
    } else if (!ps.reviews.cr.includes('2')) {
      category = 'cr'
    } else if (!ps.reviews.qa.includes('1')) {
      category = 'qa'
    } else {
      category = 'revision'
    }
    partitioned[category] = partitioned[category] || []
    partitioned[category].push(ps)
  })
  return partitioned
}

const labelTexts = {
  revision: ['Needs Revision'],
  pr: ['Needs PR/Merge'],
  cr: ['Needs Code Review'],
  qa: ['Needs QA']
}

const run = async () => {
  const patchsets = (await parsePatchsets()).map(transformPatchset);
  const groups = partitionPatchsets(patchsets)
  let message = `*${patchsets.length} outstanding reviews:*`
  Object.keys(labelTexts).forEach(key => {
    if (groups[key]) {
      message += "\n" + [`_${labelTexts[key]}_`, ...groups[key].map(formatPatchset).sort()].join("\n")
    }
  })

  console.log(message);
};
run();
