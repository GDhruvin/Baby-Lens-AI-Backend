const generationService = require("../services/generation.service");

/**
 * Worker processor function invoked for each background generation job
 * @param {Object} jobData
 * @param {string} jobData.generationId
 * @param {string} jobData.userId
 * @param {string} jobData.profileId
 * @param {string} jobData.themeId
 * @param {string} jobData.paymentType
 */
async function generationWorkerProcessor(jobData) {
  return await generationService.executeBackgroundGeneration(jobData);
}

module.exports = {
  generationWorkerProcessor,
};
