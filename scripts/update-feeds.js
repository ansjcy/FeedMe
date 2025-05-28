// 命令行脚本，用于更新所有RSS源数据
// 供GitHub Actions直接调用

// 加载.env文件中的环境变量
const path = require('path');
const fs = require('fs');
const dotenvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const dotenvContent = fs.readFileSync(dotenvPath, 'utf8');
  dotenvContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.replace(/^"|"$/g, '');
      }
      process.env[key] = value;
    }
  });
  console.log('已从.env加载环境变量');
} else {
  // 尝试加载.env.local作为后备
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) {
    const dotenvContent = fs.readFileSync(localEnvPath, 'utf8');
    dotenvContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.replace(/^"|"$/g, '');
        }
        process.env[key] = value;
      }
    });
    console.log('已从.env.local加载环境变量');
  } else {
    console.warn('未找到.env或.env.local文件，请确保环境变量已设置');
  }
}

const Parser = require('rss-parser');
const GeminiManager = require('./gemini-manager');

// 从配置文件中导入RSS源配置
const { config } = require('../config/rss-config.js');

// RSS解析器配置
const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "content"],
      ["dc:creator", "creator"],
    ],
  },
});

// 创建 Gemini 管理器实例
const geminiManager = new GeminiManager();

// 确保数据目录存在
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), config.dataPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

// 获取源的文件路径
function getSourceFilePath(sourceUrl) {
  const dataDir = ensureDataDir();
  // 使用URL的Base64编码作为文件名，避免非法字符
  const sourceHash = Buffer.from(sourceUrl).toString('base64').replace(/[/+=]/g, '_');
  return path.join(dataDir, `${sourceHash}.json`);
}

// 保存源数据到文件
async function saveFeedData(sourceUrl, data) {
  const filePath = getSourceFilePath(sourceUrl);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`保存数据 ${sourceUrl} 到 ${filePath}`);
  } catch (error) {
    console.error(`保存数据 ${sourceUrl} 时出错:`, error);
    throw new Error(`保存源数据失败: ${error.message}`);
  }
}

// 从文件加载源数据
function loadFeedData(sourceUrl) {
  const filePath = getSourceFilePath(sourceUrl);

  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`加载数据 ${sourceUrl} 时出错:`, error);
    return null;
  }
}

// 辅助函数：延迟执行
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 生成摘要函数 - 使用新的 Gemini 管理器
async function generateSummary(title, content) {
  // 清理内容 - 移除HTML标签
  const cleanContent = content.replace(/<[^>]*>?/gm, "");

  // 准备提示词 (Gemini prefers a direct prompt style)
  const fullPrompt = `
请根据以下文章标题和内容，完成以下任务：
1.  将文章标题翻译成中文。如果标题已经是中文，则返回原始标题。
2.  生成一个简洁、准确的中文摘要。摘要应：
    a. 捕捉文章的主要观点和关键信息。
    b. 使用清晰、流畅的中文。
    c. 避免冗长的描述，确保摘要简洁明了。
    d. 使用markdown进行格式化，让摘要易于阅读。使用title，bullets或编号列表来组织信息。
    d. 长度尽量控制在1000字以内。
    e. 保持客观，不添加个人观点。
    f. 如果文章内容为空或不包含有效信息，请明确指出无法生成摘要，不要编造内容。

请以JSON格式返回结果，格式如下：
{
  "translated_title": "翻译后的标题",
  "summary": "文章的中文摘要"
}

文章标题：${title}

文章内容：
${cleanContent.slice(0, 50000)}
`;

  try {
    // 使用 Gemini 管理器发送请求
    const result = await geminiManager.generateContent(fullPrompt);
    
    const response = result.response;
    if (response && response.candidates && response.candidates.length > 0 && 
        response.candidates[0].content && response.candidates[0].content.parts && 
        response.candidates[0].content.parts.length > 0) {
      
      const safetyRatings = response.candidates[0].safetyRatings;
      if (safetyRatings && safetyRatings.some(rating => rating.probability !== 'NEGLIGIBLE' && rating.probability !== 'LOW')) {
          console.warn(`为标题 "${title}" 生成的内容可能因安全原因被阻止或修改。Safety Ratings:`, safetyRatings);
      }

      const rawApiResponse = response.candidates[0].content.parts[0].text?.trim();
      if (!rawApiResponse) {
        return { translatedTitle: title, summary: "无法生成摘要（内容为空）。" };
      }

      try {
        // Attempt to clean markdown code fences if present
        let cleanedResponse = rawApiResponse;
        if (cleanedResponse.startsWith("```json") && cleanedResponse.endsWith("```")) {
          cleanedResponse = cleanedResponse.substring(7, cleanedResponse.length - 3).trim();
        } else if (cleanedResponse.startsWith("```") && cleanedResponse.endsWith("```")) {
          // Fallback for cases where just ``` is used without 'json'
          cleanedResponse = cleanedResponse.substring(3, cleanedResponse.length - 3).trim();
        }

        const parsedResult = JSON.parse(cleanedResponse);
        // Ensure both fields exist and are strings.
        if (parsedResult && typeof parsedResult.translated_title === 'string' && typeof parsedResult.summary === 'string') {
          return {
            translatedTitle: parsedResult.translated_title,
            summary: parsedResult.summary
          };
        } else {
          console.warn(`为标题 "${title}" 生成的结果JSON格式不正确或缺少字段. Cleaned:`, cleanedResponse.substring(0,200), "Raw:", rawApiResponse.substring(0,200));
          return { translatedTitle: title, summary: "无法生成摘要（返回JSON格式错误）。" };
        }
      } catch (jsonError) {
        console.warn(`为标题 "${title}" 解析JSON响应时出错: ${jsonError.message}. Raw response:`, rawApiResponse.substring(0, 200));
        return { translatedTitle: title, summary: `无法生成摘要（JSON解析失败）。` };
      }
    } else if (response && response.promptFeedback && response.promptFeedback.blockReason) {
      console.warn(`为标题 "${title}" 生成摘要的请求被阻止: ${response.promptFeedback.blockReason}`);
      return { translatedTitle: title, summary: `无法生成摘要（请求被阻止: ${response.promptFeedback.blockReason}）。`};
    }
    return { translatedTitle: title, summary: "无法生成摘要（无有效响应）。" };
    
  } catch (error) {
    console.error(`为标题 "${title}" 生成摘要时发生错误:`, error.message);
    return { translatedTitle: title, summary: "无法生成摘要（API请求失败）。" };
  }
}

// 获取RSS源
async function fetchRssFeed(url) {
  try {
    // 直接解析RSS URL
    const feed = await parser.parseURL(url);

    // 处理items，确保所有对象都是可序列化的纯对象
    const serializedItems = feed.items.map(item => {
      // 创建新的纯对象
      const serializedItem = {
        title: item.title || "",
        link: item.link || "",
        pubDate: item.pubDate || "",
        isoDate: item.isoDate || "",
        content: item.content || "",
        contentSnippet: item.contentSnippet || "",
        creator: item.creator || "",
      };
      if (serializedItem.content) {
        serializedItem.encodedSnippet = serializedItem.content + "\n" + item["content:encodedSnippet"]
      } else {
        serializedItem.encodedSnippet = serializedItem.contentSnippet + "\n" + item["content:encodedSnippet"]
      }
      
      // 如果存在enclosure，以纯对象形式添加
      if (item.enclosure) {
        serializedItem.enclosure = {
          url: item.enclosure.url || "",
          type: item.enclosure.type || "",
        };
      }
      
      return serializedItem;
    });

    return {
      title: feed.title || "",
      description: feed.description || "",
      link: feed.link || "",
      items: serializedItems,
    };
  } catch (error) {
    console.error("获取RSS源时出错:", error);
    throw new Error(`获取RSS源失败: ${error.message}`);
  }
}

// 合并新旧数据，并找出需要生成摘要的新条目
function mergeFeedItems(oldItems = [], newItems = [], maxItems = config.maxItemsPerFeed) {
  // 创建一个Map来存储所有条目，使用链接作为键
  const itemsMap = new Map();

  // 添加旧条目到Map
  for (const item of oldItems) {
    if (item.link) {
      itemsMap.set(item.link, item);
    }
  }

  // 识别需要生成摘要的新条目
  const newItemsForSummary = [];

  // 添加新条目到Map，并标记需要生成摘要的条目
  for (const item of newItems) {
    if (item.link) {
      const existingItem = itemsMap.get(item.link);

      if (!existingItem) {
        // 这是一个新条目，需要生成摘要
        newItemsForSummary.push(item);
      }

      // 无论如何都更新Map，使用新条目（但保留旧摘要如果有的话）
      const serializedItem = {
        ...item,
        summary: existingItem?.summary || item.summary,
      };
      
      itemsMap.set(item.link, serializedItem);
    }
  }

  // 将Map转换回数组，保持原始RSS源的顺序
  // 使用newItems的顺序作为基准
  const mergedItems = newItems
    .filter(item => item.link && itemsMap.has(item.link))
    .map(item => item.link ? itemsMap.get(item.link) : item)
    .slice(0, maxItems); // 只保留指定数量的条目

  return { mergedItems, newItemsForSummary };
}

// 更新单个源
async function updateFeed(sourceUrl) {
  console.log(`更新源: ${sourceUrl}`);

  try {
    // 获取现有数据
    const existingData = loadFeedData(sourceUrl);

    // 获取新数据
    const newFeed = await fetchRssFeed(sourceUrl);

    // 合并数据，找出需要生成摘要的新条目
    const { mergedItems, newItemsForSummary } = mergeFeedItems(
      existingData?.items || [],
      newFeed.items,
      config.maxItemsPerFeed,
    );

    console.log(`发现 ${newItemsForSummary.length} 条新条目，来自 ${sourceUrl}`);

    // 为新条目生成摘要 (逐条处理)
    const itemsWithSummaries = [];
    for (const item of mergedItems) {
      let processedItem = { ...item }; // Start with a copy of the item

      // 如果是新条目且需要生成摘要 (并且还没有摘要)
      // If item is new and doesn't have a summary (implies translated_title might also be missing or needs update)
      if (newItemsForSummary.some((newItem) => newItem.link === item.link) && !processedItem.summary) {
        console.log(`为条目 "${processedItem.title}" 生成摘要和翻译标题...`);
        try {
          const generationResult = await generateSummary(processedItem.title, processedItem.encodedSnippet || processedItem.content || processedItem.contentSnippet || "");
          processedItem.summary = generationResult.summary;
          processedItem.translated_title = generationResult.translatedTitle; // Add translated title
          // Update the main title field with the translation
          if (generationResult.translatedTitle && generationResult.translatedTitle.trim() !== "") {
            processedItem.title = generationResult.translatedTitle + " (原标题: " + processedItem.title + ")";
          }
        } catch (err) {
          // This catch block is a safeguard for unexpected errors from generateSummary NOT returning the expected object.
          console.error(`在 updateFeed 中为条目 ${processedItem.title} 调用 generateSummary 时发生意外错误:`, err);
          processedItem.summary = "无法生成摘要（处理异常）。";
          // Provide a fallback for translated_title if an error occurs here
          processedItem.translated_title = processedItem.title;
        }
      }
      itemsWithSummaries.push(processedItem);
    }

    // 创建新的数据对象
    const updatedData = {
      sourceUrl,
      title: newFeed.title,
      description: newFeed.description,
      link: newFeed.link,
      items: itemsWithSummaries,
      lastUpdated: new Date().toISOString(),
    };

    // 保存到文件
    await saveFeedData(sourceUrl, updatedData);

    return updatedData;
  } catch (error) {
    console.error(`更新源 ${sourceUrl} 时出错:`, error);
    throw new Error(`更新源失败: ${error.message}`);
  }
}

// 更新所有源
async function updateAllFeeds() {
  console.log("开始更新所有RSS源");

  const results = {};

  for (const source of config.sources) {
    try {
      await updateFeed(source.url);
      results[source.url] = true;
    } catch (error) {
      console.error(`更新 ${source.url} 失败:`, error);
      results[source.url] = false;
    }
  }

  console.log("所有RSS源更新完成");
  return results;
}

// 主函数
async function main() {
  try {
    const startTime = Date.now();
    console.log("开始更新所有RSS源");
    
    await updateAllFeeds();
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`RSS数据更新成功，耗时 ${duration} 秒`);
    
    // 打印 Gemini API 使用统计
    geminiManager.printStats();
    
    process.exit(0);
  } catch (error) {
    console.error("RSS数据更新失败:", error);
    
    // 即使出错也打印统计信息
    geminiManager.printStats();
    
    process.exit(1);
  }
}

// 执行主函数
main(); 