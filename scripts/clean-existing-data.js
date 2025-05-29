#!/usr/bin/env node

/**
 * 清理现有数据文件中的占位符图片和文本
 */

const fs = require('fs');
const path = require('path');

function cleanSummary(summary) {
  if (!summary || typeof summary !== 'string') return summary;
  
  let cleaned = summary;
  
  // Remove placeholder image references with example.com
  cleaned = cleaned.replace(/!\[.*?\]\(https?:\/\/example\.com\/.*?\)/g, '');
  
  // Remove Chinese placeholder text about images
  cleaned = cleaned.replace(/\*?\(?\s*请注意：这里只是占位符[^)]*?\)\*?/g, '');
  cleaned = cleaned.replace(/\*?\s*请注意：这里只是占位符[^*]*?\*/g, '');
  
  // Clean up multiple newlines and spaces
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  
  return cleaned;
}

function cleanImages(images) {
  if (!Array.isArray(images)) return [];
  
  return images.filter(img => 
    img.url && 
    !img.url.includes('example.com') && 
    !img.url.includes('placeholder') &&
    img.url.startsWith('http')
  );
}

function cleanDataFile(filePath) {
  try {
    console.log(`处理文件: ${filePath}`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    let changed = false;
    
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        // Clean summary
        if (item.summary) {
          const originalSummary = item.summary;
          item.summary = cleanSummary(item.summary);
          if (item.summary !== originalSummary) {
            changed = true;
            console.log(`  - 清理摘要: ${item.title?.substring(0, 50)}...`);
          }
        }
        
        // Clean images
        if (item.images) {
          const originalLength = item.images.length;
          item.images = cleanImages(item.images);
          if (item.images.length !== originalLength) {
            changed = true;
            console.log(`  - 清理图片: ${item.title?.substring(0, 50)}... (${originalLength} -> ${item.images.length})`);
          }
        }
      }
    }
    
    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`  ✅ 已更新: ${filePath}`);
    } else {
      console.log(`  ⏭️ 无需更新: ${filePath}`);
    }
    
  } catch (error) {
    console.error(`处理文件 ${filePath} 时出错:`, error.message);
  }
}

function main() {
  const dataDir = path.join(process.cwd(), 'data');
  
  if (!fs.existsSync(dataDir)) {
    console.log('data 目录不存在');
    return;
  }
  
  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  
  console.log(`找到 ${files.length} 个数据文件`);
  
  for (const file of files) {
    cleanDataFile(path.join(dataDir, file));
  }
  
  console.log('清理完成！');
}

if (require.main === module) {
  main();
}

module.exports = { cleanSummary, cleanImages }; 