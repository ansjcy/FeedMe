// RSS源接口
// name: 信息源名称
// url: RSS URL地址
// category: 分类名称

/**
 * @typedef {object} RssSource
 * @property {string} name - 信息源名称
 * @property {string} url - RSS URL地址
 * @property {string} category - 分类名称
 */

// 默认配置
export const config = {
  sources: [
    // {
    //   name: "Machine Learning Mastery",
    //   url: "https://machinelearningmastery.com/blog/feed/",
    //   category: "技术博客",
    // },
    // {
    //   name: "Science Daily - 人工智能",
    //   url: "https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml",
    //   category: "技术新闻",
    // },
    {
      name: "Slack blog",
      url: "https://slack.engineering/feed/",
      category: "技术博客",
    },
    // {
    //   name: "TechCrunch",
    //   url: "https://techcrunch.com/feed/",
    //   category: "技术新闻",
    // },
    // {
    //   name: "Netflix blog",
    //   url: "https://netflixtechblog.com/feed",
    //   category: "技术博客",
    // },
    // {
    //   name: "Github blog",
    //   url: "https://github.blog/feed/",
    //   category: "技术博客",
    // },
    // {
    //   name: "Airbnb blog",
    //   url: "https://medium.com/feed/airbnb-engineering",
    //   category: "技术博客",
    // },
    // {
    //   name: "Microsoft blog",
    //   url: "https://blogs.microsoft.com/feed/",
    //   category: "技术博客",
    // },
    // {
    //   name: "Facebook blog",
    //   url: "https://engineering.fb.com/feed/",
    //   category: "技术博客",
    // },
    // {
    //   name: "Google 新闻",
    //   url: "https://news.google.com/rss",
    //   category: "世界新闻",
    // },
    // {
    //   name: "macrumors",
    //   url: "https://feeds.macrumors.com/MacRumors-All",
    //   category: "科技新闻",
    // },
    // {
    //   name: "Github 近一周热门",
    //   url: "https://rsshub.rssforever.com/github/trending/weekly/any",
    //   category: "代码项目",
    // },
    // {
    //   name: "techcrunch",
    //   url: "https://techcrunch.com/feed",
    //   category: "技术新闻",
    // },
    // {
    //   name: "Hugging Face 每日论文",
    //   url: "https://rsshub.rssforever.com/huggingface/daily-papers",
    //   category: "科研论文",
    // },
    // {
    //   name: "Google 开发者博客",
    //   url: "https://rsshub.rssforever.com/google/developers/en",
    //   category: "技术博客",
    // },
    // {
    //   name: "Google 研究博客",
    //   url: "https://rsshub.rssforever.com/google/research",
    //   category: "技术博客",
    // },
  ],
  maxItemsPerFeed: 2,
  dataPath: "./data",
}

export const defaultSource = config.sources[0]

/**
 * @param {string} url
 * @returns {RssSource | undefined}
 */
export function findSourceByUrl(url) {
  return config.sources.find((source) => source.url === url)
}

export function getSourcesByCategory() {
  return config.sources.reduce((acc, source) => {
    if (!acc[source.category]) {
      acc[source.category] = []
    }
    acc[source.category].push(source)
    return acc
  }, {})
}
