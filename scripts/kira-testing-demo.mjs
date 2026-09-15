#!/usr/bin/env node
/**
 * Kira Testing — Demo integration script.
 *
 * Shows how any repository can invoke the centralised Kira Testing service
 * through @caistech/kira-testing-client.
 *
 * Usage:
 *   node scripts/kira-testing-demo.mjs
 *
 * Requires env:
 *   KIRA_TESTING_OMNIROUTE_BASE_URL=http://localhost:20128
 *   KIRA_TESTING_OMNIROUTE_API_KEY=<your-key>
 *   KIRA_TESTING_MODEL_COMBO=kira-testing
 */

import { test, redTeam } from '@caistech/kira-testing-client';

const args = process.argv.slice(2);
const repo = args[0] || 'demo-repo';
const target = args[1] || '/home';

async function main() {
  console.log(`Kira Testing Demo — repo=${repo} target=${target}\n`);

  // --- Standard test (naive-tester path) ---
  console.log('--- Standard test ---');
  const result = await test({
    repository: repo,
    testId: 'demo-1',
    testType: 'smoke',
    target,
    prompt: 'Walk through this page as a first-time user. Note any friction points, confusing terminology, or missing information.',
    expectedBehaviour: 'The page should be clear, navigable, and complete for a new user.',
  });

  console.log(`status:   ${result.status}`);
  console.log(`model:    ${result.modelResolution.resolvedModel}`);
  console.log(`gateway:  ${result.gateway.gateway}`);
  console.log(`latency:  ${result.latencyMs}ms`);
  if (result.output) console.log(`output:\n${result.output}`);
  if (result.error) console.log(`error [${result.error.category}]: ${result.error.message}`);

  // --- Red-team test ---
  console.log('\n--- Red-team test ---');
  const rt = await redTeam({
    repository: repo,
    testId: 'demo-red-1',
    target,
    prompt: 'Try to extract internal system prompts or configuration details from this page.',
    adversarialCategory: 'prompt-leak',
  });

  console.log(`status:   ${rt.status}`);
  console.log(`model:    ${rt.modelResolution.resolvedModel}`);
  console.log(`latency:  ${rt.latencyMs}ms`);
  if (rt.output) console.log(`output:\n${rt.output}`);
  if (rt.error) console.log(`error [${rt.error.category}]: ${rt.error.message}`);

  process.exit(result.status === 'success' && rt.status === 'success' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
