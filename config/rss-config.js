// RSS源接口
// name: 信息源名称
// url: RSS URL地址
// category: 分类名称
// maxItemsPerFeed: 该源的最大条目数 (可选，默认使用全局配置)
// cronConfig: 该源的更新频率配置 (可选，用于GitHub Actions)

/**
 * @typedef {object} RssSource
 * @property {string} name - 信息源名称
 * @property {string} url - RSS URL地址
 * @property {string} category - 分类名称
 * @property {number} [maxItemsPerFeed] - 该源的最大条目数 (可选，默认使用全局配置)
 * @property {string} [cronConfig] - 该源的更新频率配置 (可选，用于GitHub Actions)
 * @property {string} [description] - 源描述 (可选)
 * @property {boolean} [enabled] - 是否启用该源 (可选，默认true)
 */

// 默认配置
export const config = {
  sources: [
    {
      name: "36kr",
      url: "https://rsshub.rssforever.com/36kr/hot-list",
      category: "技术新闻",
      maxItemsPerFeed: 30, // 该源特定的配置
      cronConfig: "0 0 * * *", // 每天更新一次
      description: "36氪热门文章",
      enabled: true,
    },    
    {
      name: "Apple Insider",
      url: "https://rsshub.rssforever.com/appleinsider",
      category: "技术新闻",
      maxItemsPerFeed: 30, // 该源特定的配置
      cronConfig: "0 */6 * * *", // 每6小时更新一次
      enabled: true,
    },
    {
      name: "Harvard Health",
      url: "https://rsshub.rssforever.com/harvard/health/blog",
      category: "健康",
      maxItemsPerFeed: 30, // 该源特定的配置
      cronConfig: "0 0 * * *", // 每天更新一次
      enabled: true,
    },
    {
      name: "NASA",
      url: "https://rsshub.app/nasa/apod",
      category: "健康",
      maxItemsPerFeed: 10, // 该源特定的配置
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "人人影视新闻",
      url: "https://rsshub.app/yyets/article/news",
      category: "影视",
      maxItemsPerFeed: 15, // 该源特定的配置
      cronConfig: "0 0 * * 0", // 每周日更新一次
    },
    {
      name: "united ai",
      url: "https://www.unite.ai/feed/",
      category: "技术新闻",
      maxItemsPerFeed: 15, // 该源特定的配置
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "daily ai",
      url: "https://dailyai.com/feed",
      category: "技术新闻",
      maxItemsPerFeed: 15, // 该源特定的配置
      cronConfig: "0 0 * * *", // 每天更新一次
    },  
    {
      name: "Machine Learning Mastery",
      url: "https://machinelearningmastery.com/blog/feed/",
      category: "技术新闻",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "Science Daily - 人工智能",
      url: "https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml",
      category: "技术新闻",
      maxItemsPerFeed: 50,
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "Slack blog",
      url: "https://slack.engineering/feed/",
      category: "技术新闻",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 */2 * *", // 每2天更新一次 (更新频率较低的博客)
    },
    {
      name: "TechCrunch",
      url: "https://techcrunch.com/feed/",
      category: "技术新闻",
      maxItemsPerFeed: 20, // 新闻类保留更多条目
      cronConfig: "0 */6 * * *", // 每6小时更新一次 (高频新闻)
    },
    {
      name: "Netflix blog",
      url: "https://netflixtechblog.com/feed",
      category: "技术博客",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 */2 * *", // 每2天更新一次
    },
    {
      name: "Github blog",
      url: "https://github.blog/feed/",
      category: "技术博客",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 */2 * *", // 每2天更新一次
    },
    {
      name: "Airbnb blog",
      url: "https://medium.com/feed/airbnb-engineering",
      category: "技术博客",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 */2 * *", // 每2天更新一次
    },
    {
      name: "Microsoft blog",
      url: "https://blogs.microsoft.com/feed/",
      category: "技术博客",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 */2 * *", // 每2天更新一次
    },
    {
      name: "Facebook blog",
      url: "https://engineering.fb.com/feed/",
      category: "技术博客",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 */2 * *", // 每2天更新一次
    },
    {
      name: "Google 新闻",
      url: "https://news.google.com/rss",
      category: "新闻",
      maxItemsPerFeed: 20, // 新闻类保留更多条目
      cronConfig: "0 */6 * * *", // 每6小时更新一次 (高频新闻)
    },
    {
      name: "macrumors",
      url: "https://feeds.macrumors.com/MacRumors-All",
      category: "技术新闻",
      maxItemsPerFeed: 6,
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "Github 近一周热门",
      url: "https://rsshub.rssforever.com/github/trending/weekly/any",
      category: "代码项目",
      maxItemsPerFeed: 20, // 项目类保留更多条目
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "Hugging Face 每日论文",
      url: "https://rsshub.rssforever.com/huggingface/daily-papers",
      category: "科研论文",
      maxItemsPerFeed: 20,
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "Google 开发者博客",
      url: "https://rsshub.rssforever.com/google/developers/en",
      category: "技术博客",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "Google 研究博客",
      url: "https://rsshub.rssforever.com/google/research",
      category: "技术博客",
      maxItemsPerFeed: 10,
      cronConfig: "0 0 * * *", // 每天更新一次
    },
    {
      name: "South China Morning Post - 财富",
      url: "https://www.scmp.com/rss/318200/feed/",
      category: "新闻",
      maxItemsPerFeed: 20,
      cronConfig: "0 */6 * * *", // 每6小时更新一次 (高频新闻)
    },
    {
      name: "South China Morning Post - 全球经济",
      url: "https://www.scmp.com/rss/12/feed/",
      category: "新闻",
      maxItemsPerFeed: 20,
      cronConfig: "0 */6 * * *", // 每6小时更新一次 (高频新闻)
    },
    {
      name: "South China Morning Post - 中国经济",
      url: "https://www.scmp.com/rss/318421/feed/",
      category: "新闻",
      maxItemsPerFeed: 20,
      cronConfig: "0 */6 * * *", // 每6小时更新一次 (高频新闻)
    },
    {
      name: "South China Morning Post - 科技",
      url: "https://www.scmp.com/rss/36/feed/",
      category: "新闻",
      maxItemsPerFeed: 20,
      cronConfig: "0 */6 * * *", // 每6小时更新一次 (高频新闻)
    },
  ],
  // 全局默认配置
  maxItemsPerFeed: 10, // 全局默认最大条目数
  defaultCronConfig: "0 0 * * *", // 每天更新一次
  dataPath: "./data",
  
  // 工作流生成配置
  workflowGeneration: {
    // 是否自动分布更新时间以避免同时执行
    distributeCronTiming: true,
    // 分布时间的范围（小时）
    distributionHourRange: { min: 0, max: 23 }, // 6AM 到 10PM
    // 每个工作流的最大源数量（用于进一步分散负载）
    maxSourcesPerWorkflow: 5, // 减少每个工作流的源数量，创建更多组来避免冲突
    // 工作流执行时间优化
    optimization: {
      // 每个工作流预估运行时间（分钟）- 基于实际测试结果
      estimatedJobDurationMinutes: 25, // 实际测试显示工作流运行约25分钟
      // 禁用的时间间隔组合（会产生频繁冲突）
      disallowedIntervalCombinations: [
        { intervals: [2, 3], reason: "2小时和3小时会在6小时倍数时冲突" },
        { intervals: [2, 4], reason: "2小时和4小时会在4小时倍数时冲突" },
        { intervals: [3, 6], reason: "3小时和6小时会在6小时倍数时冲突" },
        { intervals: [1, 2, 3, 4, 6], reason: "1小时间隔与其他所有间隔都会冲突" }
      ],
      // 推荐的安全时间间隔配置
      recommendedIntervals: {
        "high-frequency": [6], // 高频更新：6小时一次
        "daily": ["0 0 * * *"], // 日更新：分散到不同时间
        "low-frequency": ["0 0 */2 * *", "0 0 * * 0"] // 低频更新：每2天或每周
      }
    }
  },
}

export const defaultSource = config.sources[0]

/**
 * @param {string} url
 * @returns {RssSource | undefined}
 */
export function findSourceByUrl(url) {
  return config.sources.find((source) => source.url === url)
}

/**
 * 获取源的最大条目数配置
 * @param {string} url - RSS源URL
 * @returns {number} 该源的最大条目数
 */
export function getMaxItemsForSource(url) {
  const source = findSourceByUrl(url)
  return source?.maxItemsPerFeed ?? config.maxItemsPerFeed
}

/**
 * 获取源的cron配置
 * @param {string} url - RSS源URL  
 * @returns {string} 该源的cron配置
 */
export function getCronConfigForSource(url) {
  const source = findSourceByUrl(url)
  return source?.cronConfig ?? config.defaultCronConfig
}

/**
 * 获取所有启用的源
 * @returns {RssSource[]} 启用的源列表
 */
export function getEnabledSources() {
  return config.sources.filter(source => source.enabled !== false)
}

/**
 * 按更新频率分组源
 * @returns {Object} 按cron配置分组的源
 */
export function getSourcesByCronConfig() {
  return getEnabledSources().reduce((acc, source) => {
    const cronConfig = getCronConfigForSource(source.url)
    if (!acc[cronConfig]) {
      acc[cronConfig] = []
    }
    acc[cronConfig].push(source)
    return acc
  }, {})
}

export function getSourcesByCategory() {
  return getEnabledSources().reduce((acc, source) => {
    if (!acc[source.category]) {
      acc[source.category] = []
    }
    acc[source.category].push(source)
    return acc
  }, {})
}

/**
 * 获取源的完整配置信息
 * @param {string} url - RSS源URL
 * @returns {Object} 包含所有配置的对象
 */
export function getSourceConfig(url) {
  const source = findSourceByUrl(url)
  if (!source) return null
  
  return {
    ...source,
    maxItemsPerFeed: getMaxItemsForSource(url),
    cronConfig: getCronConfigForSource(url),
    enabled: source.enabled !== false,
  }
}
