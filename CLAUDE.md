@AGENTS.md

## Claude Code notes

- Area rules load automatically from `.claude/rules/` when you touch matching files. They're also the source for Cursor's rules: after editing one, run `npm run rules:sync`.
- Specialized subagents live in `.claude/agents/` (`ui-craftsman`, `workflow-engineer`, `server-engineer`, `reviewer`). Use them when the user asks for parallel or specialized work.
- To see the app, use the preview config `.claude/launch.json` (`blombo-dev`: API :4381 + Vite :4382). Check UI changes in the browser in the **Blombo** and **Light** themes before calling them done. The Design Lab is at `/lab`.
- The user may have the app open with real profiles. Never test against their profiles, outputs or model folders. Create a throwaway profile (and delete it after), or use `--data` with a temp folder for server tests.
- Windows is the primary platform: PowerShell and Git Bash are both available. Keep `.bat` files CRLF.
- Finish with `npm run check`. Report what you verified (and in which theme) and what you didn't.
