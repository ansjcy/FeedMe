#!/usr/bin/env node

/**
 * Git pre-commit hook to automatically generate GitHub Actions workflows
 * when RSS configuration is modified
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkIfRssConfigChanged() {
  try {
    // Get list of staged files
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .split('\n')
      .filter(file => file.trim() !== '');
    
    // Check if RSS config file is among the staged files
    return stagedFiles.some(file => 
      file.includes('config/rss-config.js') || 
      file.includes('scripts/generate-workflows.js')
    );
  } catch (error) {
    console.warn('Warning: Could not check staged files:', error.message);
    return false;
  }
}

function generateWorkflows() {
  try {
    console.log('🔄 RSS配置文件已修改，正在重新生成工作流文件...');
    
    // Run the workflow generation script
    execSync('node scripts/generate-workflows.js', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    // Stage the generated workflow files
    execSync('git add .github/workflows/update-feeds-*.yml .github/workflows/deploy.yml', {
      stdio: 'inherit'
    });
    
    console.log('✅ 工作流文件已更新并添加到提交中');
    return true;
  } catch (error) {
    console.error('❌ 生成工作流文件失败:', error.message);
    return false;
  }
}

function main() {
  console.log('🔍 检查RSS配置文件是否已修改...');
  
  if (checkIfRssConfigChanged()) {
    if (!generateWorkflows()) {
      process.exit(1);
    }
  } else {
    console.log('📝 RSS配置文件未修改，跳过工作流生成');
  }
  
  console.log('✅ Pre-commit hook 执行完成');
}

if (require.main === module) {
  main();
}

module.exports = { checkIfRssConfigChanged, generateWorkflows }; 