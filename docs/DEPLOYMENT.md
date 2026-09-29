# GitHub Pages 部署与维护

## 首次启用

目标仓库：`chen111-tag/typhoon-coastal-info`，主分支 `main`。

当前账号在私有仓库的 Pages 设置中显示“Upgrade or make this repository public to enable Pages”。可选择升级支持私有仓库 Pages 的套餐，或经仓库所有者明确同意后把仓库公开。公开将暴露仓库代码、文档和已有提交历史；不能仅为部署网站而默认更改可见性。

满足条件后：进入 Settings → Pages，将 Source 设为 GitHub Actions；进入 Actions → Update typhoon data and deploy Pages → Run workflow，选择 main 并运行。成功后在环境部署记录中打开网站：

https://chen111-tag.github.io/typhoon-coastal-info/

首次验收必须同时确认工作流成功、网站 HTTP 可访问、网页与已发布 JSON 的时间和数值一致，不能仅凭文件上传认定上线。

## 工作流与权限

- cron 为 `7,22,37,52 * * * *`，UTC 每15分钟；支持 workflow_dispatch 和指定文件的 main 分支 push。
- 先测试、采集，再构建和部署；GitHub 队列可能延迟，计划时刻不是服务等级保证。
- build 需要 contents: write 以保存数据检查点；deploy 使用 pages: write 与 id-token: write。
- 环境为 github-pages。若保护规则要求批准，仓库管理员需审核该次部署。
- 使用 Node.js 22；无 npm 依赖，无需 npm install 或 Firecrawl 密钥。
- 数据变化或跨 UTC 日时提交快照。GITHUB_TOKEN 产生的提交不会再次触发普通 push 工作流。
- 若主分支保护禁止机器人提交，检查点步骤可能失败；当次已采集内容仍可发布，下次也尝试读取上次发布快照。
- 公开仓库长期无活动时，GitHub 可能停用定时工作流；本项目日检查点减少该情况，但仍应定期检查 Actions 状态。

## 发布范围

`scripts/build.mjs` 明确复制7个文件到 `_site`：HTML、CSS、两个浏览器脚本、两份 JSON 与 `.nojekyll`。工作流上传 `_site`。开发缓存 `.local`、`.firecrawl`、环境变量文件、项目文档和测试都不进入网站包。

## 故障行为与排查

1. Actions 标红：先查看 Fetch official public typhoon data 的日志。源站不可达时不删除旧快照；部署缓存和异常状态后，最后一步故意报错，便于发现问题。
2. 网页提示同步异常：比较成功同步、最近尝试及观测时刻，打开官方来源核对。不要手工把旧数据时间改成当前时间。
3. Pages 配置失败：检查仓库套餐/可见性、Source 是否 GitHub Actions、环境权限。
4. 数据更新而部署失败：站点可能仍保留上一版本，重新运行工作流并检查网站时间；仅工作流采集成功不等于发布成功。
5. 页面无数据：使用 HTTP 访问，不直接打开 file://；检查 data/typhoons.json 与 data/status.json 是否成功返回且时间匹配。
6. 官方字段改变：先在本地跑测试和一次真实采集，更新适配器，再运行完整部署。禁止用演示数据覆盖生产快照。

维护者可在 GitHub 通知设置中启用 Actions 失败提醒。首次上线及接口变更后，应人工核对官方网站、JSON 与网页。

## 官方文档

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
