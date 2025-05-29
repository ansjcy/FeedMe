#!/usr/bin/env node

/**
 * 测试绕过反爬虫措施的脚本
 * 专门针对 machinelearningmastery.com 等站点
 */

// 动态导入 node-fetch
async function getFetch() {
  if (!global.fetch) {
    const nodeFetch = await import('node-fetch');
    global.fetch = nodeFetch.default;
  }
  return global.fetch;
}

// 测试不同的请求策略
const testStrategies = [
  {
    name: '基础请求（无头部）',
    headers: {}
  },
  {
    name: '仅User-Agent',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  },
  {
    name: '仅Accept',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9'
    }
  },
  {
    name: '仅Accept-Language',
    headers: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  },
  {
    name: '最小化User-Agent',
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  },
  {
    name: '基础curl样式',
    headers: {
      'User-Agent': 'curl/7.68.0',
      'Accept': '*/*'
    }
  },
  {
    name: 'Python requests样式',
    headers: {
      'User-Agent': 'python-requests/2.25.1',
      'Accept-Encoding': 'gzip, deflate',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    }
  },
  {
    name: '简化浏览器',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html'
    }
  },
  {
    name: '老版本浏览器',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8'
    }
  },
  {
    name: '移动浏览器',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
    }
  }
];

async function testUrl(url, strategy) {
  const fetch = await getFetch();
  
  console.log(`\n🧪 测试策略: ${strategy.name}`);
  console.log(`🔗 URL: ${url}`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: strategy.headers,
      timeout: 15000,
      redirect: 'follow',
      compress: true
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`📊 状态码: ${response.status} ${response.statusText}`);
    console.log(`⏱️  响应时间: ${duration}ms`);
    console.log(`📁 内容类型: ${response.headers.get('content-type') || 'N/A'}`);
    console.log(`🔒 服务器: ${response.headers.get('server') || 'N/A'}`);
    console.log(`🛡️  Cloudflare: ${response.headers.get('cf-ray') ? '是' : '否'}`);
    
    if (response.status === 200) {
      try {
        const text = await response.text();
        const textLength = text.length;
        console.log(`📄 内容长度: ${textLength} 字符`);
        
        // 检查是否是实际内容而不是错误页面
        if (text.includes('<title>') && !text.includes('Access denied') && !text.includes('Forbidden')) {
          const titleMatch = text.match(/<title[^>]*>([^<]+)/i);
          const title = titleMatch ? titleMatch[1].trim() : 'N/A';
          console.log(`📰 页面标题: ${title}`);
          console.log(`✅ 成功获取内容!`);
          
          // 检查是否有文章内容的迹象
          if (text.includes('article') || text.includes('content') || text.includes('post')) {
            console.log(`📝 检测到文章内容结构`);
          }
          
          return { success: true, content: text, strategy: strategy.name };
        } else {
          console.log(`❌ 获取到错误页面或被拦截`);
          return { success: false, error: '错误页面', strategy: strategy.name };
        }
      } catch (parseError) {
        console.log(`❌ 解析内容时出错: ${parseError.message}`);
        return { success: false, error: '解析错误', strategy: strategy.name };
      }
    } else {
      console.log(`❌ HTTP错误: ${response.status}`);
      return { success: false, error: `HTTP ${response.status}`, strategy: strategy.name };
    }
    
  } catch (error) {
    console.log(`❌ 请求失败: ${error.message}`);
    return { success: false, error: error.message, strategy: strategy.name };
  }
}

async function main() {
  const testUrl1 = 'https://machinelearningmastery.com/a-gentle-introduction-to-learning-rate-schedulers/';
  
  console.log('🚀 开始测试反爬虫绕过策略');
  console.log('=' .repeat(60));
  
  const results = [];
  
  for (const strategy of testStrategies) {
    const result = await testUrl(testUrl1, strategy);
    results.push(result);
    
    // 在测试之间添加延迟以避免过快请求
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 测试结果汇总:');
  console.log('='.repeat(60));
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.strategy}: ${result.success ? '成功' : result.error}`);
  });
  
  const successfulStrategies = results.filter(r => r.success);
  if (successfulStrategies.length > 0) {
    console.log(`\n🎉 发现 ${successfulStrategies.length} 个有效策略!`);
    console.log('推荐使用: ' + successfulStrategies[0].strategy);
  } else {
    console.log('\n😞 没有策略成功绕过反爬虫措施');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testStrategies, testUrl }; 