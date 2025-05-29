#!/usr/bin/env node

/**
 * Set up Git hooks for automatic workflow generation
 */

const fs = require('fs');
const path = require('path');

function setupPreCommitHook() {
  const gitHooksDir = path.join(process.cwd(), '.git/hooks');
  const preCommitHookPath = path.join(gitHooksDir, 'pre-commit');
  
  // Ensure the hooks directory exists
  if (!fs.existsSync(gitHooksDir)) {
    console.log('Git hooks directory does not exist. Skipping setup.');
    return false;
  }
  
  const hookContent = `#!/bin/sh
# Auto-generated pre-commit hook
# This hook runs the RSS config workflow generator when config files change

node scripts/pre-commit-hook.js
`;

  try {
    fs.writeFileSync(preCommitHookPath, hookContent);
    fs.chmodSync(preCommitHookPath, '755');
    console.log('✅ Pre-commit hook installed successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to install pre-commit hook:', error.message);
    return false;
  }
}

function setupPackageScripts() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Add scripts if they don't exist
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    
    const newScripts = {
      'generate-workflows': 'node scripts/generate-workflows.js',
      'setup-hooks': 'node scripts/setup-git-hooks.js',
      'validate-config': 'node scripts/validate-config.js'
    };
    
    let scriptsAdded = false;
    for (const [script, command] of Object.entries(newScripts)) {
      if (!packageJson.scripts[script]) {
        packageJson.scripts[script] = command;
        scriptsAdded = true;
        console.log(`✅ Added script: ${script}`);
      }
    }
    
    if (scriptsAdded) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log('✅ Package.json scripts updated');
    } else {
      console.log('📝 All scripts already exist in package.json');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to update package.json:', error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Setting up Git hooks and npm scripts...');
  
  const hookInstalled = setupPreCommitHook();
  const scriptsUpdated = setupPackageScripts();
  
  if (hookInstalled && scriptsUpdated) {
    console.log('\n✅ Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Modify RSS sources in config/rss-config.js');
    console.log('2. Run "pnpm generate-workflows" or commit changes to auto-generate workflows');
    console.log('3. The pre-commit hook will automatically run when you commit changes to RSS config');
  } else {
    console.log('\n⚠️  Setup completed with some issues. Please check the errors above.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { setupPreCommitHook, setupPackageScripts }; 