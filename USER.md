# PowerContext × DeepSeek Harness 使用手册

面向已经会用 DeepSeek Harness 的开发者。本插件不替代 Harness，也不内嵌记忆存储：它只是把当前会话接到一台正在运行的 PowerContext Server。

日常对话**不需要**输入 `/pc`，也不需要说「remember」。`/pc` 是诊断和审核用的人工命令。

---

## 1. 它在日常里实际做什么

每次你在某个**项目工作区**里发一条普通消息，插件会在模型开口前做两件事：

1. **召回**：按这条消息去 Server 取相关记忆，注入到本轮上下文（当作不可信的历史证据）。
2. **捕获**：把你刚说的话存成一条 Content Source，供 Server 后续抽取记忆。

因此正常用法就是：在同一个仓库里干活、做技术决策、隔天开新会话继续。插件在后台工作。

两件事需要分清：

| 你做了什么 | 立刻发生的 | 跨会话能否被问出来 |
|---|---|---|
| 普通聊天（「登录改成 JWT」） | 这句话被存成 Source | 需要 Server 开了定时抽取，或你明确让它记住 |
| 明确让它记住（「这个约定写进项目记忆」） | 模型调用 `pc_remember` | 可以，不依赖抽取作业 |
| 新会话里继续问旧决策 | `prepare_context` 自动注入；模型也可能再搜一次 | 前提是该项目 scope 里已经有 Memory |

没有配置抽取模型时，Server 仍然接受显式记忆写入。只是「聊过就算记住」这一条不会自动成立。

---

## 2. 新用户从头安装

下面假设：本机还没有配过这个插件。PowerContext 和 DeepSeek Harness 是两个进程，缺一不可。

### 2.1 准备 PowerContext Server

本机开发，在 PowerContext 仓库：

```bat
cd D:\code\git-project\powermem\powermem
uv run powercontext server run
```

或安装为独立工具（不依赖这份 checkout）：

```bat
uv tool install "powercontext[cli,server] @ git+https://github.com/oceanbase/powercontext.git@master"
powercontext server run
```

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

若希望「日常聊天自动变成记忆」，Server 还要配置抽取（见第 5 节）。第一期可以先不配，靠自然语言让模型写入。

### 2.2 准备 DeepSeek Harness

在 Harness 仓库先成功启动过一次 web profile（会创建 `%USERPROFILE%\.dsh\profiles`）：

```bat
cd D:\code\git-project\deepseek-harness
pnpm dsh web
```

能打开浏览器即可。先关掉也没关系。

### 2.3 把插件装进 web profile

本插件是独立的 npm 组合包，不依赖 PowerContext 源码树。装的是已经构建好的 `lib/`，不是 TypeScript 源文件。

**方式 A：下载 GitHub Release 的 tarball（推荐）**

Release 资产是 `powercontext-dsh-0.1.N.tgz`，里面已经含 `lib/` 和 `cordis.patch.yml`。

```bat
cd D:\code\git-project\deepseek-harness
pnpm dsh plugin --profile web add C:\Users\Administrator\Downloads\powercontext-dsh-0.1.N.tgz
```

也可以直接用 Release 的下载 URL（pnpm 接受 tarball 地址）。

**方式 B：clone 本仓库源码**

源码树提交了 `lib/`。clone 之后可以直接 add，不必先 `pnpm build`：

```bat
git clone <本插件仓库 URL> powercontext-dsh
cd D:\code\git-project\deepseek-harness
pnpm dsh plugin --profile web add D:\path\to\powercontext-dsh
```

只有你改了 TypeScript 源码时，才需要在插件仓库里执行 `pnpm install` 和 `pnpm build`，然后重启 `dsh web`。

**方式 C：发布到 npm 之后**

```bat
dsh plugin --profile web add powercontext-dsh
```

`uv` / `powercontext` **不会**自动给 Harness 装这个包。

可选校验（不是启动命令，只打印配置后退出）：

```bat
cd D:\code\git-project\deepseek-harness
pnpm dsh --profile web --dump-config
```

输出里应有 `# == powercontext-dsh` 和 `id: powercontext-dsh`。日常使用请用 `pnpm dsh web`，不要加 `--dump-config`。

### 2.4 启动并打开项目

1. 终端 A 保持 `powercontext server run`。
2. 终端 B：`pnpm dsh web`（若配了远程 Server，先按第 3 节设好 `baseUrl` 再启动）。
3. 浏览器里**新建会话，工作区选你正在开发的那个 Git 仓库**，不要选 Harness 自己的源码目录（除非你真的在给 Harness 写代码）。

然后直接正常对话即可。可选自检（不是日常必需）：

```text
/pc
/pc doctor
```

`/pc` 会打印当前 `scope` 和 `baseUrl`。两次会话要共享记忆，`scope` 必须相同。

卸载：

```bat
pnpm dsh plugin --profile web remove powercontext-dsh
```

---

## 3. 把 PowerContext 部署在远程服务器

插件跑在 **`dsh web` 所在的那台机器**（Harness Host / Node 进程）里，用 HTTP 访问 Server。浏览器不直连 PowerContext，所以不存在前端 CORS 问题。要通的是：**跑 Harness 的那台电脑 → PowerContext 的 URL**。

### 3.1 Server 侧

默认只绑 `127.0.0.1`，外网连不上。远程部署至少要改监听地址，并打开鉴权。明文 HTTP 只适合本机；对网络暴露前应在前面加 TLS（Nginx / Caddy 等）。

```bat
set POWERCONTEXT_SERVER_HTTP_HOST=0.0.0.0
set POWERCONTEXT_SERVER_HTTP_PORT=8000
set POWERCONTEXT_SERVER_AUTH_ENABLED=true
set POWERCONTEXT_SERVER_AUTH_TOKEN=换成足够长的随机串
powercontext server run
```

对外公布的地址应是用户实际访问的根，例如 `https://pc.example.com`，不要带尾斜杠，也不要带 `/mcp`。插件走的是 OpenAPI（`/v1/...`），不是 MCP。

### 3.2 插件侧：改 baseUrl

默认 `http://127.0.0.1:8000`。远程时必须改。环境变量优先于 patch 配置，密钥不要写进能被 `--dump-config` 打出来的文件。

**推荐：启动 Harness 前设环境变量（PowerShell）**

```powershell
$env:POWERCONTEXT_DSH_BASE_URL = "https://pc.example.com"
$env:POWERCONTEXT_DSH_AUTHORIZATION = "Bearer 换成足够长的随机串"
cd D:\code\git-project\deepseek-harness
pnpm dsh web
```

`POWERCONTEXT_DSH_AUTHORIZATION` 必须是完整的 `Bearer <token>`，与 Server 的 `POWERCONTEXT_SERVER_AUTH_TOKEN` 对应。

**或者：写进 web profile 的 patch（适合长期本机默认，不要写 token）**

编辑 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`。Harness 的 patch **整份替换**该行的 `config`，不会按键合并，所以要把需要保留的项一起写上：

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

### 3.3 全部相关环境变量

插件（Harness 进程）：

| 变量 | 作用 |
|---|---|
| `POWERCONTEXT_DSH_BASE_URL` | Server 根 URL，无尾斜杠 |
| `POWERCONTEXT_DSH_AUTHORIZATION` | 完整 `Bearer <token>` |
| `POWERCONTEXT_DSH_SCOPE_ID` | 覆盖自动推导的项目 scope |
| `POWERCONTEXT_DSH_CAPTURE_PROMPTS` | `false` 时不把用户原话存成 Source |
| `POWERCONTEXT_DSH_FLUSH_ON_CAPTURE` | 捕获后立刻 flush；默认关，仅排障用 |

Server 进程（常见项）：

| 变量 | 作用 |
|---|---|
| `POWERCONTEXT_SERVER_HTTP_HOST` / `_PORT` | 监听地址 |
| `POWERCONTEXT_SERVER_AUTH_ENABLED` / `_TOKEN` | 静态 Bearer |
| `POWERCONTEXT_HOME` | 数据目录 |
| `POWERCONTEXT_SERVER_RUNTIME_SCHEDULE_SECONDS` | 定时抽取间隔；不设则不跑抽取作业 |
| `POWERCONTEXT_SERVER_INFERENCE_GENERATION_MODEL` | 抽取用的生成模型 |

---

## 4. 工作区、scope，以及为什么换仓库会「搜不到」

记忆不是「这个 Harness 用户的全部记忆」，而是挂在一个 **scope** 上。插件这样决定 scope：

1. 看当前**会话工作区**（你在 Web 里选的那个项目目录），也就是 `agent.session.header.cwd`。
2. 在这个目录里读 `git remote origin`。
3. 规范化成 `git:主机/路径`，例如 `git:github.com/oceanbase/powercontext`。
4. 没有可用 remote 时，用 `local:` + 该仓库根路径的哈希。

这**不是**你运行 `pnpm dsh web` 时的当前目录。你完全可以在 Harness 源码目录里启动 CLI，但会话工作区选 PowerContext 仓库——scope 跟的是后者。

所以：

- 同一仓库、两个会话 → 同一个 scope → 能互相召回。
- 会话 A 在仓库甲、会话 B 在仓库乙 → 两个 scope → B 搜甲的记忆为空。这不是故障。
- 想强制所有会话共用一个 id：设 `POWERCONTEXT_DSH_SCOPE_ID`（一般不建议，会把无关项目的记忆混在一起）。

用 `/pc` 看当前 `scope=`。跨会话对不上时，先对这两个会话各打一次，不要先怀疑写入失败。

---

## 5. 日常使用怎么验（不要用评测口令）

`/pc remember …` 那类句子只适合做对照实验。作为用户，按下面做更接近真实。

### 场景 A：当天定规矩，第二天接着问

工作区选中你的业务仓库。会话 1 正常讨论，例如：

> 登录不要再支持 session cookie 了，统一 JWT。refresh token 放 HttpOnly cookie。后面改接口都按这个。

如果你希望**现在**就能跨会话用，补一句人话即可（仍然不是 `/pc`）：

> 把这条鉴权约定写进项目记忆，之后新会话也要能用。

看对话里是否出现 `pc_remember`（或同类写入）。有工具成功结果，才算写入。只有模型口头说「记住了」但没有工具调用，Server 里是没有这条 Memory 的。

关掉会话 1，**同一工作区**开会话 2，直接问：

> 这个项目登录方案当时定的是什么？按项目记忆说，不要猜。

通过标准：模型能答出 JWT / HttpOnly，而且最好能看到自动注入或 `pc_search` / `pc_prepare_context`。不要要求它复述任何评测标记。

### 场景 B：只聊天、不说「记住」（依赖 Server 抽取）

Server 需同时配置生成模型和 `POWERCONTEXT_SERVER_RUNTIME_SCHEDULE_SECONDS`。然后在会话 1 只谈需求、改代码，不要提 PowerContext。等抽取跑完（间隔取决于你设的秒数），同一仓库开会话 2 问昨天的关键约束。

未配抽取时，不要用场景 B 判断插件坏了。此时 Source 会在，Memory 可能还没有。

### 场景 C：隔夜接着改同一个功能

会话 1 做到一半：

> 支付回调的验签还没做完，卡在微信的平台证书轮换。明天从这里继续。

可以让它记住当前进度，或等抽取。会话 2：

> 接着做支付回调验签，从上次卡住的地方开始。

若记忆在，模型应带着「证书轮换」往下走，而不是当新任务从零问起。

### 场景 D：Server 挂了也不应卡住编码

停掉 `powercontext server run`，在 Harness 里继续问普通改代码问题。插件应跳过召回；若模型仍去调 `pc_*`，应得到不可用提示并继续任务，而不是整轮卡死。

---

## 6. `/pc` 什么时候才用

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

设置页里也**改不了**这个插件的 `baseUrl`。改法见第 3 节。

---

## 7. 设置 → 插件 里为什么看不到配置卡片

这是 DeepSeek Harness 的产品切分，不是安装失败。说明见仓库问答；操作上：

- **插件配置**：只有 Shell / Agent 循环 / 网页搜索三张卡片。
- **插件列表**：当前 Loader 里所有已挂载插件。在搜索框输入 `powercontext`，条目名是 `powercontext-dsh`。

插件是否起效，以 `/pc doctor`、工具调用和跨会话召回为准，不以「插件配置」里有没有一张 PowerContext 卡片为准。

---

## 8. 把本目录当成独立仓库

`integrations/dsh`（拆仓后就是仓库根）已经是完整的 npm 组合包：

- 契约在本包的 `openapi/powercontext.yaml`，不再读取 PowerContext 源码树
- `lib/` 随源码提交，clone 后可直接 `dsh plugin add`
- `.github/workflows/ci.yml`：`main`/`master` 的 push 跑 `pnpm test` 和 `pnpm build`；Pull Request 只跑 `pnpm test`
- `.github/workflows/release.yml`：手动发版。在 Actions 打开 Release workflow，填写例如 `0.1.0` 后 Run，会打包 `powercontext-dsh-0.1.0.tgz` 并创建 GitHub Release

把本目录推到新仓库时，在该目录初始化 git（不要带着 PowerContext 的其余历史）：

```bat
cd path\to\powercontext-dsh
git init
git add .
git commit -m "feat: init powercontext-dsh"
git branch -M main
git remote add origin <新仓库 URL>
git push -u origin main
```

发版不会随日常提交自动发生。需要发包时，打开 GitHub Actions 的 **Release** workflow，填入例如 `0.1.0`，再 Run workflow。

仓库需要允许 Actions 写 contents（默认 `GITHUB_TOKEN` 即可创建 Release）。产物是 Release 资产 `powercontext-dsh-X.Y.Z.tgz`。

