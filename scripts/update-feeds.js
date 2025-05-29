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
const cheerio = require('cheerio');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

// Create an async fetch function that dynamically imports node-fetch
async function getFetch() {
  if (!global.fetch) {
    const nodeFetch = await import('node-fetch');
    global.fetch = nodeFetch.default;
  }
  return global.fetch;
}

// 从配置文件中导入RSS源配置
const { config, getMaxItemsForSource, getEnabledSources } = require('../config/rss-config.js');

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

// 获取文章完整内容 - 使用 Mozilla Readability 算法
async function fetchFullContent(articleUrl) {
  try {
    console.log(`正在获取完整内容: ${articleUrl}`);
    
    const fetch = await getFetch();
    
    // 基于测试结果，使用最小化的头部来绕过反爬虫保护
    // 发现：machinelearningmastery.com 的 Cloudflare 会阻止多个头部的组合，
    // 但允许无头部或单个头部的请求
    let headers = {};
    
    // 针对已知的反爬虫站点，使用极简策略
    const isAntiCrawlerSite = articleUrl.includes('machinelearningmastery.com') || 
                             articleUrl.includes('medium.com') ||
                             articleUrl.includes('towardsdatascience.com');
    
    if (isAntiCrawlerSite) {
      // 对于反爬虫站点，使用最小化的User-Agent
      headers = {
        'User-Agent': 'Mozilla/5.0'
      };
      console.log(`检测到反爬虫站点，使用最小化头部策略`);
    } else {
      // 对于普通站点，使用完整的浏览器头部
      headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      };
    }

    const response = await fetch(articleUrl, {
      timeout: 15000, // 15秒超时
      headers: headers,
      redirect: 'follow', // Follow redirects
      compress: true // Enable compression
    });

    if (!response.ok) {
      // Handle specific HTTP errors
      if (response.status === 403) {
        console.warn(`网站阻止了访问 ${articleUrl} (403 Forbidden) - 可能有反爬虫保护，将使用RSS内容`);
        return {
          textContent: '',
          images: [],
          title: '',
          excerpt: '',
          success: false,
          error: `网站阻止访问 (${response.status})`
        };
      } else if (response.status === 429) {
        console.warn(`请求过于频繁 ${articleUrl} (429 Too Many Requests) - 将使用RSS内容`);
        return {
          textContent: '',
          images: [],
          title: '',
          excerpt: '',
          success: false,
          error: `请求过于频繁 (${response.status})`
        };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }

    const html = await response.text();
    
    // 使用 JSDOM 创建 DOM 环境
    const dom = new JSDOM(html, { url: articleUrl });
    const document = dom.window.document;

    // 使用 Mozilla Readability 提取主要内容
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      throw new Error('Readability 无法解析文章内容');
    }

    // 提取纯文本内容
    const textContent = article.textContent.replace(/\s+/g, ' ').trim();

    // 从 HTML 内容中提取图片信息并保持位置
    const images = [];
    let contentWithImagePlaceholders = '';
    
    if (article.content) {
      const $ = cheerio.load(article.content);
      
      // 为每个图片创建占位符并记录位置信息
      $('img').each((i, img) => {
        const src = $(img).attr('src');
        const alt = $(img).attr('alt') || '';
        const title = $(img).attr('title') || '';
        
        if (src && !src.includes('data:image') && !src.includes('placeholder')) {
          // 处理相对URL
          let imageUrl = src;
          if (src.startsWith('//')) {
            imageUrl = 'https:' + src;
          } else if (src.startsWith('/')) {
            const urlObj = new URL(articleUrl);
            imageUrl = `${urlObj.protocol}//${urlObj.host}${src}`;
          } else if (!src.startsWith('http')) {
            imageUrl = new URL(src, articleUrl).href;
          }
          
          const imageInfo = {
            url: imageUrl,
            alt: alt,
            title: title,
            position: i + 1
          };
          
          images.push(imageInfo);
          
          // 替换图片为markdown格式，保持在内容中的位置
          const markdownImg = `\n\n![${alt || `图片 ${i + 1}`}](${imageUrl})\n${title ? `*${title}*` : ''}\n\n`;
          $(img).replaceWith(markdownImg);
        }
      });
      
      // 获取包含图片占位符的内容
      contentWithImagePlaceholders = $.text().replace(/\s+/g, ' ').trim();
    }

    // 如果有图片内容，使用包含图片的内容，否则使用纯文本
    const finalTextContent = contentWithImagePlaceholders || textContent;

    console.log(`Readability 成功提取内容: ${finalTextContent.length} 字符, ${images.length} 张图片`);

    return {
      textContent: finalTextContent.slice(0, 20000), // 限制长度避免过长
      images: images.slice(0, 10), // 最多保留10张图片
      title: article.title || '',
      excerpt: article.excerpt || '',
      success: true
    };

  } catch (error) {
    // More detailed error handling
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      console.warn(`获取完整内容超时 ${articleUrl}: 请求超时，将使用RSS内容`);
      return {
        textContent: '',
        images: [],
        title: '',
        excerpt: '',
        success: false,
        error: '请求超时'
      };
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.warn(`无法连接到 ${articleUrl}: 网络连接问题，将使用RSS内容`);
      return {
        textContent: '',
        images: [],
        title: '',
        excerpt: '',
        success: false,
        error: '网络连接问题'
      };
    } else {
      console.warn(`获取完整内容失败 ${articleUrl}: ${error.message}，将使用RSS内容`);
      return {
        textContent: '',
        images: [],
        title: '',
        excerpt: '',
        success: false,
        error: error.message
      };
    }
  }
}

// 从RSS内容中提取图片并保持位置
function extractImagesFromRssContent(content) {
  if (!content) return { images: [], contentWithImages: content };
  
  const images = [];
  const $ = cheerio.load(content);
  
  $('img').each((i, img) => {
    const src = $(img).attr('src');
    const alt = $(img).attr('alt') || '';
    const title = $(img).attr('title') || '';
    
    if (src && !src.includes('data:image') && !src.includes('placeholder')) {
      let imageUrl = src;
      if (src.startsWith('//')) {
        imageUrl = 'https:' + src;
      }
      
      const imageInfo = {
        url: imageUrl,
        alt: alt,
        title: title,
        position: i + 1
      };
      
      images.push(imageInfo);
      
      // 替换图片为markdown格式
      const markdownImg = `\n\n![${alt || `图片 ${i + 1}`}](${imageUrl})\n${title ? `*${title}*` : ''}\n\n`;
      $(img).replaceWith(markdownImg);
    }
  });
  
  // 返回包含markdown图片的内容
  const contentWithImages = $.text().replace(/\s+/g, ' ').trim();
  
  return {
    images: images.slice(0, 5), // 最多保留5张RSS图片
    contentWithImages: contentWithImages
  };
}

// 生成摘要函数 - 使用新的 Gemini 管理器
async function generateSummary(title, content, articleUrl) {
  // 清理内容 - 移除HTML标签
  const cleanContent = content.replace(/<[^>]*>?/gm, "");
  
  // 从RSS内容中提取图片并保持位置
  const rssResult = extractImagesFromRssContent(content);
  const rssImages = rssResult.images;
  const rssContentWithImages = rssResult.contentWithImages || cleanContent;
  
  // 尝试获取完整文章内容
  let fullContent = '';
  let fullContentImages = [];
  let contentSource = 'RSS';
  
  if (articleUrl) {
    console.log(`正在获取完整内容: ${articleUrl}`);
    
    // Check if this is a known problematic site that often blocks requests
    const isProblematicSite = articleUrl.includes('machinelearningmastery.com') || 
                             articleUrl.includes('medium.com') ||
                             articleUrl.includes('towardsdatascience.com');
    
    if (isProblematicSite) {
      console.log(`检测到可能阻止爬虫的站点: ${articleUrl}，将优先使用RSS内容`);
      // Still try to fetch, but with different expectations
    }
    
    const fullContentResult = await fetchFullContent(articleUrl);
    
    if (fullContentResult.success) {
      const webContentLength = fullContentResult.textContent.length;
      const rssContentLength = rssContentWithImages.length;
      
      console.log(`网页内容长度: ${webContentLength} 字符`);
      console.log(`RSS内容长度: ${rssContentLength} 字符`);
      
      // Use web content if it's longer than RSS content, or if RSS is very short
      if (webContentLength > rssContentLength) {
        fullContent = fullContentResult.textContent;
        fullContentImages = fullContentResult.images;
        contentSource = '完整文章';
        console.log(`使用完整文章内容 (${webContentLength} 字符 vs RSS ${rssContentLength} 字符)`);
      } else {
        fullContent = rssContentWithImages;
        console.log(`使用RSS内容 (${rssContentLength} 字符 vs 网页 ${webContentLength} 字符)`);
      }
    } else {
      const rssContentLength = rssContentWithImages.length;
      console.log(`获取完整内容失败: ${fullContentResult.error || '未知错误'}`);
      if (isProblematicSite && rssContentLength > 100) {
        console.log(`对于已知阻止爬虫的站点，RSS内容足够使用: ${rssContentLength} 字符`);
      }
      fullContent = rssContentWithImages;
    }
  } else {
    fullContent = rssContentWithImages;
  }
  
  // 合并图片信息，优先使用完整文章的图片
  const allImages = [...fullContentImages, ...rssImages];
  const uniqueImages = allImages.filter((img, index, self) => 
    index === self.findIndex(i => i.url === img.url)
  ).slice(0, 8); // 最多保留8张图片

  // 准备提示词 (不再需要单独的图片信息，因为图片已经在内容中)
  const fullPrompt = `
请根据以下文章标题和内容，完成以下任务：
1.  将文章标题翻译成中文。如果标题已经是中文，则返回原始标题。
2.  生成两种中文摘要：
    a. **详细摘要**：捕捉文章的主要观点和关键信息，使用markdown进行格式化，让摘要易于阅读。使用title，bullets或编号列表来组织信息。长度尽量控制在1000字以内。
    b. **简短摘要**：生成一个100词以内的简洁摘要，只包含最核心的信息点，使用简洁的中文表达。
    
两种摘要都应：
    - 使用清晰、流畅的中文
    - 避免冗长的描述，确保摘要简洁明了
    - 保持客观，不添加个人观点
    - **重要：只有当文章内容中包含有效的实际图片链接时，才在详细摘要中包含这些图片。如果图片链接是占位符（如 example.com）、无效链接或不存在，请完全省略这些图片，不要提及图片不可用或添加任何关于图片的说明。简短摘要中不要包含任何图片。**
    - 如果文章内容为空或不包含有效信息，请明确指出无法生成摘要，不要编造内容

请以JSON格式返回结果，格式如下：
{
  "translated_title": "翻译后的标题",
  "summary": "文章的详细中文摘要（只包含有效的图片，完全省略无效或占位符图片）",
  "short_summary": "100词以内的简短摘要（不包含图片）"
}

文章标题：${title}

内容来源：${contentSource}

文章内容：
${fullContent.slice(0, 15000)}
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
        // Filter out placeholder images from the images array
        const cleanedImages = uniqueImages.filter(img => 
          img.url && 
          !img.url.includes('example.com') && 
          !img.url.includes('placeholder') &&
          img.url.startsWith('http')
        );
        return { 
          translatedTitle: title, 
          summary: "无法生成摘要（内容为空）。",
          shortSummary: "",
          images: cleanedImages
        };
      }

      try {
        // Use the improved JSON parsing from GeminiManager
        const parsedResult = geminiManager.cleanAndParseJSON(rawApiResponse);
        
        // Ensure both fields exist and are strings.
        if (parsedResult && typeof parsedResult.translated_title === 'string' && typeof parsedResult.summary === 'string') {
          // Post-process the summary to clean up placeholder images and text
          let cleanedSummary = parsedResult.summary;
          
          // Remove any remaining placeholder image references
          cleanedSummary = cleanedSummary.replace(/!\[.*?\]\(https?:\/\/example\.com\/.*?\)/g, '');
          
          // Remove Chinese placeholder text about images
          cleanedSummary = cleanedSummary.replace(/\*?\(?\s*请注意：这里只是占位符[^)]*?\)\*?/g, '');
          cleanedSummary = cleanedSummary.replace(/\*?\s*请注意：这里只是占位符[^*]*?\*/g, '');
          
          // Clean up multiple newlines and spaces
          cleanedSummary = cleanedSummary.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
          
          // Process short_summary if it exists
          let cleanedShortSummary = "";
          if (typeof parsedResult.short_summary === 'string') {
            cleanedShortSummary = parsedResult.short_summary
              .replace(/!\[.*?\]\(https?:\/\/.*?\)/g, '') // Remove any image references
              .replace(/\n\s*\n\s*\n/g, '\n\n')
              .trim();
          }
          
          // Filter out placeholder images from the images array
          const cleanedImages = uniqueImages.filter(img => 
            img.url && 
            !img.url.includes('example.com') && 
            !img.url.includes('placeholder') &&
            img.url.startsWith('http')
          );
          
          return {
            translatedTitle: parsedResult.translated_title,
            summary: cleanedSummary,
            shortSummary: cleanedShortSummary,
            images: cleanedImages,
            contentSource: contentSource
          };
        } else {
          console.warn(`为标题 "${title}" 生成的结果JSON格式不正确或缺少字段. Raw:`, rawApiResponse.substring(0,200));
          // Filter out placeholder images from the images array
          const cleanedImages = uniqueImages.filter(img => 
            img.url && 
            !img.url.includes('example.com') && 
            !img.url.includes('placeholder') &&
            img.url.startsWith('http')
          );
          return { 
            translatedTitle: title, 
            summary: "无法生成摘要（返回JSON格式错误）。",
            shortSummary: "",
            images: cleanedImages
          };
        }
      } catch (jsonError) {
        console.warn(`为标题 "${title}" 解析JSON响应时出错: ${jsonError.message}. Raw response:`, rawApiResponse.substring(0, 200));
        
        // Fallback: manually extract translated_title and summary from the response
        try {
          let extractedTitle = title; // fallback to original title
          let extractedSummary = "无法生成摘要（JSON解析失败）。";
          let extractedShortSummary = "";
          
          // Try to extract translated_title
          const titleMatch = rawApiResponse.match(/"translated_title"\s*:\s*"([^"]+)"/);
          if (titleMatch && titleMatch[1]) {
            extractedTitle = titleMatch[1];
          }
          
          // Try to extract summary - handle multiline content
          const summaryMatch = rawApiResponse.match(/"summary"\s*:\s*"([\s\S]*?)"\s*[,}]/);
          if (summaryMatch && summaryMatch[1]) {
            // Clean up the extracted summary by unescaping quotes and newlines
            extractedSummary = summaryMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\\\/g, '\\')
              .trim();
          } else {
            // Alternative pattern - try to find content between "summary": and the next field or end
            const altSummaryMatch = rawApiResponse.match(/"summary"\s*:\s*"([\s\S]*?)$/);
            if (altSummaryMatch && altSummaryMatch[1]) {
              extractedSummary = altSummaryMatch[1]
                .replace(/["\\}]*$/, '') // Remove trailing quotes, backslashes, and braces
                .replace(/\\"/g, '"')
                .replace(/\\n/g, '\n')
                .replace(/\\\\/g, '\\')
                .trim();
            }
          }
          
          // Try to extract short_summary
          const shortSummaryMatch = rawApiResponse.match(/"short_summary"\s*:\s*"([^"]+)"/);
          if (shortSummaryMatch && shortSummaryMatch[1]) {
            extractedShortSummary = shortSummaryMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\\\/g, '\\')
              .trim();
          }
          
          console.log(`手动提取成功 - 标题: "${extractedTitle}", 摘要长度: ${extractedSummary.length}, 简短摘要长度: ${extractedShortSummary.length}`);
          
          // Apply the same post-processing to extracted summary
          let cleanedExtractedSummary = extractedSummary;
          
          // Remove any remaining placeholder image references
          cleanedExtractedSummary = cleanedExtractedSummary.replace(/!\[.*?\]\(https?:\/\/example\.com\/.*?\)/g, '');
          
          // Remove Chinese placeholder text about images
          cleanedExtractedSummary = cleanedExtractedSummary.replace(/\*?\(?\s*请注意：这里只是占位符[^)]*?\)\*?/g, '');
          cleanedExtractedSummary = cleanedExtractedSummary.replace(/\*?\s*请注意：这里只是占位符[^*]*?\*/g, '');
          
          // Clean up multiple newlines and spaces
          cleanedExtractedSummary = cleanedExtractedSummary.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
          
          // Clean the short summary (remove any image references)
          let cleanedExtractedShortSummary = extractedShortSummary
            .replace(/!\[.*?\]\(https?:\/\/.*?\)/g, '')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
          
          // Filter out placeholder images from the images array
          const cleanedImages = uniqueImages.filter(img => 
            img.url && 
            !img.url.includes('example.com') && 
            !img.url.includes('placeholder') &&
            img.url.startsWith('http')
          );
          
          return {
            translatedTitle: extractedTitle,
            summary: cleanedExtractedSummary,
            shortSummary: cleanedExtractedShortSummary,
            images: cleanedImages,
            contentSource: contentSource
          };
          
        } catch (extractError) {
          console.warn(`手动提取也失败: ${extractError.message}`);
          // Filter out placeholder images from the images array
          const cleanedImages = uniqueImages.filter(img => 
            img.url && 
            !img.url.includes('example.com') && 
            !img.url.includes('placeholder') &&
            img.url.startsWith('http')
          );
          return { 
            translatedTitle: title, 
            summary: `无法生成摘要（JSON解析和手动提取都失败）。`,
            shortSummary: "",
            images: cleanedImages
          };
        }
      }
    } else if (response && response.promptFeedback && response.promptFeedback.blockReason) {
      console.warn(`为标题 "${title}" 生成摘要的请求被阻止: ${response.promptFeedback.blockReason}`);
      // Filter out placeholder images from the images array
      const cleanedImages = uniqueImages.filter(img => 
        img.url && 
        !img.url.includes('example.com') && 
        !img.url.includes('placeholder') &&
        img.url.startsWith('http')
      );
      return { 
        translatedTitle: title, 
        summary: `无法生成摘要（请求被阻止: ${response.promptFeedback.blockReason}）。`,
        shortSummary: "",
        images: cleanedImages
      };
    }
    // Filter out placeholder images from the images array
    const cleanedImages = uniqueImages.filter(img => 
      img.url && 
      !img.url.includes('example.com') && 
      !img.url.includes('placeholder') &&
      img.url.startsWith('http')
    );
    return { 
      translatedTitle: title, 
      summary: "无法生成摘要（无有效响应）。",
      shortSummary: "",
      images: cleanedImages
    };
    
  } catch (error) {
    console.error(`为标题 "${title}" 生成摘要时发生错误:`, error.message);
    // Filter out placeholder images from the images array
    const cleanedImages = uniqueImages.filter(img => 
      img.url && 
      !img.url.includes('example.com') && 
      !img.url.includes('placeholder') &&
      img.url.startsWith('http')
    );
    return { 
      translatedTitle: title, 
      summary: "无法生成摘要（API请求失败）。",
      shortSummary: "",
      images: cleanedImages
    };
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

// 获取是否为推送触发（而非定时触发）
const isPushTrigger = process.env.GITHUB_EVENT_NAME === 'push';
const isTestMode = process.env.TEST_MODE === 'true';

console.log(`触发方式: ${isPushTrigger ? '推送触发' : '定时触发'}`);
if (isPushTrigger || isTestMode) {
  console.log('🧪 测试模式：使用最小条目数进行快速更新');
}

// 动态调整每个源的最大条目数
function getEffectiveMaxItems(url) {
  const configuredMax = getMaxItemsForSource(url);
  
  // 如果是推送触发或测试模式，使用最小条目数
  if (isPushTrigger || isTestMode) {
    return 1; // 测试时只获取1条
  }
  
  return configuredMax;
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
        itemsMap.set(item.link, item);
      } else {
        // 这是一个已存在的条目，保留旧摘要和相关数据，但更新其他可能变化的字段
        const mergedItem = {
          ...item, // 使用新的RSS数据作为基础
          // 保留已有的AI生成的字段
          summary: existingItem.summary,
          shortSummary: existingItem.shortSummary,
          translated_title: existingItem.translated_title,
          images: existingItem.images,
          contentSource: existingItem.contentSource,
        };
        
        // 如果旧条目有翻译标题，保持标题格式
        if (existingItem.translated_title && existingItem.title.includes('(原标题:')) {
          mergedItem.title = existingItem.title;
        } else if (existingItem.translated_title) {
          // If we have a translated title but current title doesn't have the prefix,
          // apply the same logic as in updateFeed
          if (existingItem.translated_title !== item.title) {
            mergedItem.title = existingItem.translated_title + " (原标题: " + item.title + ")";
          } else {
            mergedItem.title = existingItem.translated_title;
          }
        }
        
        itemsMap.set(item.link, mergedItem);
      }
    }
  }

  // 将Map转换回数组，按发布日期排序（最新的在前）
  const allItems = Array.from(itemsMap.values());
  
  // 按日期排序 - 使用 isoDate 或 pubDate，最新的在前
  allItems.sort((a, b) => {
    const dateA = new Date(a.isoDate || a.pubDate || '1970-01-01');
    const dateB = new Date(b.isoDate || b.pubDate || '1970-01-01');
    return dateB.getTime() - dateA.getTime(); // 降序排序（最新的在前）
  });
  
  // 只保留指定数量的条目
  const mergedItems = allItems.slice(0, maxItems);

  return { mergedItems, newItemsForSummary };
}

// 优化存储的数据结构，只保留必要的字段
function optimizeItemForStorage(item) {
  // 保留前端显示必需的字段
  const optimizedItem = {
    title: item.title || "",
    link: item.link || "",
    pubDate: item.pubDate || "",
    isoDate: item.isoDate || "",
    creator: item.creator || "",
    summary: item.summary || "",
    shortSummary: item.shortSummary || "",
    translated_title: item.translated_title || "",
    images: item.images || [],
    contentSource: item.contentSource || "RSS",
    // 保留原文内容字段供前端显示
    content: item.content || "",
  };

  // 如果存在enclosure，保留它
  if (item.enclosure) {
    optimizedItem.enclosure = {
      url: item.enclosure.url || "",
      type: item.enclosure.type || "",
    };
  }
  
  // 移除不必要的字段：encodedSnippet等
  // (这些字段不会被添加到optimizedItem中，从而实现优化)
  
  return optimizedItem;
}

// 更新单个源
async function updateFeed(sourceUrl) {
  console.log(`更新源: ${sourceUrl}`);

  try {
    // 获取现有数据
    const existingData = loadFeedData(sourceUrl);

    // 获取新数据
    const newFeed = await fetchRssFeed(sourceUrl);

    // 获取该源的最大条目数配置
    const maxItems = getEffectiveMaxItems(sourceUrl);
    
    // 合并数据，找出需要生成摘要的新条目
    const { mergedItems, newItemsForSummary } = mergeFeedItems(
      existingData?.items || [],
      newFeed.items,
      maxItems, // 使用该源特定的配置
    );

    // 计算最终需要处理的新条目（在maxItems限制后）
    const finalNewItems = mergedItems.filter(item => 
      newItemsForSummary.some(newItem => newItem.link === item.link)
    );
    
    const totalItems = mergedItems.length;
    const newItems = finalNewItems.length;
    const existingItems = totalItems - newItems;
    
    console.log(`发现 ${totalItems} 条总条目，其中 ${newItems} 条新条目需要生成摘要，${existingItems} 条已存在条目将跳过处理，来自 ${sourceUrl} (最大条目数: ${maxItems})`);

    // 为新条目生成摘要 (逐条处理)
    const itemsWithSummaries = [];
    for (const item of mergedItems) {
      let processedItem = { ...item }; // Start with a copy of the item

      // 只为新条目生成摘要
      if (newItemsForSummary.some((newItem) => newItem.link === item.link)) {
        console.log(`为新条目 "${processedItem.title}" 生成摘要和翻译标题...`);
        try {
          const generationResult = await generateSummary(processedItem.title, processedItem.encodedSnippet || processedItem.content || processedItem.contentSnippet || "", processedItem.link);
          processedItem.summary = generationResult.summary;
          processedItem.shortSummary = generationResult.shortSummary;
          processedItem.translated_title = generationResult.translatedTitle; // Add translated title
          // Update the main title field with the translation only if it's different from the original
          if (generationResult.translatedTitle && generationResult.translatedTitle.trim() !== "" && generationResult.translatedTitle !== processedItem.title) {
            processedItem.title = generationResult.translatedTitle + " (原标题: " + processedItem.title + ")";
          } else if (generationResult.translatedTitle && generationResult.translatedTitle.trim() !== "") {
            // If the translated title is the same as original, just use the translated title
            processedItem.title = generationResult.translatedTitle;
          }
          // Store images and content source information
          if (generationResult.images && generationResult.images.length > 0) {
            processedItem.images = generationResult.images;
          }
          if (generationResult.contentSource) {
            processedItem.contentSource = generationResult.contentSource;
          }
          
          // 添加延迟以避免过快请求
          await sleep(2000); // 2秒延迟
        } catch (err) {
          // This catch block is a safeguard for unexpected errors from generateSummary NOT returning the expected object.
          console.error(`在 updateFeed 中为条目 ${processedItem.title} 调用 generateSummary 时发生意外错误:`, err);
          processedItem.summary = "无法生成摘要（处理异常）。";
          processedItem.shortSummary = "";
          // Provide a fallback for translated_title if an error occurs here
          processedItem.translated_title = processedItem.title;
        }
      } else {
        // 这是已存在的条目，直接使用（已在mergeFeedItems中处理）
        console.log(`跳过已存在条目 "${processedItem.title}"`);
      }
      itemsWithSummaries.push(processedItem);
    }

    // 创建新的数据对象，优化存储结构
    const optimizedItems = itemsWithSummaries.map(optimizeItemForStorage);
    
    const updatedData = {
      sourceUrl,
      title: newFeed.title,
      description: newFeed.description,
      link: newFeed.link,
      items: optimizedItems,
      lastUpdated: new Date().toISOString()
    };

    // 保存到文件
    await saveFeedData(sourceUrl, updatedData);

    // 返回包含统计信息的对象（用于日志，但不保存到文件）
    return {
      ...updatedData,
      processingStats: {
        totalItems: totalItems,
        newItems: newItems,
        existingItems: existingItems,
        lastProcessed: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error(`更新源 ${sourceUrl} 时出错:`, error);
    throw new Error(`更新源失败: ${error.message}`);
  }
}

// 更新所有源或指定源
async function updateAllFeeds() {
  // 检查是否有指定要更新的源
  const selectedSourcesEnv = process.env.SELECTED_SOURCES;
  let sourcesToUpdate = getEnabledSources();
  
  if (selectedSourcesEnv) {
    try {
      const selectedUrls = JSON.parse(selectedSourcesEnv);
      sourcesToUpdate = config.sources.filter(source => 
        selectedUrls.includes(source.url) && source.enabled !== false
      );
      console.log(`仅更新指定的 ${sourcesToUpdate.length} 个源: ${sourcesToUpdate.map(s => s.name).join(', ')}`);
    } catch (error) {
      console.error('解析 SELECTED_SOURCES 环境变量失败，将更新所有源:', error);
    }
  } else {
    console.log(`开始更新所有 ${sourcesToUpdate.length} 个启用的RSS源`);
  }

  const results = {};
  let totalProcessed = 0;
  let totalNewItems = 0;
  let totalExistingItems = 0;

  for (const source of sourcesToUpdate) {
    try {
      const result = await updateFeed(source.url);
      results[source.url] = true;
      
      // 累计统计
      if (result.processingStats) {
        totalProcessed += result.processingStats.totalItems;
        totalNewItems += result.processingStats.newItems;
        totalExistingItems += result.processingStats.existingItems;
      }
    } catch (error) {
      console.error(`更新 ${source.url} 失败:`, error);
      results[source.url] = false;
    }
  }

  console.log("RSS源更新完成");
  console.log(`\n=== 处理统计 ===`);
  console.log(`总处理条目: ${totalProcessed}`);
  console.log(`新条目（需要API调用）: ${totalNewItems}`);
  console.log(`已存在条目（跳过API调用）: ${totalExistingItems}`);
  if (totalProcessed > 0) {
    const savingsPercent = ((totalExistingItems / totalProcessed) * 100).toFixed(1);
    console.log(`API调用节省: ${savingsPercent}%`);
  }
  console.log(`===============\n`);
  
  return results;
}

// 主函数
async function main() {
  try {
    const startTime = Date.now();
    
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