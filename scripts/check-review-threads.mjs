import { readFile, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const prNumber = process.env.PR_NUMBER ?? await getPrNumberFromEvent();
const outputPath = process.env.REVIEW_THREAD_SUMMARY_PATH ?? "review-thread-summary.json";
const actionablePattern = /security|vulnerability|correctness|release|publish|workflow|secret|token|unsafe|package|registry|auth|permission|artifact|attestation|mcp|oauth|jwks|bearer|origin|command injection|path traversal|ssrf|destructive|file write|file delete|private key|password|passphrase|credential/iu;

if (!token || !repository || !prNumber) {
  const summary = { status: "skipped", reason: "missing pull request context", blocked: false, threads: [] };
  await writeSummary(summary);
  process.exit(0);
}

const [owner, repo] = repository.split("/");
const data = await graphql(`
  query ReviewThreads($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        url
        isDraft
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            originalLine
            diffSide
            comments(first: 50) {
              nodes {
                author { login }
                body
                url
                createdAt
                updatedAt
              }
            }
          }
        }
      }
    }
  }
`, { owner, repo, number: Number(prNumber) });

const pullRequest = data.repository?.pullRequest;
const blockingThreads = [];
const threads = pullRequest?.reviewThreads?.nodes ?? [];

for (const thread of threads) {
  if (thread.isResolved || thread.isOutdated) {
    continue;
  }

  const comments = thread.comments?.nodes ?? [];
  const hasHumanComment = comments.some((comment) => !isBot(comment.author?.login));
  const hasActionableBotComment = comments.some((comment) => isBot(comment.author?.login) && actionablePattern.test(comment.body ?? ""));
  if (!hasHumanComment && !hasActionableBotComment) {
    continue;
  }

  blockingThreads.push({
    id: thread.id,
    path: thread.path,
    line: thread.line,
    originalLine: thread.originalLine,
    diffSide: thread.diffSide,
    comments,
    reason: hasHumanComment ? "unresolved human review thread" : "unresolved actionable bot review thread",
  });
}

const summary = {
  status: blockingThreads.length > 0 ? "blocked" : "clean",
  pull_request: pullRequest ? { id: pullRequest.id, url: pullRequest.url, draft: pullRequest.isDraft } : null,
  blocked: blockingThreads.length > 0,
  blocking_threads: blockingThreads,
  inspected_threads: threads.length,
};

await writeSummary(summary);
await updateLabels(summary.blocked);

if (summary.blocked) {
  process.exit(1);
}

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${JSON.stringify(payload.errors)}`);
  }
  return payload.data;
}

async function getPrNumberFromEvent() {
  if (!process.env.GITHUB_EVENT_PATH) {
    return undefined;
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  return event.pull_request?.number ? String(event.pull_request.number) : undefined;
}

function isBot(login) {
  return !login || login.endsWith("[bot]") || login === "github-actions";
}

async function writeSummary(summary) {
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const markdown = summary.blocked
    ? `### Review Thread Gate\n\nBlocked by ${summary.blocking_threads.length} unresolved review thread(s).\n`
    : "### Review Thread Gate\n\nNo unresolved actionable review threads found.\n";
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: "a" });
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function updateLabels(blocked) {
  if (process.env.APPLY_REVIEW_THREAD_LABELS !== "true" || !repository || !prNumber) {
    return;
  }
  const labels = blocked ? ["review:blocked", "ci:hold"] : ["review:clean", "ci:ready"];
  try {
    await fetch(`https://api.github.com/repos/${repository}/issues/${prNumber}/labels`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ labels }),
    });
  } catch {
    // Label updates are best effort.
  }
}
