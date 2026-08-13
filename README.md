# PowerContext for DeepSeek Harness

**English** | [中文](README.zh.md)

A DeepSeek Harness bundle that talks to a running [PowerContext](https://github.com/oceanbase/powercontext) Server over HTTP. It does not embed storage, start the Server, or import the Python package.

You do not need `/pc` or the word “remember” in ordinary chat. `/pc` is a human command for diagnostics and Candidate review.

```bat
dsh plugin --profile web add <path-or-tarball>
```

## What it does

Before each model step the plugin:

1. **Recalls** bounded context with `POST /v1/context/prepare` and injects it as untrusted historical evidence.
2. **Captures** the current user prompt as a Content Source with `POST /v1/sources/content`.

Named `pc_*` tools cover Memory, Handoff, Source, and read/generate paths. `pc_call` reaches every OpenAPI `operationId`. Skill `project-context` documents the same workflow for the model.

| What you do | What happens immediately | Available in a later session |
|---|---|---|
| Ordinary chat (“switch auth to JWT”) | The prompt is stored as a Source | Yes if Server extraction is enabled, or if you ask to persist it |
| Ask to persist a decision | The model calls `pc_remember` | Yes; extraction is not required |
| Continue work and ask about an old decision | `prepare_context` injects matches; the model may also search | Only if that project scope already has Memory |

Explicit Memory writes work without an inference model. “Chat is enough to remember” is true only when Server extraction is configured.

## Install

PowerContext Server and DeepSeek Harness are two processes. Both are required.

### 1. Start PowerContext Server

```bat
uv tool install "powercontext[cli,server] @ git+https://github.com/oceanbase/powercontext.git@master"
powercontext server run
```

From a PowerContext checkout you can use `uv run powercontext server run` instead.

Defaults:

- `http://127.0.0.1:8000`
- no authentication
- SQLite under the user data directory (`POWERCONTEXT_HOME` overrides it)
- no automatic Memory extraction; explicit writes still work

Check from another terminal:

```bat
curl http://127.0.0.1:8000/health/live
curl http://127.0.0.1:8000/health/ready
```

`live` must succeed. `ready` may be `degraded` when inference is not configured.

### 2. Start DeepSeek Harness once

Run `dsh web` (or `pnpm dsh web` from a Harness checkout) once so `$DSH_HOME/profiles` exists. You can quit afterward.

### 3. Add this plugin to the web profile

The install loads built `lib/`, not TypeScript sources.

**Release tarball (recommended).** Download `powercontext-dsh-*.tgz` from GitHub Releases:

```bat
dsh plugin --profile web add C:\path\to\powercontext-dsh-0.1.0.tgz
```

A Release download URL works the same way.

**Source checkout.** `lib/` is committed, so you can add the clone without building:

```bat
dsh plugin --profile web add C:\path\to\powercontext-dsh
```

Rebuild only after you change TypeScript: `pnpm install`, `pnpm test`, `pnpm build`, then restart `dsh web`.

**npm (after publish):**

```bat
dsh plugin --profile web add powercontext-dsh
```

`uv` / `powercontext` do not install this plugin into Harness.

Optional check (`--dump-config` prints the composed tree and exits; it does not start the app):

```bat
dsh --profile web --dump-config
```

The dump must contain `# == powercontext-dsh` and `id: powercontext-dsh`. Day-to-day use is `dsh web`, not `--dump-config`.

The plugin resolves `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-llm` from the Harness checkout, then from `$DSH_HOME/profiles/node_modules`. Run Harness once before the first plugin add if those imports fail.

### 4. Open a project workspace

1. Keep `powercontext server run` in one terminal.
2. Start `dsh web`. Configure `baseUrl` first if the Server is remote.
3. Create a session whose workspace is **the Git repository you are developing**, not the Harness source tree (unless you are actually changing Harness).

Then talk normally. Optional self-check:

```text
/pc
/pc doctor
```

`/pc` prints the current `scope` and `baseUrl`. Two sessions share Memory only when `scope` matches.

Remove the plugin:

```bat
dsh plugin --profile web remove powercontext-dsh
```

## Remote PowerContext Server

The plugin runs inside the **Harness Host** (the Node process that serves `dsh web`). The browser never calls PowerContext, so CORS is irrelevant. The machine running Harness must reach the Server URL.

### Server

The default bind is `127.0.0.1` and is not reachable from other hosts. A remote Server must listen more widely and enable auth. Plain HTTP is for loopback; put TLS in front (Nginx, Caddy, …) before exposing it on a network.

```bat
set POWERCONTEXT_SERVER_HTTP_HOST=0.0.0.0
set POWERCONTEXT_SERVER_HTTP_PORT=8000
set POWERCONTEXT_SERVER_AUTH_ENABLED=true
set POWERCONTEXT_SERVER_AUTH_TOKEN=a-long-random-secret
powercontext server run
```

Publish the API root users actually use, for example `https://pc.example.com`. No trailing slash, and no `/mcp`. This plugin uses OpenAPI (`/v1/...`), not MCP.

### Plugin `baseUrl`

The default is `http://127.0.0.1:8000`. Environment variables override patch config. Do not put secrets in files `--dump-config` can print.

PowerShell, before starting Harness:

```powershell
$env:POWERCONTEXT_DSH_BASE_URL = "https://pc.example.com"
$env:POWERCONTEXT_DSH_AUTHORIZATION = "Bearer a-long-random-secret"
dsh web
```

`POWERCONTEXT_DSH_AUTHORIZATION` must be the full `Bearer <token>` and must match `POWERCONTEXT_SERVER_AUTH_TOKEN`.

For a durable non-secret default, edit `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` (or `~/.dsh/profiles/web/cordis.patch.yml`). Harness **replaces the whole `config` object** for that row, so restate every key you still need:

```yaml
- id: powercontext-dsh
  config:
    baseUrl: https://pc.example.com
    timeoutMs: 4000
    requestTimeoutMs: 1000
    maxBytes: 8000
    capturePrompts: true
    flushOnCapture: false
```

Restart `dsh web`. Confirm with `/pc` or `--dump-config`. Keep the token in `POWERCONTEXT_DSH_AUTHORIZATION` only.

## Configuration

Patch defaults:

| Field | Default | Meaning |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8000` | Server root, no trailing slash |
| `authorization` | empty | Full `Bearer <token>`; omitted when empty |
| `scopeId` | empty | Overrides automatic project scope |
| `timeoutMs` | 4000 | Shared recall + capture budget |
| `requestTimeoutMs` | 1000 | Single HTTP timeout |
| `maxBytes` | 8000 | `prepare_context` budget |
| `capturePrompts` | true | Persist the user prompt as a Source |
| `flushOnCapture` | false | Flush after capture; tests only |

Plugin environment (Harness process):

| Variable | Meaning |
|---|---|
| `POWERCONTEXT_DSH_BASE_URL` | Server root URL, no trailing slash |
| `POWERCONTEXT_DSH_AUTHORIZATION` | Full `Bearer <token>` |
| `POWERCONTEXT_DSH_SCOPE_ID` | Overrides derived project scope |
| `POWERCONTEXT_DSH_CAPTURE_PROMPTS` | `false` skips storing the user prompt |
| `POWERCONTEXT_DSH_FLUSH_ON_CAPTURE` | Flush after capture; off by default |

Server environment (common):

| Variable | Meaning |
|---|---|
| `POWERCONTEXT_SERVER_HTTP_HOST` / `_PORT` | Listen address |
| `POWERCONTEXT_SERVER_AUTH_ENABLED` / `_TOKEN` | Static Bearer |
| `POWERCONTEXT_HOME` | Data directory |
| `POWERCONTEXT_SERVER_RUNTIME_SCHEDULE_SECONDS` | Extraction interval; unset disables the job |
| `POWERCONTEXT_SERVER_INFERENCE_GENERATION_MODEL` | Generation model used for extraction |

The Settings UI cannot edit this plugin’s `baseUrl`. Use env or the profile patch above.

## Scope

Memory is per **scope**, not “everything this Harness user ever said”.

1. Take the session workspace (the directory chosen in the Web UI): `agent.session.header.cwd`.
2. Read `git remote origin` in that directory.
3. Normalize to `git:host/path`, for example `git:github.com/oceanbase/powercontext`.
4. If there is no usable remote, use `local:` plus a hash of the repository root.

This is **not** the directory where you launched `dsh web`. You can start the CLI from the Harness checkout and still open a different project as the workspace; scope follows the workspace.

- Same repository, two sessions → same scope → recall works.
- Session A in repo A, session B in repo B → different scopes → B cannot search A’s Memory. That is isolation, not a bug.
- `POWERCONTEXT_DSH_SCOPE_ID` forces one id for every session. Avoid it unless you intend to mix projects.

If cross-session search is empty, run `/pc` in both sessions and compare `scope=` before assuming a write failed.

## Everyday use

Do not use `/pc remember …` as daily speech. That is a control experiment.

### Persist a decision, ask tomorrow

In your product repository, session 1:

> Drop session cookies for login. Use JWT only. Put the refresh token in an HttpOnly cookie. Follow this for later API changes.

If you need it in a new session **now**, add a normal sentence (still not `/pc`):

> Save this auth decision in project memory so later sessions can use it.

A successful `pc_remember` (or equivalent) tool call is the write. A spoken “I’ll remember that” with no tool call does not create Server Memory.

Close session 1. Open session 2 in the **same workspace**:

> What login scheme did we choose for this project? Use project memory. Don’t guess.

Pass: JWT / HttpOnly, preferably with automatic injection or `pc_search` / `pc_prepare_context`.

### Chat only, no “save this”

Requires a generation model **and** `POWERCONTEXT_SERVER_RUNTIME_SCHEDULE_SECONDS` on the Server. Talk about the work in session 1 without mentioning PowerContext. After extraction runs, ask about yesterday’s constraints in session 2.

Without extraction, do not treat this scenario as a plugin failure. Sources may exist while Memory does not.

### Continue unfinished work

Session 1:

> Payment-callback signature verification is blocked on WeChat platform-certificate rotation. Continue from here tomorrow.

Session 2:

> Continue payment-callback signature verification from where we stopped.

If Memory is present, the model should carry “certificate rotation” forward instead of starting from zero.

### Server down, coding still works

Stop `powercontext server run` and give Harness an ordinary coding task. Recall must skip. If the model still calls `pc_*`, it should get an unavailable result and continue, not stall the turn.

## `/pc` commands

| Command | Purpose |
|---|---|
| `/pc` | Show current scope and baseUrl |
| `/pc doctor` | Server liveness / readiness |
| `/pc search …` | Search Memory without the model |
| `/pc remember …` | Write Memory without the model |
| `/pc review` | List pending Candidates |
| `/pc review approve / reject` | Approve or reject; do not let the model approve silently |
| `/pc stats` / `/pc capabilities` | Diagnostics |

Command results render in the UI and **never** enter model history. Headless has no slash-command adapter.

## Settings → Plugins

This is a Harness product split, not a failed install.

- **Plugin configuration** ships three cards only: Shell, Agent loop, Web search. This bundle has no card there.
- **Plugin list** is the live Loader inventory. Search for `powercontext`; the row is `powercontext-dsh`.

Whether the plugin works is `/pc doctor`, tool calls, and cross-session recall — not a settings card.

## Fail-open

An unreachable Server skips recall, returns `{ ok: false, code: "unavailable" }` from tools, and never rejects the user turn. Diagnostics log operation id, status, byte count, and outcome — never query, content, citation, or authorization.

Do not store secrets, API keys, or private key material in Memory or Sources.

## Development

HTTP operations are generated from the vendored [`openapi/powercontext.yaml`](openapi/powercontext.yaml). Update that file (or set `POWERCONTEXT_OPENAPI`) and run `pnpm build` when the Server contract changes.

```bat
pnpm install
pnpm test
pnpm build
```

- Push to `main` / `master`: `pnpm test` then `pnpm build`, and check that `lib/` plus the generated table are committed.
- Pull requests: `pnpm test` only.
- GitHub Release is manual: Actions → **Release** → Run workflow → version such as `0.1.0`. The asset is `powercontext-dsh-X.Y.Z.tgz`. The workflow needs `contents: write` (default `GITHUB_TOKEN` is enough).

## License

[Apache License 2.0](LICENSE)
