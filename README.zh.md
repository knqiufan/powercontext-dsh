# PowerContext for DeepSeek Harness

[English](README.md) | **中文**

DeepSeek Harness 插件。通过 HTTP 调用正在运行的 [PowerContext](https://github.com/oceanbase/powercontext) Server，把项目记忆、任务交接、经验和技能接到 Agent 循环中。本仓库不嵌入存储、不启动 Server，也不 `import` Python 包。

```bash
dsh plugin --profile web add <path-or-tarball>
```

## 功能

插件按 OpenAPI 调用 Server 的 `/v1/...` 接口，不走 MCP。

每轮模型开口前自动：

1. **召回**：`POST /v1/context/prepare`，把有界上下文注入本轮（按不可信历史证据处理）。
2. **捕获**：`POST /v1/sources/content`，把当前用户输入存成 Content Source。

Agent 通过具名 `pc_*` 工具使用常用能力；其余 OpenAPI `operationId` 走 `pc_call`。同时注册 skill `project-context`。Server 不可达时跳过召回，不阻断当前对话。

| 能力 | 工具 | HTTP |
|---|---|---|
| 记忆 | `pc_search` `pc_remember` `pc_memory_list` `pc_memory_get` `pc_memory_revise` `pc_memory_retire` | `/v1/memory/*` |
| 上下文 | `pc_prepare_context` `pc_capture_source` | `/v1/context/prepare`、`/v1/sources/content` |
| 交接 | `pc_handoff_activate` `pc_handoff_prepare` `pc_handoff_finalize` `pc_handoff_commit` `pc_handoff_continue` | `/v1/handoff/*` |
| 经验 / 技能 | `pc_experience_generate` `pc_experience_get` `pc_skill_generate` `pc_skill_get` | `/v1/experience/*`、`/v1/skill/*` |
| 审核 | `pc_review_list` `pc_review_get` | `/v1/artifact-candidates/*` |
| 其余 | `pc_call` | 全部 `operationId`（健康检查、统计、外部 Skill、Handoff Report 等） |

完整接口见 [`openapi/powercontext.yaml`](openapi/powercontext.yaml)。

## 快速开始

需要同时运行 PowerContext Server 和 DeepSeek Harness。

### 启动 Server

```bash
uv tool install "powercontext[cli,server] @ git+https://github.com/oceanbase/powercontext.git@master"
powercontext server run
```

若本地已有 PowerContext 源码，可用 `uv run powercontext server run`。

默认监听 `http://127.0.0.1:8000`，无认证，数据在用户目录下的 SQLite（可用 `POWERCONTEXT_HOME` 覆盖）。

```bash
curl http://127.0.0.1:8000/health/live
curl http://127.0.0.1:8000/health/ready
```

`live` 必须成功。`ready` 在未配置推理模型时可以为 `degraded`。

### 安装插件

先安装 DeepSeek Harness，并确保 web profile 可用（执行一次 `dsh web` 即可）。

**GitHub Release（推荐）** — 下载 `powercontext-dsh-*.tgz`：

```bash
dsh plugin --profile web add ./powercontext-dsh-0.1.0.tgz
```

Release 的下载 URL 同样可用。

**源码目录：**

```bash
dsh plugin --profile web add /path/to/powercontext-dsh
```

改动 TypeScript 后需要 `pnpm install`、`pnpm test`、`pnpm build`，然后重启 `dsh web`。

**npm（发布后）：**

```bash
dsh plugin --profile web add powercontext-dsh
```

`uv` / `powercontext` 不会把本插件装进 Harness。

可选确认：

```bash
dsh --profile web --dump-config
```

输出中应有 `id: powercontext-dsh`。

卸载：

```bash
dsh plugin --profile web remove powercontext-dsh
```

### 使用

保持 Server 运行，然后：

```bash
dsh web
```

像平时使用 Agent 一样打开项目、开始对话即可。插件会在后台自动召回上下文、保存用户输入；需要读写记忆、交接任务或生成经验 / 技能时，模型会调用对应的 `pc_*` 工具。

对话中可输入 `/pc doctor` 检查 Server 是否可达。

## 配置

环境变量优先于 patch 配置。密钥不要写进会被 `--dump-config` 打印的文件。

| 字段 | 环境变量 | 默认 | 含义 |
|---|---|---|---|
| `baseUrl` | `POWERCONTEXT_DSH_BASE_URL` | `http://127.0.0.1:8000` | Server 根 URL，无尾斜杠 |
| `authorization` | `POWERCONTEXT_DSH_AUTHORIZATION` | 空 | 完整 `Bearer <token>` |
| `scopeId` | `POWERCONTEXT_DSH_SCOPE_ID` | 空 | 覆盖自动推导的项目 scope |
| `timeoutMs` | — | `4000` | 召回 + 捕获的共享预算 |
| `requestTimeoutMs` | — | `1000` | 单次 HTTP 超时 |
| `maxBytes` | — | `8000` | `prepare_context` 预算 |
| `capturePrompts` | `POWERCONTEXT_DSH_CAPTURE_PROMPTS` | `true` | 把用户输入存成 Source |
| `flushOnCapture` | `POWERCONTEXT_DSH_FLUSH_ON_CAPTURE` | `false` | 捕获后立刻 flush |

长期非密钥默认可写在 `~/.dsh/profiles/web/cordis.patch.yml`。Harness 会**整份替换**该插件的 `config`，需要保留的项要一起写上：

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

### 远程 Server

插件跑在 Harness 进程里，浏览器不直连 PowerContext。默认 Server 只绑 `127.0.0.1`。远程部署需要扩大监听范围并开启鉴权；对网络暴露前应在前面加 TLS。

```bash
export POWERCONTEXT_SERVER_HTTP_HOST=0.0.0.0
export POWERCONTEXT_SERVER_HTTP_PORT=8000
export POWERCONTEXT_SERVER_AUTH_ENABLED=true
export POWERCONTEXT_SERVER_AUTH_TOKEN=<long-random-secret>
powercontext server run
```

对外公布的地址应是实际访问的根，例如 `https://pc.example.com`，不要带尾斜杠，也不要带 `/mcp`。

```bash
export POWERCONTEXT_DSH_BASE_URL=https://pc.example.com
export POWERCONTEXT_DSH_AUTHORIZATION="Bearer <long-random-secret>"
dsh web
```

`POWERCONTEXT_DSH_AUTHORIZATION` 必须是完整的 `Bearer <token>`，与 Server 的 `POWERCONTEXT_SERVER_AUTH_TOKEN` 对应。token 只用环境变量，不要写进 patch 文件。

常用 Server 变量：

| 变量 | 作用 |
|---|---|
| `POWERCONTEXT_SERVER_HTTP_HOST` / `_PORT` | 监听地址 |
| `POWERCONTEXT_SERVER_AUTH_ENABLED` / `_TOKEN` | 静态 Bearer |
| `POWERCONTEXT_HOME` | 数据目录 |
| `POWERCONTEXT_SERVER_RUNTIME_SCHEDULE_SECONDS` | 定时抽取间隔；不设则不跑抽取 |
| `POWERCONTEXT_SERVER_INFERENCE_GENERATION_MODEL` | 抽取用的生成模型 |

## 开发

HTTP 操作表由本仓库的 [`openapi/powercontext.yaml`](openapi/powercontext.yaml) 生成。Server 契约变更后更新该文件（或设置 `POWERCONTEXT_OPENAPI`），再执行 `pnpm build`。

```bash
pnpm install
pnpm test
pnpm build
```

- 推到 `main` / `master`：跑 `pnpm test` 和 `pnpm build`，并检查 `lib/` 与生成表已提交。
- Pull Request：只跑 `pnpm test`。
- GitHub Release 需手动触发：Actions → **Release** → Run workflow，填写例如 `0.1.0`。产物是 `powercontext-dsh-X.Y.Z.tgz`。

## 许可证

[Apache License 2.0](LICENSE)
