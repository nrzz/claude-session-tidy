# Changelog

All notable changes to claude-session-tidy are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.6.0] - 2026-10-28

- Add `show <id>`: everything `list` knows about one session, with its files and folders (the ones `delete` would move), each with its file count or size. `<id>` is a session id or an unambiguous prefix of 6 or more characters; an ambiguous or unknown id is refused (exit 1). `--json` gives one document (`{ ok, id, title, project, firstActivity, lastActivity, prompts, size, kept, sweep, files }`).
- Contributed by [@yoreva-01](https://github.com/yoreva-01) in [#15](https://github.com/nrzz/claude-session-tidy/pull/15), for the good first issue [#14](https://github.com/nrzz/claude-session-tidy/issues/14).

## [1.5.0] - 2026-10-19

- Add `list --kept`: only the sessions on the keep list (`keep.json`). It filters before `--limit` and combines with `--all`, `--project`, `--sort`, `--due`, `--title`, `--since` and `--idle`. Text and markdown headers show matching, shown and total counts (`(3 kept, of 41)`, or with other filters `(2 kept, matching "stripe", of 41)`); JSON adds `kept: true` and `matched` only when the filter is used. No matches is a successful empty report. When the keep list is invalid, `--kept` is refused with an error (exit 1).
- Contributed by [@yoreva-01](https://github.com/yoreva-01) in [#13](https://github.com/nrzz/claude-session-tidy/pull/13), for the good first issue [#12](https://github.com/nrzz/claude-session-tidy/issues/12).

## [1.4.0] - 2026-10-19

- Add `rename <id> <title>`: set a session's title from outside Claude Code, the way `/rename` does inside it: a `custom-title` record appended to the transcript and `custom-title.json` in the session's folder (and `sessions-index.json` brought along when there is one). The id follows the rules of `delete` and `keep` (a full id or an unambiguous prefix; ambiguous or unknown ids are refused and nothing is written), an empty title is a usage error, `--dry-run` changes nothing, `--json` gives the result. Checked against Claude Code 2.1.299: `claude -p --resume "<new title>"` resumes the renamed session with its history, from either of the two places alone, and the old title no longer does.
- Add `list --idle <days>`: the sessions whose last activity is older than N days, counted from now by the newest timestamp in each transcript rather than the file's modification time. It filters before `--limit`, combines with `--all`, `--project`, `--sort`, `--due`, `--title` and `--since` (for example, `--since 30 --idle 7` lists sessions active between 7 and 30 days ago), and works in text, JSON and markdown reports. Headers show matching, shown and total counts; JSON adds `idle` and `matched` only when the filter is used. No matches is a successful empty report; a value that is not a whole number of 1 or more is a usage error with exit code 1.
- Contributed by [@yoreva-01](https://github.com/yoreva-01) in [#11](https://github.com/nrzz/claude-session-tidy/pull/11) (for [#4](https://github.com/nrzz/claude-session-tidy/issues/4)) and [#10](https://github.com/nrzz/claude-session-tidy/pull/10) (for the good first issue [#9](https://github.com/nrzz/claude-session-tidy/issues/9)); the real-binary check of the title is the maintainer's.

## [1.3.0] - 2026-10-19

- Add `list --since <days>`: the sessions whose last activity is within the last N days, by the newest timestamp in each transcript rather than the file's modification time, counted from now. It filters before `--limit`, combines with `--all`, `--project`, `--sort`, `--due` and `--title`, and works in text, JSON and markdown reports. Headers show matching, shown and total counts; JSON adds `since` and `matched` only when the filter is used. No matches is a successful empty report; a value that is not a whole number of 1 or more is a usage error with exit code 1.
- Contributed by [@yoreva-01](https://github.com/yoreva-01) in [#7](https://github.com/nrzz/claude-session-tidy/pull/7), for the good first issue [#6](https://github.com/nrzz/claude-session-tidy/issues/6), with a review by [@Dcastroro](https://github.com/Dcastroro) that kept the real-CLI test from ageing out.

## [1.2.0] - 2026-10-18

- Add `list --title <text>` for literal, case-insensitive title searches before limits, combined with project, sort and due filters. Text and markdown headers show the filter and counts; filtered JSON includes `title` and `matched`. Empty search text is rejected without reading sessions.
- Update repository checks for the intentionally absent `.gitattributes` and the plugin's PNG icon, and compare repository text independently of Windows checkout line endings.
- Allow manually running the test matrix, including validation in forks.
- Contributed by [@Dcastroro](https://github.com/Dcastroro) in [#5](https://github.com/nrzz/claude-session-tidy/pull/5), for the good first issue [#3](https://github.com/nrzz/claude-session-tidy/issues/3). The repository checks it repaired had been red on main since the 16 October commit that dropped `.gitattributes` for the plugin directory.

## [1.1.0] - 2026-10-15

- Add `list --due <days>` to show sessions due for cleanup within a chosen number of days, including overdue and kept sessions, before applying `--limit`. Contributed by @facelessdevhack in #2, the first outside pull request.

## [1.0.1] - 2026-10-15

- The skill's description is shorter, "List sessions with size and cleanup date." instead of "List this project's sessions, size and sweep date.", so that Claude Code's "always-on" estimate for the plugin falls from about 17 to about 15 tokens. That keeps the nine plugins of the [Claude Code toolkit](https://github.com/nrzz/claude-code-toolkit) together under its limit of 150. Nothing else changed.

## [1.0.0] - 2026-10-15

- First release: `list` (every session with its size including subagent, tool-result and file-history files, last activity, prompts, title, whether it is kept, and the day Claude Code's cleanup removes it, with the `cleanupPeriodDays` that applied), `delete` and `restore` through a trash with a manifest, `keep`, `unkeep` and `refresh` to hold sessions past the cleanup, `tidy` for empty, orphaned and old sessions, `empty-trash`, `init` and `uninstall` for a silent SessionStart hook (settings.json edited as text after a backup, byte for byte back after uninstall), `--json` everywhere, `--dry-run` wherever something is written.
- A plugin `session-tidy` with one user-only skill, `/session-tidy:list`, and the same hook.
- Checked against Claude Code 2.1.295: the cleanup goes by a file's modification time and not the timestamps inside it; it skips sessions started by Claude Desktop; it takes a session's folder along but leaves `file-history/`, `session-env/`, `uploads/` and `tasks/` behind; a touched session survives it; a deleted session cannot be resumed and a restored one resumes with its whole history. The checks run against the real binary in CI (`E2E_CLAUDE`), weekly.

[Unreleased]: https://github.com/nrzz/claude-session-tidy/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/nrzz/claude-session-tidy/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/nrzz/claude-session-tidy/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/nrzz/claude-session-tidy/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nrzz/claude-session-tidy/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nrzz/claude-session-tidy/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nrzz/claude-session-tidy/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/nrzz/claude-session-tidy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/nrzz/claude-session-tidy/releases/tag/v1.0.0
