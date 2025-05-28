/**
 * Gemini API Manager with Load Balancing and Rate Limiting
 * Manages multiple Gemini API keys to distribute requests and handle rate limits
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiManager {
  constructor() {
    this.keys = [];
    this.clients = [];
    this.models = [];
    this.keyStats = []; // Track usage stats for each key
    this.currentKeyIndex = 0;
    this.requestsPerMinuteLimit = 10; // Gemini's limit
    this.requestsPerDayLimit = 500; // Gemini's limit
    this.initialized = false;
    
    this.initialize();
  }

  /**
   * Initialize the Gemini manager with API keys from environment variables
   */
  initialize() {
    const modelName = process.env.GEMINI_MODEL_NAME || "gemini-1.5-flash-latest";
    
    // Try to load multiple keys from environment variables
    for (let i = 1; i <= 8; i++) {
      const keyEnvVar = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
      const apiKey = process.env[keyEnvVar];
      
      if (apiKey) {
        this.keys.push(apiKey);
        
        // Create client for this key
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        this.clients.push(genAI);
        this.models.push(model);
        
        // Initialize stats for this key
        this.keyStats.push({
          keyIndex: i - 1,
          requestsThisMinute: 0,
          requestsToday: 0,
          lastRequestTime: 0,
          lastMinuteReset: Date.now(),
          lastDayReset: Date.now(),
          isRateLimited: false,
          rateLimitUntil: 0,
          totalRequests: 0,
          errors: 0
        });
        
        console.log(`已加载 Gemini API Key ${i}: ${apiKey.substring(0, 8)}...`);
      }
    }
    
    if (this.keys.length === 0) {
      console.error('未找到任何 Gemini API Key。请设置 GEMINI_API_KEY 或 GEMINI_API_KEY_1 到 GEMINI_API_KEY_8');
      process.exit(1);
    }
    
    console.log(`Gemini 管理器初始化完成，共加载 ${this.keys.length} 个 API Key`);
    this.initialized = true;
  }

  /**
   * Get the next available API key using round-robin with rate limit awareness
   */
  getNextAvailableKey() {
    const now = Date.now();
    
    // First, reset counters for keys that have passed their reset time
    this.keyStats.forEach(stat => {
      // Reset minute counter every minute
      if (now - stat.lastMinuteReset >= 60000) {
        stat.requestsThisMinute = 0;
        stat.lastMinuteReset = now;
      }
      
      // Reset day counter every day
      if (now - stat.lastDayReset >= 86400000) {
        stat.requestsToday = 0;
        stat.lastDayReset = now;
      }
      
      // Check if rate limit has expired
      if (stat.isRateLimited && now >= stat.rateLimitUntil) {
        stat.isRateLimited = false;
        console.log(`API Key ${stat.keyIndex + 1} 速率限制已解除`);
      }
    });
    
    // Find the best available key (not rate limited and has capacity)
    let attempts = 0;
    const maxAttempts = this.keys.length * 2; // Prevent infinite loop
    
    while (attempts < maxAttempts) {
      const stat = this.keyStats[this.currentKeyIndex];
      
      // Check if this key is available
      if (!stat.isRateLimited && 
          stat.requestsThisMinute < this.requestsPerMinuteLimit && 
          stat.requestsToday < this.requestsPerDayLimit) {
        return this.currentKeyIndex;
      }
      
      // Move to next key
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      attempts++;
    }
    
    // If no key is immediately available, find the one with the shortest wait time
    const availableKey = this.findKeyWithShortestWait();
    if (availableKey !== -1) {
      this.currentKeyIndex = availableKey;
      return availableKey;
    }
    
    // All keys are rate limited
    throw new Error('所有 Gemini API Key 都已达到速率限制，请稍后重试');
  }

  /**
   * Find the key with the shortest wait time
   */
  findKeyWithShortestWait() {
    const now = Date.now();
    let shortestWait = Infinity;
    let bestKeyIndex = -1;
    
    this.keyStats.forEach((stat, index) => {
      let waitTime = 0;
      
      if (stat.requestsThisMinute >= this.requestsPerMinuteLimit) {
        // Need to wait until next minute
        waitTime = Math.max(waitTime, 60000 - (now - stat.lastMinuteReset));
      }
      
      if (stat.requestsToday >= this.requestsPerDayLimit) {
        // Need to wait until next day
        waitTime = Math.max(waitTime, 86400000 - (now - stat.lastDayReset));
      }
      
      if (stat.isRateLimited) {
        // Need to wait until rate limit expires
        waitTime = Math.max(waitTime, stat.rateLimitUntil - now);
      }
      
      if (waitTime < shortestWait) {
        shortestWait = waitTime;
        bestKeyIndex = index;
      }
    });
    
    return bestKeyIndex;
  }

  /**
   * Record that a request was made with a specific key
   */
  recordRequest(keyIndex) {
    const stat = this.keyStats[keyIndex];
    const now = Date.now();
    
    stat.requestsThisMinute++;
    stat.requestsToday++;
    stat.totalRequests++;
    stat.lastRequestTime = now;
    
    // Move to next key for round-robin
    this.currentKeyIndex = (keyIndex + 1) % this.keys.length;
  }

  /**
   * Record that a rate limit error occurred for a specific key
   */
  recordRateLimit(keyIndex, retryAfterMs = 60000) {
    const stat = this.keyStats[keyIndex];
    stat.isRateLimited = true;
    stat.rateLimitUntil = Date.now() + retryAfterMs;
    stat.errors++;
    
    console.warn(`API Key ${keyIndex + 1} 遇到速率限制，将在 ${Math.round(retryAfterMs / 1000)} 秒后重试`);
  }

  /**
   * Record an error for a specific key
   */
  recordError(keyIndex) {
    this.keyStats[keyIndex].errors++;
  }

  /**
   * Generate content using the best available API key
   */
  async generateContent(prompt, generationConfig = {}) {
    if (!this.initialized) {
      throw new Error('Gemini 管理器未初始化');
    }

    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get the best available key
        const keyIndex = this.getNextAvailableKey();
        const model = this.models[keyIndex];
        
        console.log(`使用 API Key ${keyIndex + 1} 发送请求 (尝试 ${attempt + 1}/${maxRetries})`);
        
        // Record the request
        this.recordRequest(keyIndex);
        
        // Add a small delay to avoid hitting rate limits too quickly
        if (this.keyStats[keyIndex].requestsThisMinute > 5) {
          await this.sleep(2000); // 2 second delay for keys that are being used heavily
        }
        
        // Make the request
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 50000,
            ...generationConfig
          }
        });
        
        console.log(`API Key ${keyIndex + 1} 请求成功`);
        return result;
        
      } catch (error) {
        lastError = error;
        const errorMessage = error.message?.toLowerCase() || "";
        
        // Check if this is a rate limit error
        if (errorMessage.includes("quota") || 
            errorMessage.includes("rate limit") || 
            errorMessage.includes("resource has been exhausted") || 
            error.httpStatusCode === 429) {
          
          // Record rate limit for current key
          if (this.currentKeyIndex >= 0) {
            this.recordRateLimit(this.currentKeyIndex);
          }
          
          console.warn(`遇到速率限制错误，尝试使用其他 API Key...`);
          
          // Try to find another available key
          try {
            const nextKeyIndex = this.getNextAvailableKey();
            console.log(`切换到 API Key ${nextKeyIndex + 1}`);
            continue; // Retry with different key
          } catch (noKeyError) {
            // All keys are rate limited, wait a bit
            console.warn('所有 API Key 都遇到速率限制，等待 30 秒后重试...');
            await this.sleep(30000);
            continue;
          }
        } else {
          // Non-rate-limit error, record it and try next key
          if (this.currentKeyIndex >= 0) {
            this.recordError(this.currentKeyIndex);
          }
          console.error(`API Key ${this.currentKeyIndex + 1} 遇到错误: ${error.message}`);
          
          if (attempt < maxRetries - 1) {
            console.log('尝试使用下一个 API Key...');
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
          }
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get statistics for all API keys
   */
  getStats() {
    return this.keyStats.map((stat, index) => ({
      keyIndex: index + 1,
      totalRequests: stat.totalRequests,
      requestsThisMinute: stat.requestsThisMinute,
      requestsToday: stat.requestsToday,
      errors: stat.errors,
      isRateLimited: stat.isRateLimited,
      rateLimitUntil: stat.isRateLimited ? new Date(stat.rateLimitUntil).toISOString() : null
    }));
  }

  /**
   * Print statistics to console
   */
  printStats() {
    console.log('\n=== Gemini API Keys 使用统计 ===');
    this.keyStats.forEach((stat, index) => {
      console.log(`Key ${index + 1}: 总请求=${stat.totalRequests}, 本分钟=${stat.requestsThisMinute}, 今日=${stat.requestsToday}, 错误=${stat.errors}, 限流=${stat.isRateLimited}`);
    });
    console.log('================================\n');
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GeminiManager; 