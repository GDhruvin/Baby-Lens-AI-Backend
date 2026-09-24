const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

let generationQueue = null;
let generationWorker = null;
let isRedisAvailable = false;
let registeredProcessor = null;

// In-Memory Queue Fallback
const inMemoryQueue = [];
let isProcessingInMemory = false;

const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;

/**
 * Initializes the generation queue and worker.
 * Supports BullMQ when Redis is configured, with a resilient in-memory fallback.
 * @param {Function} processorFn - Async function (jobData) => Promise<any>
 */
function initGenerationQueue(processorFn) {
  registeredProcessor = processorFn;

  if (redisUrl) {
    try {
      console.log(`[GenerationQueue] Attempting connection to Redis for BullMQ...`);
      const connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            console.warn("[GenerationQueue] Redis connection retry limit reached. Falling back to in-memory queue.");
            return null; // Stop retrying
          }
          return Math.min(times * 500, 2000);
        },
      });

      connection.on("connect", () => {
        isRedisAvailable = true;
        console.log("✅ [GenerationQueue] Connected to Redis. BullMQ background queue active.");
      });

      connection.on("error", (err) => {
        console.warn(`⚠️ [GenerationQueue] Redis error: ${err.message}. Operating with in-memory queue fallback.`);
        isRedisAvailable = false;
      });

      generationQueue = new Queue("generationQueue", { connection });
      generationWorker = new Worker(
        "generationQueue",
        async (job) => {
          console.log(`[BullMQ Worker] Processing job ${job.id} for generation ${job.data?.generationId}`);
          return await registeredProcessor(job.data);
        },
        {
          connection,
          concurrency: Number(process.env.GENERATION_CONCURRENCY || 5),
        }
      );

      generationWorker.on("completed", (job) => {
        console.log(`[BullMQ Worker] Job ${job.id} completed successfully.`);
      });

      generationWorker.on("failed", (job, err) => {
        console.error(`[BullMQ Worker] Job ${job?.id} failed:`, err?.message);
      });
    } catch (err) {
      console.warn(`[GenerationQueue] Failed to initialize BullMQ: ${err.message}. Using in-memory fallback.`);
      isRedisAvailable = false;
    }
  } else {
    console.log("ℹ️ [GenerationQueue] No REDIS_URL configured. Running with in-memory async background queue.");
  }
}

/**
 * In-memory fallback worker loop
 */
async function processNextInMemoryJob() {
  if (isProcessingInMemory || inMemoryQueue.length === 0) return;
  if (!registeredProcessor) return;

  isProcessingInMemory = true;
  const job = inMemoryQueue.shift();

  try {
    console.log(`[InMemoryQueue] Executing background task for generation: ${job.data?.generationId}`);
    await registeredProcessor(job.data);
  } catch (err) {
    console.error(`[InMemoryQueue] Task failed for generation ${job.data?.generationId}:`, err?.message);
  } finally {
    isProcessingInMemory = false;
    if (inMemoryQueue.length > 0) {
      setImmediate(processNextInMemoryJob);
    }
  }
}

/**
 * Enqueue a generation job into the background queue
 * @param {Object} jobData - { generationId, userId, profileId, themeId, paymentType }
 * @returns {Promise<Object>} Job details with ID
 */
async function enqueueGenerationJob(jobData) {
  if (isRedisAvailable && generationQueue) {
    const job = await generationQueue.add("generatePhotoshoot", jobData, {
      attempts: 2,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
    return { id: job.id, isRedis: true };
  }

  // In-Memory Fallback
  inMemoryQueue.push({ data: jobData });
  setImmediate(processNextInMemoryJob);
  return { id: String(jobData.generationId), isRedis: false };
}

module.exports = {
  initGenerationQueue,
  enqueueGenerationJob,
};
