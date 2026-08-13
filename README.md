# PowerContext for DeepSeek Harness

独立的 DeepSeek Harness 组合包。它用 HTTP 调用一台正在运行的 PowerContext Server，不嵌入存储，不启动 Server，也不 `import` Python 包。

本目录就是完整插件仓库：可以单独 push 到 GitHub。推到 `main`/`master` 会跑测试和 `pnpm build`；Pull Request 只跑测试。GitHub Release 在 Actions 里手动跑 Release workflow。源码树里的 `lib/` 与 Release 包都可以直接：

```bat
dsh plugin --profile web add <路径或 tarball>
```

日常使用（远程 Server、`baseUrl`、工作区 scope）见 [USER.md](USER.md)。

## What it does

- `agent/pre-step` calls `POST /v1/context/prepare`, then independently captures
  the current user prompt with `POST /v1/sources/content`
- named `pc_*` tools cover Memory, Handoff, Source, and read/generate paths
- `pc_call` reaches every OpenAPI `operationId`
- `/pc …` commands cover diagnostics and Candidate review
- skill `project-context` documents the same workflow for the model

Start a local Server before using the integration:

```bat
uv run powercontext server run
```

## Install

### Release tarball

Download `powercontext-dsh-*.tgz` from GitHub Releases, then in the DeepSeek Harness checkout:

```bat
pnpm dsh plugin --profile web add C:\path\to\powercontext-dsh-0.1.N.tgz
pnpm dsh web
```

### Source checkout

`lib/` is committed. Clone this repository and add the directory:

```bat
pnpm dsh plugin --profile web add C:\path\to\powercontext-dsh
pnpm dsh web
```

Rebuild only after you change TypeScript:

```bat
pnpm install
pnpm test
pnpm build
```

Optional check that the profile layer is mounted (`--dump-config` prints the tree and exits; it does not start the app):

```bat
pnpm dsh --profile web --dump-config
```

`dump-config` must show a `# == powercontext-dsh` layer and `id: powercontext-dsh`.
`dsh plugin --profile web remove powercontext-dsh` reverses the install.

The plugin does not bundle DeepSeek Harness packages. At load time it resolves
`@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-llm` from the checkout, then from
`$DSH_HOME/profiles/node_modules` (created the first time you run `dsh web` or
`dsh --dump-config`). Run Harness once before the first plugin add if those
imports fail to resolve.

After the package is published to npm:

```sh
uv tool install "powercontext[cli,server]"
powercontext server run
dsh plugin --profile web add powercontext-dsh
dsh web
```

`uv install` does not install this plugin into DeepSeek Harness. The two
processes stay separate.

## OpenAPI contract

HTTP operations are generated from the vendored [`openapi/powercontext.yaml`](openapi/powercontext.yaml).
When this directory still sits inside a PowerContext checkout, `pnpm build` copies
the sibling `openapi/powercontext.yaml` into this package. After the split, update
the vendored file (or set `POWERCONTEXT_OPENAPI`) and rebuild.

## Configuration

Patch defaults (override in the profile `cordis.patch.yml` or via env):

| Field | Default | Meaning |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8000` | Server root, no trailing slash |
| `authorization` | empty | Full `Bearer <token>`; omitted when empty |
| `scopeId` | empty | Overrides automatic project scope |
| `timeoutMs` | 4000 | Shared recall+capture budget |
| `requestTimeoutMs` | 1000 | Single HTTP timeout |
| `maxBytes` | 8000 | `prepare_context` budget |
| `capturePrompts` | true | Persist the user prompt as a Source |
| `flushOnCapture` | false | Test-only flush after capture |

Environment overrides (never put secrets in dump-config output):

- `POWERCONTEXT_DSH_BASE_URL`
- `POWERCONTEXT_DSH_SCOPE_ID`
- `POWERCONTEXT_DSH_AUTHORIZATION`
- `POWERCONTEXT_DSH_CAPTURE_PROMPTS`
- `POWERCONTEXT_DSH_FLUSH_ON_CAPTURE`

Scope comes from the Git remote when possible, otherwise `local:{sha256(cwd)}`.
cwd is `agent.session.header.cwd`, not the `dsh` launch directory.

## Fail-open

An unreachable Server skips recall, returns `{ ok: false, code: "unavailable" }`
from tools, and never rejects the user turn. Diagnostics log operation id,
status, byte count, and outcome — never query, content, citation, or
authorization.

Do not store secrets, API keys, or private key material in Memory or Sources.
Candidate approve/reject belongs to `/pc review …` unless the user explicitly
asks the model to do it.
