/**
 * Точка входа модуля субагентов.
 */
const { scanAgents, mergeAgents, scanAgentsRoot } = require("./scanner");
const { buildAgentsSection } = require("./prompt");

module.exports = {
  scanAgents,
  mergeAgents,
  scanAgentsRoot,
  buildAgentsSection,
};
