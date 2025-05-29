#!/usr/bin/env node

/**
 * 根据RSS配置生成GitHub Actions工作流文件
 * 支持按不同的cron配置分组源，为每组生成单独的工作流
 */

const fs = require('fs');
const path = require('path');
const { getSourcesByCronConfig, config } = require('../config/rss-config.js');

// 确保workflows目录存在
function ensureWorkflowsDir() {
  const workflowsDir = path.join(process.cwd(), '.github/workflows');
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }
  return workflowsDir;
}

// 生成工作流名称
function generateWorkflowName(cronConfig, sourceGroup, groupIndex, totalGroups) {
  const cronParts = cronConfig.split(' ');
  const minute = cronParts[0];
  const hour = cronParts[1];
  const dayOfMonth = cronParts[2];
  const month = cronParts[3];
  const dayOfWeek = cronParts[4];

  let baseName = '';
  
  // 生成基础名称
  if (cronConfig.match(/0 \d+ \* \* \*/)) baseName = `daily`;
  else if (cronConfig.match(/0 \d+ \/\d+ \* \* \*/)) baseName = `every-${dayOfMonth.replace('*/', '')}-days`;
  else if (cronConfig.match(/0 \*\/\d+ \* \* \*/)) baseName = `every-${hour.replace('*/', '')}-hours`;
  else if (cronConfig === "0 */1 * * *") baseName = "hourly";
  else if (cronConfig === "0 */2 * * *") baseName = "every-2-hours";
  else if (cronConfig === "0 */3 * * *") baseName = "every-3-hours";
  else if (cronConfig === "0 */4 * * *") baseName = "every-4-hours";
  else if (cronConfig === "0 */6 * * *") baseName = "every-6-hours";
  else if (cronConfig === "0 */8 * * *") baseName = "every-8-hours";
  else if (cronConfig === "0 */12 * * *") baseName = "every-12-hours";
  else if (cronConfig === "0 0 * * *") baseName = "daily";
  else if (cronConfig === "0 0 */2 * *") baseName = "every-2-days";
  else if (cronConfig === "0 0 */3 * *") baseName = "every-3-days";
  else if (cronConfig === "0 0 * * 0") baseName = "weekly-sunday";
  else if (cronConfig === "0 0 * * 1") baseName = "weekly-monday";
  else baseName = `custom-${Buffer.from(cronConfig).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
  
  // 如果有多个组，添加组标识
  if (totalGroups > 1) {
    // 使用源的名称生成更有意义的标识
    const sourceNames = sourceGroup.map(s => s.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8));
    const groupIdentifier = sourceNames.join('-').substring(0, 20);
    return `${baseName}-${groupIdentifier}`;
  }
  
  return baseName;
}

/**
 * 使用源URL生成确定性但分布式的小时值
 * 这样可以避免所有源在同一时间更新，同时保持一致性
 */
function generateDistributedHour(sourceUrl, maxHour = 23) {
  // 使用简单哈希算法生成0-maxHour范围内的小时
  let hash = 0;
  for (let i = 0; i < sourceUrl.length; i++) {
    hash = ((hash << 5) - hash + sourceUrl.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % (maxHour + 1);
}

/**
 * 智能分布cron表达式，避免同时更新
 * 保持相同的频率，但分散更新时间
 */
function distributeCronTiming(cronConfig, sourceGroup, groupIndex) {
  // 检查是否启用分布式调度
  if (!config.workflowGeneration?.distributeCronTiming) {
    return cronConfig; // 不修改原始cron配置
  }
  
  const parts = cronConfig.split(' ');
  let [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  // 只处理固定时间的任务（小时为数字，不是表达式）
  if (hour === '0' || (hour.match(/^\d+$/) && parseInt(hour) < 6)) {
    const { min: minHour, max: maxHour } = config.workflowGeneration?.distributionHourRange || { min: 6, max: 22 };
    const hourRange = maxHour - minHour;
    
    // 使用第一个源的URL和组索引来生成唯一的分布时间
    const seedUrl = sourceGroup[0].url + `_group_${groupIndex}`;
    
    // 为避免夜间集中更新，在指定时间范围内分布
    const distributedHour = minHour + (generateDistributedHour(seedUrl, hourRange));
    hour = distributedHour.toString();
    
    // 同时随机化分钟，进一步分散负载
    const distributedMinute = generateDistributedHour(seedUrl + 'minute', 59);
    minute = distributedMinute.toString();
    
    console.log(`  📅 分布式调度: ${cronConfig} -> ${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek} (组 ${groupIndex + 1}: ${sourceGroup.map(s => s.name).join(', ')})`);
  }
  
  return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
}

// 生成工作流文件内容
function generateWorkflowContent(sourceGroup, cronConfig, workflowName, groupIndex) {
  const sourceUrls = sourceGroup.map(s => s.url);
  const sourceNames = sourceGroup.map(s => s.name).join(', ');
  
  // 使用组信息生成分布式时间
  const distributedCron = distributeCronTiming(cronConfig, sourceGroup, groupIndex);
  
  return `name: Update Feeds - ${workflowName}

on:
  schedule:
    - cron: '${distributedCron}'
  workflow_dispatch:
    inputs:
      force_update:
        description: 'Force update all sources'
        required: false
        default: 'false'
      test_mode:
        description: 'Test mode (use minimal items)'
        required: false
        default: 'false'

permissions:
  contents: write
  pages: write
  id-token: write
  actions: write

concurrency:
  group: "update-${workflowName}"
  cancel-in-progress: true

jobs:
  update-data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v3
        with:
          version: 8.4.0
      - run: pnpm install --frozen-lockfile
      
      # 只更新特定的源
      - name: Update RSS feeds for ${sourceNames}
        run: node scripts/update-feeds.js
        env:
          SELECTED_SOURCES: '${JSON.stringify(sourceUrls)}'
          TEST_MODE: \${{ github.event.inputs.test_mode || 'false' }}
          LLM_API_KEY: \${{ secrets.LLM_API_KEY }}
          LLM_API_BASE: \${{ secrets.LLM_API_BASE }}
          LLM_NAME: \${{ secrets.LLM_NAME }}
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
          GEMINI_API_KEY_2: \${{ secrets.GEMINI_API_KEY_2 }}
          GEMINI_API_KEY_3: \${{ secrets.GEMINI_API_KEY_3 }}
          GEMINI_API_KEY_4: \${{ secrets.GEMINI_API_KEY_4 }}
          GEMINI_API_KEY_5: \${{ secrets.GEMINI_API_KEY_5 }}
          GEMINI_API_KEY_6: \${{ secrets.GEMINI_API_KEY_6 }}
          GEMINI_API_KEY_7: \${{ secrets.GEMINI_API_KEY_7 }}
          GEMINI_API_KEY_8: \${{ secrets.GEMINI_API_KEY_8 }}
          GEMINI_MODEL_NAME: \${{ secrets.GEMINI_MODEL_NAME }}
      
      # 提交更新的数据
      - name: Commit updated data
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add ./data/
          if git diff --cached --quiet; then
            echo "No changes to commit"
          else
            git commit -m "Auto-update RSS feeds: ${sourceNames} [skip ci]"
            git push
          fi
      
      - uses: actions/upload-artifact@v4
        with:
          name: data-artifact-${workflowName}
          path: ./data

  # 只有主要工作流才负责部署
  trigger-deployment:
    needs: update-data
    runs-on: ubuntu-latest
    if: \${{ contains('${distributedCron}', '*/6') || contains('${distributedCron}', '*/3') || github.event_name == 'workflow_dispatch' }}
    steps:
      - name: Trigger main deployment workflow
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'deploy.yml',
              ref: 'main'
            });
`;
}

// 生成部署专用工作流
function generateDeploymentWorkflow() {
  return `name: Deploy to GitHub Pages

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['data/**', 'components/**', 'lib/**', 'app/**', 'config/**', 'public/**']

permissions:
  contents: read
  pages: write
  id-token: write
  actions: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v3
        with:
          version: 8.4.0
      - run: pnpm install --frozen-lockfile
      
      - name: Get repository name
        run: echo "REPOSITORY_NAME=\$(echo \${{ github.repository }} | cut -d'/' -f2)" >> \$GITHUB_ENV
      - name: Set environment variables for build
        run: |
          echo "NODE_ENV=production" >> \$GITHUB_ENV
          echo "GITHUB_ACTIONS=true" >> \$GITHUB_ENV
      - run: pnpm build
        env:
          REPOSITORY_NAME: \${{ env.REPOSITORY_NAME }}
          NODE_ENV: \${{ env.NODE_ENV }}
          GITHUB_ACTIONS: \${{ env.GITHUB_ACTIONS }}
      - name: Add .nojekyll to output directory  
        run: touch ./out/.nojekyll

      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./out
      - id: deployment
        uses: actions/deploy-pages@v4

  deploy-vercel:
    runs-on: ubuntu-latest
    if: \${{ vars.ENABLE_VERCEL_DEPLOYMENT == 'true' }}
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25.2.0
        with:
          vercel-token: \${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: \${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: \${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./
          vercel-args: '--prod --build-env VERCEL=1'
`;
}

// 主函数
function main() {
  console.log('正在生成GitHub Actions工作流文件...');
  
  const workflowsDir = ensureWorkflowsDir();
  const sourcesByCron = getSourcesByCronConfig();
  
  // 删除旧的自动生成的工作流文件
  const existingFiles = fs.readdirSync(workflowsDir);
  for (const file of existingFiles) {
    if (file.startsWith('update-feeds-') && file.endsWith('.yml')) {
      fs.unlinkSync(path.join(workflowsDir, file));
      console.log(`删除旧工作流文件: ${file}`);
    }
  }
  
  // 为了更好的负载均衡，将相同cron配置的源分散到不同的工作流中
  let workflowCount = 0;
  const maxSourcesPerWorkflow = config.workflowGeneration?.maxSourcesPerWorkflow || 3;
  
  for (const [cronConfig, sources] of Object.entries(sourcesByCron)) {
    console.log(`\n处理调度: ${cronConfig} (${sources.length} 个源)`);
    
    // 根据源的数量决定分组策略
    let sourceGroups = [];
    
    if (sources.length <= maxSourcesPerWorkflow) {
      // 如果源数量不多，保持在一个工作流中
      sourceGroups = [sources];
    } else {
      // 将源分散到多个小组中，每组最多 maxSourcesPerWorkflow 个源
      for (let i = 0; i < sources.length; i += maxSourcesPerWorkflow) {
        sourceGroups.push(sources.slice(i, i + maxSourcesPerWorkflow));
      }
    }
    
    console.log(`  📦 分为 ${sourceGroups.length} 个工作流组`);
    
    // 为每个组生成单独的工作流
    sourceGroups.forEach((sourceGroup, groupIndex) => {
      const workflowName = generateWorkflowName(cronConfig, sourceGroup, groupIndex, sourceGroups.length);
      const filename = `update-feeds-${workflowName}.yml`;
      const filePath = path.join(workflowsDir, filename);
      
      const content = generateWorkflowContent(sourceGroup, cronConfig, workflowName, groupIndex);
      fs.writeFileSync(filePath, content);
      
      console.log(`生成工作流: ${filename}`);
      console.log(`  - 调度: ${cronConfig}`);
      console.log(`  - 源数量: ${sourceGroup.length}`);
      console.log(`  - 源列表: ${sourceGroup.map(s => s.name).join(', ')}`);
      
      workflowCount++;
    });
  }
  
  // 生成部署工作流
  const deployFilePath = path.join(workflowsDir, 'deploy.yml');
  fs.writeFileSync(deployFilePath, generateDeploymentWorkflow());
  console.log('生成部署工作流: deploy.yml');
  
  console.log(`\n总共生成了 ${workflowCount} 个更新工作流和 1 个部署工作流`);
  
  // 生成使用说明
  console.log('\n使用说明:');
  console.log('1. 运行此脚本后，将生成多个GitHub Actions工作流文件');
  console.log('2. 每个工作流按不同的时间表更新不同的RSS源');
  console.log('3. 相同频率的源已分散到不同时间，避免负载集中');
  console.log('4. 可以在GitHub Actions页面手动触发任何工作流');
  console.log('5. 修改 config/rss-config.js 后重新运行此脚本以更新工作流');
}

if (require.main === module) {
  main();
}

module.exports = { generateWorkflowContent, generateDeploymentWorkflow }; 