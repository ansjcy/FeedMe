# RSS 配置指南

## 概述

FeedMe 现在支持为每个 RSS 源配置独立的设置，包括：
- 每个源的最大条目数 (`maxItemsPerFeed`)
- 每个源的更新频率 (`cronConfig`)
- 启用/禁用状态 (`enabled`)
- 源描述 (`description`)

## 配置结构

### 源配置对象

每个 RSS 源现在支持以下属性：

```javascript
{
  name: "源名称",               // 必需：信息源显示名称
  url: "RSS URL地址",           // 必需：RSS源的URL
  category: "分类名称",         // 必需：源的分类
  maxItemsPerFeed: 5,          // 可选：该源保留的最大条目数
  cronConfig: "0 */3 * * *",   // 可选：GitHub Actions cron配置
  description: "源描述",        // 可选：源的描述信息
  enabled: true,               // 可选：是否启用该源（默认true）
}
```

### 全局默认配置

```javascript
export const config = {
  sources: [/* 源配置数组 */],
  maxItemsPerFeed: 2,          // 全局默认最大条目数
  defaultCronConfig: "0 */6 * * *",  // 全局默认更新频率
  dataPath: "./data",
}
```

## 配置示例

### 基础配置

```javascript
{
  name: "36kr",
  url: "https://rsshub.rssforever.com/36kr/hot-list",
  category: "技术博客",
}
// 使用全局默认设置：maxItemsPerFeed=2, cronConfig="0 */6 * * *"
```

### 自定义条目数

```javascript
{
  name: "TechCrunch",
  url: "https://techcrunch.com/feed/",
  category: "技术新闻",
  maxItemsPerFeed: 8,  // 新闻类保留更多条目
}
```

### 自定义更新频率

```javascript
{
  name: "Google 新闻",
  url: "https://news.google.com/rss",
  category: "世界新闻",
  maxItemsPerFeed: 10,
  cronConfig: "0 */1 * * *",  // 每小时更新一次（高频新闻）
}
```

### 低频更新的博客

```javascript
{
  name: "Netflix blog",
  url: "https://netflixtechblog.com/feed",
  category: "技术博客",
  cronConfig: "0 0 */3 * *",  // 每3天更新一次
}
```

### 完整配置

```javascript
{
  name: "Hugging Face 每日论文",
  url: "https://rsshub.rssforever.com/huggingface/daily-papers",
  category: "科研论文",
  maxItemsPerFeed: 8,
  cronConfig: "0 0 * * *",  // 每天更新一次
  description: "Hugging Face 精选的每日AI论文",
  enabled: true,
}
```

## Cron 表达式

常用的 cron 配置模式：

| 频率 | Cron 表达式 | 说明 |
|------|-------------|------|
| 每小时 | `0 */1 * * *` | 适合高频新闻 |
| 每2小时 | `0 */2 * * *` | 适合活跃的新闻源 |
| 每3小时 | `0 */3 * * *` | 适合常规技术博客 |
| 每6小时 | `0 */6 * * *` | 默认频率 |
| 每天 | `0 0 * * *` | 适合论文、项目类 |
| 每2天 | `0 0 */2 * *` | 适合更新较慢的博客 |
| 每周一 | `0 0 * * 1` | 适合周报类内容 |

## 辅助函数

配置文件提供了多个辅助函数：

### `getMaxItemsForSource(url)`
获取指定源的最大条目数配置。

```javascript
import { getMaxItemsForSource } from './config/rss-config.js';
const maxItems = getMaxItemsForSource('https://example.com/feed.xml');
```

### `getCronConfigForSource(url)`
获取指定源的 cron 配置。

```javascript
import { getCronConfigForSource } from './config/rss-config.js';
const cronConfig = getCronConfigForSource('https://example.com/feed.xml');
```

### `getEnabledSources()`
获取所有启用的源。

```javascript
import { getEnabledSources } from './config/rss-config.js';
const enabledSources = getEnabledSources();
```

### `getSourcesByCronConfig()`
按 cron 配置分组源，用于生成不同的 GitHub Actions 工作流。

```javascript
import { getSourcesByCronConfig } from './config/rss-config.js';
const sourcesByCron = getSourcesByCronConfig();
// 输出: { "0 */3 * * *": [source1, source2], "0 */6 * * *": [source3] }
```

### `getSourcesByCategory()`
按分类分组源。

```javascript
import { getSourcesByCategory } from './config/rss-config.js';
const sourcesByCategory = getSourcesByCategory();
```

### `getSourceConfig(url)`
获取源的完整配置信息（包括计算后的默认值）。

```javascript
import { getSourceConfig } from './config/rss-config.js';
const sourceConfig = getSourceConfig('https://example.com/feed.xml');
```

## 自动化设置

### Git 钩子自动化

为了确保工作流文件始终与配置保持同步，可以设置 Git 钩子：

```bash
# 安装 Git 钩子和添加 npm 脚本
pnpm setup-hooks
```

这将：
1. 安装 pre-commit Git 钩子
2. 在 package.json 中添加相关脚本
3. 当提交包含 RSS 配置修改时自动生成工作流

### 可用的 npm 脚本

安装后，您可以使用以下脚本：

```bash
# 验证 RSS 配置
pnpm validate-config

# 生成 GitHub Actions 工作流
pnpm generate-workflows

# 重新安装 Git 钩子
pnpm setup-hooks
```

### 自动化流程

1. **配置修改时**：
   - 修改 `config/rss-config.js`
   - 运行 `git add config/rss-config.js`
   - 运行 `git commit`
   - Pre-commit 钩子自动检测配置变更
   - 自动运行 `generate-workflows.js`
   - 自动将生成的工作流文件添加到提交中

2. **手动生成**：
   ```bash
   pnpm generate-workflows
   ```

3. **配置验证**：
   ```bash
   pnpm validate-config
   ```

## GitHub Actions 工作流生成

使用 `scripts/generate-workflows.js` 脚本可以根据配置自动生成 GitHub Actions 工作流：

```bash
node scripts/generate-workflows.js
```

该脚本会：
1. 按 cron 配置分组源
2. 为每组生成单独的工作流文件
3. 生成统一的部署工作流
4. 自动清理旧的工作流文件

### 工作流特点

- **独立更新**：每个工作流只更新特定频率的源
- **智能部署**：只有主要工作流触发网站重新部署
- **并发控制**：防止同一组源的并发更新
- **手动触发**：支持手动触发任何工作流
- **自动分布**：智能分布更新时间，避免所有源在同一时间更新造成系统负载过高

### 自动时间分布

为了避免多个源在同一时间更新（如都在午夜 `0 0 * * *`），系统会自动将更新时间分布到 6AM-10PM 之间，并且会将相同频率的源分成小组，每组独立调度：

```javascript
// 原始配置: 所有每日更新的源都在午夜执行
cronConfig: "0 0 * * *" // 13个源

// 自动分布后: 分散到不同时间的小组
// 组1 (3源): "57 12 * * *" (12:57 PM) - 36kr, Harvard Health, NASA
// 组2 (3源): "14 20 * * *" (8:14 PM)  - 知乎热榜, united ai, daily ai  
// 组3 (3源): "54 17 * * *" (5:54 PM)  - Machine Learning, Science Daily, macrumors
// 组4 (3源): "9 7 * * *"   (7:09 AM)  - Github热门, Hugging Face, Google开发者
// 组5 (1源): "1 17 * * *"  (5:01 PM)  - Google研究博客
```

#### 配置分布行为

可以在配置中控制分布行为：

```javascript
export const config = {
  // ... 其他配置
  
  // 工作流生成配置
  workflowGeneration: {
    // 是否自动分布更新时间以避免同时执行
    distributeCronTiming: true,
    // 分布时间的范围（小时）
    distributionHourRange: { min: 6, max: 22 }, // 6AM 到 10PM
    // 每个工作流的最大源数量（用于进一步分散负载）
    maxSourcesPerWorkflow: 3,
  },
}
```

配置选项：
- `distributeCronTiming`: 是否启用自动时间分布（默认：`true`）
- `distributionHourRange`: 分布的时间范围（默认：6AM-10PM）
- `maxSourcesPerWorkflow`: 每个工作流最多包含的源数量（默认：3）

#### 分布算法

1. **小组分割**：将相同频率的源按 `maxSourcesPerWorkflow` 分成小组
2. **确定性哈希**：使用源URL和组索引生成一致的随机数，确保每次生成相同的时间
3. **保持频率**：只修改具体执行时间，不改变更新频率（每日、每2天等）
4. **避开夜间**：默认在白天时间分布，避免夜间集中执行
5. **分钟随机化**：同时随机化分钟，进一步分散负载

**负载分散效果：**
- 原来 13 个每日源同时执行 → 现在分成 5 个组，分散到不同时间
- 原来 6 个每2天源同时执行 → 现在分成 2 个组，分散到不同时间
- 实现约 3-5 倍的负载分散，避免系统压力峰值

#### 禁用自动分布

如果您希望手动控制精确的执行时间，可以禁用自动分布：

```javascript
workflowGeneration: {
  distributeCronTiming: false, // 禁用自动分布
}
```

禁用后，工作流将使用配置中的原始 cron 表达式。

## 最佳实践

### 1. 按内容类型设置频率

```javascript
// 高频新闻
{ cronConfig: "0 */1 * * *", maxItemsPerFeed: 10 }

// 技术博客
{ cronConfig: "0 */6 * * *", maxItemsPerFeed: 5 }

// 研究论文
{ cronConfig: "0 0 * * *", maxItemsPerFeed: 8 }

// 项目展示
{ cronConfig: "0 0 * * *", maxItemsPerFeed: 15 }
```

### 2. 合理设置条目数

- 新闻类：8-10 条（更新频繁，需要更多条目）
- 技术博客：3-5 条（更新较慢，质量更高）
- 论文类：8-10 条（每日精选）
- 项目类：10-15 条（展示更多选择）

### 3. 避免 API 调用浪费

- 为低频更新的源设置较长的更新间隔
- 使用 `enabled: false` 临时禁用某些源
- 定期检查源的实际更新频率并调整配置

### 4. 工作流管理

- 修改配置后运行 `generate-workflows.js`
- 定期检查 GitHub Actions 的执行状况
- 监控 API 使用量和成本

## 迁移指南

### 从旧配置迁移

旧配置仍然兼容，可以逐步迁移：

```javascript
// 旧配置（仍然有效）
{
  name: "源名称",
  url: "源URL",
  category: "分类",
}

// 新配置（推荐）
{
  name: "源名称",
  url: "源URL",
  category: "分类",
  maxItemsPerFeed: 5,
  cronConfig: "0 */3 * * *",
  description: "源描述",
}
```

### 批量迁移脚本

可以创建脚本批量更新配置：

```javascript
// 为所有新闻类源设置高频更新
const newsSources = sources.filter(s => s.category.includes('新闻'));
newsSources.forEach(source => {
  source.cronConfig = "0 */2 * * *";
  source.maxItemsPerFeed = 8;
});
``` 