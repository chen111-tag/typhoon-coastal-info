# 浙江台风数据与 GitHub Pages Implementation Plan

**Goal:** 将演示网页替换为官方公开数据快照驱动的网站，由 GitHub Actions 每15分钟采集并部署 Pages。

**Architecture:** Node.js 无依赖采集器规范化官方站点公开接口，生成静态JSON和同步状态；浏览器读取同源快照。抓取失败保留最近已发布数据，并发布故障状态；不生成地方预警。

**Tech Stack:** HTML/CSS/JavaScript、Node.js 22、node:test、GitHub Actions、GitHub Pages。

**Spec:** ../../PROJECT_PLAN.md 与本次用户要求；上传目标已确认 chen111-tag/typhoon-coastal-info。

## 任务

- [x] 编写公开接口适配、字段验证、时区转换、快照恢复与状态输出。
- [x] 增加时间/无台风/接口故障/缺失字段/旧数据保护等回归测试。
- [x] 从实时页面移除所有虚构台风和地方预警；支持动态时效、动态地图范围、同步与观测时间提示。
- [x] 配置每15分钟采集、手动触发、Pages构建与发布；失败时仍部署缓存及故障提示。
- [x] 更新来源说明和维护文档，并在桌面及手机浏览器验证真实快照。
- [ ] 上传仓库；按GitHub实际限制取得仓库公开确认或等待用户升级套餐。
- [ ] 启用Pages，验证Actions成功和公开网站内容。

## 验证重点

UTC与北京时间转换；预报与实况分开；没有活跃台风不回退到历史台风；抓取失败不清空旧数据；预警未接入不等于无预警；跨地区台风路径不裁掉当前中心；实际调度允许GitHub队列延迟。

