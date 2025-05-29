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
 * 检测并优化调度冲突
 * 考虑每个工作流的运行时间，避免重叠
 */
function optimizeScheduleCollisions(sourcesByCron, config) {
  const optimization = config.workflowGeneration?.optimization;
  if (!optimization) return sourcesByCron;
  
  const jobDuration = optimization.estimatedJobDurationMinutes || 40;
  const disallowedCombinations = optimization.disallowedIntervalCombinations || [];
  
  // 提取当前使用的间隔
  const usedIntervals = new Set();
  Object.keys(sourcesByCron).forEach(cronConfig => {
    const match = cronConfig.match(/^\d+ \*\/(\d+) \* \* \*$/);
    if (match) {
      usedIntervals.add(parseInt(match[1]));
    }
  });
  
  // 检查禁用的组合
  for (const combination of disallowedCombinations) {
    const conflictingIntervals = combination.intervals.filter(interval => usedIntervals.has(interval));
    if (conflictingIntervals.length > 1) {
      console.log(`⚠️  检测到冲突的时间间隔: ${conflictingIntervals.join(', ')} 小时`);
      console.log(`   原因: ${combination.reason}`);
      console.log(`   建议: 使用推荐的安全间隔配置`);
      
      // 自动优化：将冲突的间隔合并为更安全的配置
      const optimizedSources = optimizeConflictingIntervals(sourcesByCron, conflictingIntervals);
      return optimizedSources;
    }
  }
  
  return sourcesByCron;
}

/**
 * 优化冲突的间隔配置
 */
function optimizeConflictingIntervals(sourcesByCron, conflictingIntervals) {
  const optimized = { ...sourcesByCron };
  
  // 找到所有冲突的源
  const conflictingSources = [];
  const conflictingCrons = [];
  
  for (const [cronConfig, sources] of Object.entries(sourcesByCron)) {
    const match = cronConfig.match(/^\d+ \*\/(\d+) \* \* \*$/);
    if (match && conflictingIntervals.includes(parseInt(match[1]))) {
      conflictingSources.push(...sources);
      conflictingCrons.push(cronConfig);
      delete optimized[cronConfig];
    }
  }
  
  if (conflictingSources.length > 0) {
    // 将所有冲突的源合并到6小时间隔（更安全的选择）
    const safeCron = "0 */6 * * *";
    console.log(`🔧 自动优化: 将 ${conflictingCrons.join(', ')} 合并为 ${safeCron}`);
    console.log(`   涉及源: ${conflictingSources.map(s => s.name).join(', ')}`);
    
    if (!optimized[safeCron]) {
      optimized[safeCron] = [];
    }
    optimized[safeCron].push(...conflictingSources);
  }
  
  return optimized;
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
  const optimization = config.workflowGeneration?.optimization;
  const jobDuration = optimization?.estimatedJobDurationMinutes || 25; // 更新为25分钟
  const bufferTime = 15; // 增加缓冲时间到15分钟，为未来扩展留更多空间
  const minSpacing = jobDuration + bufferTime; // 最小间隔40分钟（25+15）
  
  // 处理固定时间的任务（小时为数字，不是表达式）
  if (hour === '0' || (hour.match(/^\d+$/) && parseInt(hour) < 6)) {
    const { min: minHour, max: maxHour } = config.workflowGeneration?.distributionHourRange || { min: 6, max: 22 };
    
    // 为了避免与6小时间隔冲突，避开6的倍数小时 (6, 12, 18)
    const avoidHours = [6, 12, 18];
    const availableHours = [];
    for (let h = minHour; h <= maxHour; h++) {
      if (!avoidHours.includes(h)) {
        availableHours.push(h);
      }
    }
    
    // 使用第一个源的URL和组索引来生成唯一的分布时间
    const seedUrl = sourceGroup[0].url + `_group_${groupIndex}`;
    
    // 区分每日和多日任务的时间分配
    if (dayOfMonth.includes('*/')) {
      // 多日任务 (如每2天) - 避开与每日任务冲突的时间段
      const multiDaySlots = [
        { hour: 4, minute: 5 },    // 4:05-4:45 (早晨安全时段)
        { hour: 5, minute: 5 },    // 5:05-5:45 (早晨时段)
        { hour: 13, minute: 5 },   // 13:05-13:45 (下午时段，避开12:05冲突)
        { hour: 16, minute: 5 },   // 16:05-16:45 (下午时段)
        { hour: 17, minute: 5 },   // 17:05-17:45 (傍晚时段)
        { hour: 19, minute: 5 },   // 19:05-19:45 (晚间时段)
        { hour: 20, minute: 5 },   // 20:05-20:45 (晚间时段)
        { hour: 21, minute: 5 }    // 21:05-21:45 (晚间时段)
      ];
      
      if (groupIndex < multiDaySlots.length) {
        hour = multiDaySlots[groupIndex].hour.toString();
        minute = multiDaySlots[groupIndex].minute.toString();
      } else {
        hour = "4";
        minute = (15 + groupIndex * 20).toString();
      }
    } else {
      // 每日任务或每周任务
      const timeSlots = [
        { hour: 8, minute: 5 },    // 8:05-8:45  (40分钟窗口)
        { hour: 9, minute: 5 },    // 9:05-9:45  (60分钟间隔)
        { hour: 10, minute: 5 },   // 10:05-10:45 (60分钟间隔)
        { hour: 11, minute: 5 },   // 11:05-11:45 (60分钟间隔)
        { hour: 14, minute: 5 },   // 14:05-14:45 (跳过午餐时间)
        { hour: 15, minute: 5 },   // 15:05-15:45 (60分钟间隔)
        { hour: 22, minute: 5 },   // 22:05-22:45 (晚间时段)
        { hour: 23, minute: 5 }    // 23:05-23:45 (深夜时段)
      ];
      
      // 为每周任务分配不同的时间段
      if (dayOfWeek !== '*') {
        // 每周任务使用完全安全的时间段，避开所有6小时间隔
        const weeklySlots = [
          { hour: 4, minute: 45 },  // 4:45-5:25 (早晨安全时段)
          { hour: 12, minute: 45 }, // 12:45-13:25 (中午时段)
          { hour: 23, minute: 5 }   // 23:05-23:45 (深夜时段，安全)
        ];
        
        if (groupIndex < weeklySlots.length) {
          hour = weeklySlots[groupIndex].hour.toString();
          minute = weeklySlots[groupIndex].minute.toString();
        } else {
          hour = "4";
          minute = (5 + groupIndex * 60).toString(); // 间隔60分钟为未来扩展
        }
      } else if (groupIndex < timeSlots.length) {
        hour = timeSlots[groupIndex].hour.toString();
        minute = timeSlots[groupIndex].minute.toString();
      } else {
        // 如果组数超过预定义时间段，使用算法分布
        const selectedHour = availableHours[generateDistributedHour(seedUrl, availableHours.length - 1)];
        hour = selectedHour.toString();
        minute = (generateDistributedHour(seedUrl + 'minute', 59)).toString();
      }
    }
    
    console.log(`  📅 分布式调度 (避开6小时冲突): ${cronConfig} -> ${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek} (组 ${groupIndex + 1}: ${sourceGroup.map(s => s.name).join(', ')})`);
  }
  
  // 处理间隔式时间的任务（如 */6, */12）- 使用组索引来分散时间
  else if (hour.match(/^\*\/\d+$/)) {
    const seedUrl = sourceGroup[0].url + `_group_${groupIndex}`;
    const interval = parseInt(hour.replace('*/', ''));
    
    // 对于间隔任务，我们需要在一个小时内分散所有工作流
    // 考虑40分钟运行时间+10分钟缓冲，每个工作流需要50分钟窗口
    // 在60分钟内最多只能运行1个工作流，所以需要错开小时
    let baseMinute = 0;
    let hourOffset = 0;
    
    switch(interval) {
      case 6: 
        // 6小时间隔：使用不同的开始小时来错开
        // 组0: 0:05, 6:05, 12:05, 18:05
        // 组1: 1:05, 7:05, 13:05, 19:05  
        // 组2: 2:05, 8:05, 14:05, 20:05
        // 组3: 3:05, 9:05, 15:05, 21:05
        hourOffset = groupIndex;
        baseMinute = 5;
        break;
      case 8: 
        // 8小时间隔：类似处理
        hourOffset = groupIndex;
        baseMinute = 15;
        break;
      case 12: 
        // 12小时间隔：可以在同一小时内分散
        hourOffset = 0;
        baseMinute = 30 + (groupIndex * 15);
        if (baseMinute >= 60) {
          hourOffset = Math.floor(baseMinute / 60);
          baseMinute = baseMinute % 60;
        }
        break;
      default: 
        hourOffset = groupIndex;
        baseMinute = 10;
        break;
    }
    
    minute = baseMinute.toString();
    
    // 对于有小时偏移的情况，我们需要修改cron表达式
    if (hourOffset > 0 && interval <= 6) {
      // 创建一个新的cron表达式，在每个间隔的基础上加上偏移
      const newHourExpr = `${hourOffset},${hourOffset + interval},${hourOffset + interval * 2},${hourOffset + interval * 3}`;
      // 但这会超出24小时，所以我们需要使用模运算
      const hours = [];
      for (let h = hourOffset; h < 24; h += interval) {
        hours.push(h);
      }
      hour = hours.join(',');
    }
    
    console.log(`  📅 分布式调度 (间隔): ${cronConfig} -> ${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek} (组 ${groupIndex + 1}, 小时偏移 ${hourOffset}: ${sourceGroup.map(s => s.name).join(', ')})`);
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

/**
 * 验证所有生成的调度是否存在冲突
 * 读取实际生成的工作流文件来检查真实的调度时间
 */
function verifyNoCollisions(sourcesByCron, config) {
  const optimization = config.workflowGeneration?.optimization;
  const jobDuration = optimization?.estimatedJobDurationMinutes || 40;
  
  console.log('\n🔍 验证调度冲突...');
  
  // 读取实际生成的工作流文件
  const workflowsDir = path.join(process.cwd(), '.github/workflows');
  const schedules = [];
  let hasCollisions = false;
  
  try {
    const files = fs.readdirSync(workflowsDir).filter(f => f.startsWith('update-feeds-') && f.endsWith('.yml'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      const cronMatch = content.match(/cron:\s*'([^']+)'/);
      
      if (cronMatch) {
        const cronExpr = cronMatch[1];
        const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpr.split(' ');
        
        if (hour.match(/^\*\/\d+$/)) {
          // 间隔式调度 (如 */6)
          const interval = parseInt(hour.replace('*/', ''));
          const startMinute = parseInt(minute);
          
          // 生成24小时内的所有运行时间
          for (let h = 0; h < 24; h += interval) {
            schedules.push({
              type: `every-${interval}h`,
              file: file,
              startTime: h * 60 + startMinute,
              endTime: h * 60 + startMinute + jobDuration,
              cronExpr
            });
          }
        } else {
          // 固定时间调度
          const startHour = parseInt(hour);
          const startMinute = parseInt(minute);
          const startTime = startHour * 60 + startMinute;
          
          schedules.push({
            type: dayOfWeek !== '*' ? 'weekly' : (dayOfMonth.includes('*/') ? 'multi-day' : 'daily'),
            file: file,
            startTime: startTime,
            endTime: startTime + jobDuration,
            cronExpr
          });
        }
      }
    }
    
    // 检查冲突 - 只检查同一天内的时间重叠
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const schedule1 = schedules[i];
        const schedule2 = schedules[j];
        
        // 对于不同类型的调度，需要考虑它们是否会在同一天运行
        let canCollide = false;
        
        if (schedule1.type.includes('every-') && schedule2.type.includes('every-')) {
          // 两个都是间隔式，检查是否会在同一时间运行
          canCollide = true;
        } else if (schedule1.type.includes('every-') || schedule2.type.includes('every-')) {
          // 一个是间隔式，一个是固定时间，间隔式每天都运行
          canCollide = true;
        } else {
          // 两个都是固定时间，检查是否在同一天运行
          canCollide = schedule1.type === schedule2.type || 
                      (schedule1.type === 'daily' || schedule2.type === 'daily');
        }
        
        if (canCollide) {
          // 检查时间重叠 (考虑24小时周期)
          const start1 = schedule1.startTime % (24 * 60);
          const end1 = schedule1.endTime % (24 * 60);
          const start2 = schedule2.startTime % (24 * 60);
          const end2 = schedule2.endTime % (24 * 60);
          
          const overlap = !(end1 <= start2 || end2 <= start1);
          
          if (overlap) {
            console.log(`❌ 检测到冲突:`);
            console.log(`   ${schedule1.type} (${schedule1.file}): ${Math.floor(start1/60)}:${(start1%60).toString().padStart(2,'0')}-${Math.floor(end1/60)}:${(end1%60).toString().padStart(2,'0')}`);
            console.log(`   ${schedule2.type} (${schedule2.file}): ${Math.floor(start2/60)}:${(start2%60).toString().padStart(2,'0')}-${Math.floor(end2/60)}:${(end2%60).toString().padStart(2,'0')}`);
            hasCollisions = true;
          }
        }
      }
    }
    
    if (!hasCollisions) {
      console.log('✅ 验证完成: 没有检测到调度冲突');
      console.log(`   所有 ${schedules.length} 个调度时间段都有足够的缓冲时间`);
      
      // 显示调度摘要
      console.log('\n📋 调度摘要:');
      schedules.sort((a, b) => (a.startTime % (24*60)) - (b.startTime % (24*60)));
      schedules.forEach(s => {
        const start = s.startTime % (24*60);
        const end = s.endTime % (24*60);
        console.log(`   ${s.type}: ${Math.floor(start/60)}:${(start%60).toString().padStart(2,'0')}-${Math.floor(end/60)}:${(end%60).toString().padStart(2,'0')} (${s.file})`);
      });
    }
    
  } catch (error) {
    console.log('⚠️  无法验证调度冲突:', error.message);
  }
  
  return !hasCollisions;
}

// 主函数
function main() {
  console.log('正在生成GitHub Actions工作流文件...');
  
  const workflowsDir = ensureWorkflowsDir();
  let sourcesByCron = getSourcesByCronConfig();
  
  // 优化调度冲突
  console.log('\n🔍 检查调度冲突...');
  sourcesByCron = optimizeScheduleCollisions(sourcesByCron, config);
  
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
  
  // 验证生成的调度是否存在冲突
  verifyNoCollisions(sourcesByCron, config);
  
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