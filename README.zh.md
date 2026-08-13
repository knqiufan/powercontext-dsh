# PowerContext for DeepSeek Harness

[English](README.md) | **中文**

独立的 DeepSeek Harness 组合包。它用 HTTP 调用一台正在运行的 [PowerContext](https://github.com/oceanbase/powercontext) Server，不嵌入存储，不启动 Server，也不 `import` Python 包。

日常对话**不需要**输入 `/pc`，也不需要说「remember」。`/pc` 是诊断和审核用的人工命令。

```bat
dsh plugin --profile web add <路径或 tarball>
```

## 它做什么

每次模型开口前，插件会：

1. **召回**：调用 `POST /v1/context/prepare`，把有界上下文当作不可信的历史证据注入本轮。
2. **捕获**：调用 `POST /v1/sources/content`，把当前用户原话存成 Content Source。

具名 `pc_*` 工具覆盖 Memory / Handoff / Source 以及只读或生成路径。`pc_call` 能打到全部 OpenAPI `operationId`。skill `project-context` 把同一套流程写给模型。

| 你做了什么 | 立刻发生的 | 跨会话能否被问出来 |
|---|---|---|
| 普通聊天（「登录改成 JWT」） | 这句话被存成 Source | 需要 Server 开了定时抽取，或你明确让它记住 |
| 明确让它记住（「这个约定写进项目记忆」） | 模型调用 `pc_remember` | 可以，不依赖抽取作业 |
| 新会话里继续问旧决策 | `prepare_context` 自动注入；模型也可能再搜一次 | 前提是该项目 scope 里已经有 Memory |

没有配置抽取模型时，Server 仍然接受显式 Memory 写入。只是「聊过就算记住」这一条不会自动成立。

## 安装

PowerContext Server 和 DeepSeek Harness 是两个进程，缺一不可。

### 1. 启动 PowerContext Server

```bat
uv tool install "powercontext[cli,server] @ git+https://github.com/oceanbase/powercontext.git@master"
powercontext server run
```

若已有 PowerContext checkout，也可以用 `uv run powercontext server run`。

默认：

- 地址 `http://127.0.0.1:8000`
- 无认证
- 数据在用户目录下的 SQLite（可用 `POWERCONTEXT_HOME` 覆盖）
- **不**自动从对话抽取 Memory；显式写入仍然可用

另开终端确认：

```bat
curl http://127.0.0.1:8000/health/live
curl http://127.0.0.1:8000/health/ready
```

`live` 必须成功。`ready` 允许 `degraded`（没配推理模型时常见）。

### 2. 先成功启动一次 DeepSeek Harness

执行一次 `dsh web`（或在 Harness checkout 里 `pnpm dsh web`），让 `$DSH_HOME/profiles` 存在。之后可以关掉。

### 3. 把插件装进 web profile

装的是已经构建好的 `lib/`，不是 TypeScript 源文件。

**GitHub Release 的 tarball（推荐）。** 下载 `powercontext-dsh-*.tgz`：

```bat
dsh plugin --profile web add C:\path\to\powercontext-dsh-0.1.0.tgz
```

Release 的下载 URL 同样可用。

**clone 本仓库源码。** 源码树提交了 `lib/`，clone 后可以直接 add，不必先 `pnpm build`：

```bat
dsh plugin --profile web add C:\path\to\powercontext-dsh
```

只有改了 TypeScript 才需要 `pnpm install`、`pnpm test`、`pnpm build`，然后重启 `dsh web`。

**发布到 npm 之后：**

```bat
dsh plugin --profile web add powercontext-dsh
```

`uv` / `powercontext` **不会**自动给 Harness 装这个包。

可选校验（`--dump-config` 只打印配置树然后退出，不是启动命令）：

```bat
dsh --profile web --dump-config
```

输出里应有 `# == powercontext-dsh` 和 `id: powercontext-dsh`。日常使用请用 `dsh web`，不要加 `--dump-config`。

插件会从 Harness checkout 解析 `@deepseek-ai/dsh-tools` 和 `@deepseek-ai/dsh-llm`，再回退到 `$DSH_HOME/profiles/node_modules`。若这些导入失败，请先成功跑过一次 Harness 再 `plugin add`。

### 4. 打开项目工作区

1. 终端 A 保持 `powercontext server run`。
2. 终端 B 启动 `dsh web`（若 Server 在远程，先按下文设好 `baseUrl`）。
3. 浏览器里新建会话，工作区选**你正在开发的那个 Git 仓库**，不要选 Harness 自己的源码目录（除非你真的在改 Harness）。

然后直接正常对话即可。可选自检：

```text
/pc
/pc doctor
```

`/pc` 会打印当前 `scope` 和 `baseUrl`。两次会话要共享记忆，`scope` 必须相同。

卸载：

```bat
dsh plugin --profile web remove powercontext-dsh
```

## 远程 PowerContext Server

插件跑在 **`dsh web` 所在的那台机器**（Harness Host / Node 进程）里。浏览器不直连 PowerContext，所以不存在前端 CORS 问题。要通的是：**跑 Harness 的那台电脑 → PowerContext 的 URL**。

### Server 侧

默认只绑 `127.0.0.1`，外网连不上。远程部署至少要改监听地址，并打开鉴权。明文 HTTP 只适合本机；对网络暴露前应在前面加 TLS（Nginx / Caddy 等）。

```bat
set POWERCONTEXT_SERVER_HTTP_HOST=0.0.0.0
set POWERCONTEXT_SERVER_HTTP_PORT=8000
set POWERCONTEXT_SERVER_AUTH_ENABLED=true
set POWERCONTEXT_SERVER_AUTH_TOKEN=换成足够长的随机串
powercontext server run
```

对外公布的地址应是用户实际访问的根，例如 `https://pc.example.com`，不要带尾斜杠，也不要带 `/mcp`。本插件走 OpenAPI（`/v1/...`），不是 MCP。

### 插件侧：改 baseUrl

默认 `http://127.0.0.1:8000`。环境变量优先于 patch 配置。密钥不要写进能被 `--dump-config` 打出来的文件。

启动 Harness 前（PowerShell）：

```powershell
$env:POWERCONTEXT_DSH_BASE_URL = "https://pc.example.com"
$env:POWERCONTEXT_DSH_AUTHORIZATION = "Bearer 换成足够长的随机串"
dsh web
```

`POWERCONTEXT_DSH_AUTHORIZATION` 必须是完整的 `Bearer <token>`，与 Server 的 `POWERCONTEXT_SERVER_AUTH_TOKEN` 对应。

长期本机默认（不要写 token）可以编辑 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`（或 `~/.dsh/profiles/web/cordis.patch.yml`）。Harness 的 patch **整份替换**该行的 `config`，不会按键合并，所以要把需要保留的项一起写上：

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

改完后重启 `dsh web`。用 `/pc` 或 `--dump-config` 确认 `baseUrl` 已变。token 继续只用环境变量 `POWERCONTEXT_DSH_AUTHORIZATION`。

## 配置

Patch 默认值：

| 字段 | 默认 | 含义 |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8000` | Server 根，无尾斜杠 |
| `authorization` | 空 | 完整 `Bearer <token>`；空则不发送 |
| `scopeId` | 空 | 覆盖自动推导的项目 scope |
| `timeoutMs` | 4000 | 召回 + 捕获的共享预算 |
| `requestTimeoutMs` | 1000 | 单次 HTTP 超时 |
| `maxBytes` | 8000 | `prepare_context` 预算 |
| `capturePrompts` | true | 把用户原话存成 Source |
| `flushOnCapture` | false | 捕获后立刻 flush；仅排障 |

插件（Harness 进程）环境变量：

| 变量 | 作用 |
|---|---|
| `POWERCONTEXT_DSH_BASE_URL` | Server 根 URL，无尾斜杠 |
| `POWERCONTEXT_DSH_AUTHORIZATION` | 完整 `Bearer <token>` |
| `POWERCONTEXT_DSH_SCOPE_ID` | 覆盖自动推导的项目 scope |
| `POWERCONTEXT_DSH_CAPTURE_PROMPTS` | `false` 时不把用户原话存成 Source |
| `POWERCONTEXT_DSH_FLUSH_ON_CAPTURE` | 捕获后立刻 flush；默认关 |

Server 进程（常见项）：

| 变量 | 作用 |
|---|---|
| `POWERCONTEXT_SERVER_HTTP_HOST` / `_PORT` | 监听地址 |
| `POWERCONTEXT_SERVER_AUTH_ENABLED` / `_TOKEN` | 静态 Bearer |
| `POWERCONTEXT_HOME` | 数据目录 |
| `POWERCONTEXT_SERVER_RUNTIME_SCHEDULE_SECONDS` | 定时抽取间隔；不设则不跑抽取作业 |
| `POWERCONTEXT_SERVER_INFERENCE_GENERATION_MODEL` | 抽取用的生成模型 |

设置页里**改不了**这个插件的 `baseUrl`。用环境变量或上面的 profile patch。

## 工作区与 scope

记忆不是「这个 Harness 用户的全部记忆」，而是挂在一个 **scope** 上。

1. 看当前**会话工作区**（你在 Web 里选的那个项目目录），也就是 `agent.session.header.cwd`。
2. 在这个目录里读 `git remote origin`。
3. 规范化成 `git:主机/路径`，例如 `git:github.com/oceanbase/powercontext`。
4. 没有可用 remote 时，用 `local:` + 该仓库根路径的哈希。

这**不是**你运行 `dsh web` 时的当前目录。你完全可以在 Harness 源码目录里启动 CLI，但会话工作区选业务仓库——scope 跟的是后者。

- 同一仓库、两个会话 → 同一个 scope → 能互相召回。
- 会话 A 在仓库甲、会话 B 在仓库乙 → 两个 scope → B 搜甲的记忆为空。这不是故障。
- 想强制所有会话共用一个 id：设 `POWERCONTEXT_DSH_SCOPE_ID`（一般不建议，会把无关项目的记忆混在一起）。

跨会话对不上时，先对两个会话各打一次 `/pc`，看 `scope=` 是否相同，不要先怀疑写入失败。

## 日常使用

不要把 `/pc remember …` 当成日常口令。那是对照实验。

### 当天定规矩，第二天接着问

工作区选中你的业务仓库。会话 1：

> 登录不要再支持 session cookie 了，统一 JWT。refresh token 放 HttpOnly cookie。后面改接口都按这个。

如果希望**现在**就能跨会话用，补一句人话即可（仍然不是 `/pc`）：

> 把这条鉴权约定写进项目记忆，之后新会话也要能用。

看对话里是否出现成功的 `pc_remember`（或同类写入）。只有模型口头说「记住了」但没有工具调用，Server 里是没有这条 Memory 的。

关掉会话 1，**同一工作区**开会话 2：

> 这个项目登录方案当时定的是什么？按项目记忆说，不要猜。

通过标准：能答出 JWT / HttpOnly，而且最好能看到自动注入或 `pc_search` / `pc_prepare_context`。

### 只聊天、不说「记住」

Server 需同时配置生成模型和 `POWERCONTEXT_SERVER_RUNTIME_SCHEDULE_SECONDS`。会话 1 只谈需求、改代码，不要提 PowerContext。等抽取跑完，同一仓库开会话 2 问昨天的关键约束。

未配抽取时，不要用这一条判断插件坏了。此时 Source 会在，Memory 可能还没有。

### 隔夜接着改同一个功能

会话 1：

> 支付回调的验签还没做完，卡在微信的平台证书轮换。明天从这里继续。

会话 2：

> 接着做支付回调验签，从上次卡住的地方开始。

若记忆在，模型应带着「证书轮换」往下走，而不是当新任务从零问起。

### Server 挂了也不应卡住编码

停掉 `powercontext server run`，在 Harness 里继续问普通改代码问题。插件应跳过召回；若模型仍去调 `pc_*`，应得到不可用提示并继续任务，而不是整轮卡死。

## `/pc` 什么时候才用

| 命令 | 用途 |
|---|---|
| `/pc` | 看当前 scope 和 baseUrl |
| `/pc doctor` | Server 是否可达 |
| `/pc search …` | 不经过模型、直接搜记忆 |
| `/pc remember …` | 不经过模型、直接写入 |
| `/pc review` | 列出待审核 Candidate |
| `/pc review approve / reject` | 批准或驳回；默认不要让模型静默批准 |
| `/pc stats` `/pc capabilities` | 诊断 |

这些命令的结果只显示在 UI，**不会**当作用户消息送给模型。headless 模式没有斜杠命令。

## 设置 → 插件 里为什么看不到配置卡片

这是 DeepSeek Harness 的产品切分，不是安装失败。

- **插件配置**：只有终端 / Agent 循环 / 网页搜索三张卡片。本包不会出现在这里。
- **插件列表**：当前 Loader 里所有已挂载插件。搜索 `powercontext`，条目名是 `powercontext-dsh`。

插件是否起效，以 `/pc doctor`、工具调用和跨会话召回为准，不以「插件配置」里有没有一张 PowerContext 卡片为准。

## Fail-open

Server 不可达时跳过召回，工具返回 `{ ok: false, code: "unavailable" }`，**不会**把用户回合打成失败。诊断日志只记 operation id、status、字节数和 outcome，不记 query、正文、citation 或 authorization。

不要把密钥、API key 或私钥材料写入 Memory 或 Source。

## 开发

HTTP 操作表由本仓库的 [`openapi/powercontext.yaml`](openapi/powercontext.yaml) 生成。Server 契约变更后更新该文件（或设置 `POWERCONTEXT_OPENAPI`），再执行 `pnpm build`。

```bat
pnpm install
pnpm test
pnpm build
```

- 推到 `main` / `master`：跑 `pnpm test` 和 `pnpm build`，并检查 `lib/` 与生成表已提交。
- Pull Request：只跑 `pnpm test`。
- GitHub Release 需手动触发：Actions → **Release** → Run workflow，填写例如 `0.1.0`。产物是 `powercontext-dsh-X.Y.Z.tgz`。仓库需要允许 Actions 写 contents（默认 `GITHUB_TOKEN` 即可）。

## 许可证

[Apache License 2.0](LICENSE)
