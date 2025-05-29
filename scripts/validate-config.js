#!/usr/bin/env node

/**
 * Validate RSS configuration for common issues
 */

function validateConfig() {
  try {
    const { config, getEnabledSources } = require('../config/rss-config.js');
    
    let errors = [];
    let warnings = [];
    
    // Check if config exists
    if (!config) {
      errors.push('Configuration object not found');
      return { valid: false, errors, warnings };
    }
    
    // Check if sources exist
    if (!config.sources || !Array.isArray(config.sources)) {
      errors.push('Sources array not found or not an array');
      return { valid: false, errors, warnings };
    }
    
    // Check if there are any sources
    if (config.sources.length === 0) {
      warnings.push('No RSS sources configured');
    }
    
    // Validate each source
    config.sources.forEach((source, index) => {
      const sourcePrefix = `Source ${index + 1} (${source.name || 'unnamed'})`;
      
      // Required fields
      if (!source.name) {
        errors.push(`${sourcePrefix}: Missing required field 'name'`);
      }
      
      if (!source.url) {
        errors.push(`${sourcePrefix}: Missing required field 'url'`);
      } else {
        // Basic URL validation
        try {
          new URL(source.url);
        } catch (e) {
          errors.push(`${sourcePrefix}: Invalid URL format`);
        }
      }
      
      if (!source.category) {
        errors.push(`${sourcePrefix}: Missing required field 'category'`);
      }
      
      // Optional field validation
      if (source.maxItemsPerFeed !== undefined) {
        if (typeof source.maxItemsPerFeed !== 'number' || source.maxItemsPerFeed < 1) {
          errors.push(`${sourcePrefix}: maxItemsPerFeed must be a positive number`);
        }
        if (source.maxItemsPerFeed > 50) {
          warnings.push(`${sourcePrefix}: maxItemsPerFeed (${source.maxItemsPerFeed}) is quite high, consider reducing for performance`);
        }
      }
      
      if (source.cronConfig !== undefined) {
        if (typeof source.cronConfig !== 'string') {
          errors.push(`${sourcePrefix}: cronConfig must be a string`);
        } else {
          // Basic cron format validation (5 fields)
          const cronParts = source.cronConfig.split(' ');
          if (cronParts.length !== 5) {
            errors.push(`${sourcePrefix}: cronConfig must have 5 fields (minute hour day month day-of-week)`);
          }
        }
      }
      
      if (source.enabled !== undefined && typeof source.enabled !== 'boolean') {
        errors.push(`${sourcePrefix}: enabled must be a boolean`);
      }
    });
    
    // Check global configuration
    if (config.maxItemsPerFeed !== undefined) {
      if (typeof config.maxItemsPerFeed !== 'number' || config.maxItemsPerFeed < 1) {
        errors.push('Global maxItemsPerFeed must be a positive number');
      }
    }
    
    if (config.defaultCronConfig !== undefined) {
      if (typeof config.defaultCronConfig !== 'string') {
        errors.push('defaultCronConfig must be a string');
      } else {
        const cronParts = config.defaultCronConfig.split(' ');
        if (cronParts.length !== 5) {
          errors.push('defaultCronConfig must have 5 fields (minute hour day month day-of-week)');
        }
      }
    }
    
    // Check for duplicate URLs
    const urls = config.sources.map(s => s.url).filter(Boolean);
    const duplicateUrls = urls.filter((url, index) => urls.indexOf(url) !== index);
    if (duplicateUrls.length > 0) {
      errors.push(`Duplicate URLs found: ${[...new Set(duplicateUrls)].join(', ')}`);
    }
    
    // Check enabled sources
    const enabledSources = getEnabledSources();
    if (enabledSources.length === 0) {
      warnings.push('No enabled sources found. All sources are disabled.');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        totalSources: config.sources.length,
        enabledSources: enabledSources.length,
        disabledSources: config.sources.length - enabledSources.length
      }
    };
    
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to load or parse configuration: ${error.message}`],
      warnings: []
    };
  }
}

function main() {
  console.log('🔍 Validating RSS configuration...');
  
  const result = validateConfig();
  
  if (result.errors.length > 0) {
    console.log('\n❌ Configuration errors found:');
    result.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Configuration warnings:');
    result.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  if (result.stats) {
    console.log('\n📊 Configuration statistics:');
    console.log(`  - Total sources: ${result.stats.totalSources}`);
    console.log(`  - Enabled sources: ${result.stats.enabledSources}`);
    if (result.stats.disabledSources > 0) {
      console.log(`  - Disabled sources: ${result.stats.disabledSources}`);
    }
  }
  
  if (result.valid) {
    console.log('\n✅ Configuration is valid!');
    process.exit(0);
  } else {
    console.log('\n❌ Configuration validation failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateConfig }; 