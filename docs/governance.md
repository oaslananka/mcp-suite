# Governance

This repository uses GitHub Issues and Pull Requests as the public system of
record for project work. Maintainers use labels, assignees, and comments to make
triage decisions visible.

## Support Policy

GitHub Discussions are currently disabled for this repository. Use these support
paths instead:

- Bug reports: open a Bug Report issue when behavior is broken or regressed.
- Feature requests: open a Feature Request issue for product or API changes.
- Usage questions: open a Support Question issue for setup, usage, or workflow
  help that does not describe a defect.
- Security issues: do not open a public issue. Follow `SECURITY.md` and email
  the private disclosure address.

Maintainers may convert support questions into bugs or feature requests when the
question reveals a reproducible defect or missing product capability.

## Label Taxonomy

Every triaged issue should have one label from each applicable group.

| Group     | Labels                                                                    | Meaning                                      |
| --------- | ------------------------------------------------------------------------- | -------------------------------------------- |
| Priority  | `priority:P0`, `priority:P1`, `priority:P2`, `priority:P3`                | Urgency and release impact                   |
| Area      | `area:release`, `area:ci`, `area:security`, `area:compatibility`          | Primary ownership surface                    |
| Area      | `area:docs`, `area:testing`, `area:packaging`, `area:dx`                  | Primary ownership surface                    |
| Area      | `area:governance`, `area:infra`                                           | Primary ownership surface                    |
| Type      | `type:bug`, `type:enhancement`, `type:task`, `type:docs`, `type:security` | Work category                                |
| Risk      | `risk:high`, `risk:medium`, `risk:low`                                    | Blast radius if the work is wrong or delayed |
| Status    | `status:in-progress`, `agent:blocked`                                     | Active owner state or automation blocker     |
| Community | `question`, `good first issue`, `help wanted`, `duplicate`, `invalid`     | Contributor-facing issue handling            |

Avoid near-duplicate labels. If a needed label does not exist, prefer an issue
comment explaining the state until maintainers add the label intentionally.

## Triage Process

1. Confirm the report belongs in public issues. Move security reports to the
   private disclosure path immediately.
2. Confirm the package or surface, reproduction details, expected behavior, and
   actual behavior are present.
3. Apply priority, area, type, and risk labels.
4. Assign an owner when the next action is clear. Use `status:in-progress` only
   after work starts.
5. Ask for missing information with a specific deadline when the report is not
   actionable.
6. Link related issues or pull requests. Close duplicates with a pointer to the
   canonical issue.

## Priority Definitions

- `priority:P0`: security, release, public install, CI, or artifact blocker.
- `priority:P1`: major compatibility, product, or governance gap.
- `priority:P2`: quality, test, developer experience, or maintainability work.
- `priority:P3`: polish, demo, community, or future roadmap work.

Priority can change when new evidence changes impact or urgency. Record the
reason in an issue comment when raising or lowering priority.

## Maintainer Response SLA

Targets are measured in business days and describe first maintainer response, not
guaranteed fix time.

| Priority | First response target | Update cadence while active   |
| -------- | --------------------- | ----------------------------- |
| P0       | 1 business day        | Daily until unblocked         |
| P1       | 3 business days       | Weekly until resolved         |
| P2       | 7 business days       | Every 14 days when active     |
| P3       | 14 business days      | Monthly or as capacity allows |

Security disclosures follow `SECURITY.md` instead of this public SLA.

## Stale Policy

Issues become stale only when the next action is waiting on the reporter or an
external dependency.

- Waiting for reporter: add a comment with the exact missing information. If
  there is no response after 30 days, mark the issue stale in a comment.
- Closing after stale: close 14 days after the stale comment if the issue remains
  unactionable.
- Blocked work: add `agent:blocked` or a clear blocker comment with the external
  dependency and unblock condition.
- Never stale: P0 security/release blockers, accepted roadmap items, active PRs,
  and issues with a named maintainer owner.

No stale automation is enabled yet. If automation is added later, it must use
least-privilege workflow permissions and follow this policy exactly.

## Pull Request Review Policy

Pull requests must pass required checks before merge. Required human reviews are
treated as an external dependency for automation agents; agents may enable
auto-merge but must not bypass branch protection.

PR descriptions should include the problem, solution, verification evidence, and
linked issues using `Closes #<number>` when merge should close the issue.
