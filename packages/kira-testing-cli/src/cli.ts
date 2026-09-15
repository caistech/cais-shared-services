/**
 * @caistech/kira-testing-cli — Command-line interface for Kira Testing.
 *
 * Usage:
 *   kira-testing test --repository <repo> --test-id <id> --test-type <type> \
 *     --target <target> --prompt "<prompt>" [--json]
 *   kira-testing red-team --repository <repo> --test-id <id> --target <target> \
 *     --prompt "<prompt>" [--json]
 *
 * Invokes the shared Kira-testing service through kira-testing-client.
 * Contains NO provider/model routing logic.
 */

import { test as clientTest, redTeam as clientRedTeam } from '@caistech/kira-testing-client';
import type { TestResult } from '@caistech/kira-testing-client';

interface CliOptions {
  json?: boolean;
}

function printResult(result: TestResult, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const lines = [
    'Kira Testing',
    `logical service: ${result.modelResolution.logicalService}`,
    `resolved route: ${result.modelResolution.resolvedModel}`,
    `gateway: ${result.gateway.gateway}`,
    `status: ${result.status}`,
    `latency: ${result.latencyMs}ms`,
  ];

  if (result.error) {
    lines.push(`error category: ${result.error.category}`);
    lines.push(`error: ${result.error.message}`);
  }

  if (result.output) {
    lines.push('');
    lines.push('Output:');
    lines.push(result.output);
  }

  console.log(lines.join('\n'));
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

function required(args: Record<string, string>, key: string): string {
  if (!args[key]) {
    throw new Error(`Missing required argument: --${key}`);
  }
  return args[key];
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const options: CliOptions = { json: args.json === 'true' };  if (!command) {
    console.error('Usage: kira-testing <test|red-team> [options]');
    console.error('Commands:');
    console.error('  test       Run a standard test');
    console.error('  red-team   Run an adversarial red-team test');
    process.exit(1);
  }

  if (command === 'test') {
    const repository = required(args, 'repository');
    const testId = required(args, 'test-id');
    const testType = required(args, 'test-type');
    const target = required(args, 'target');
    const prompt = required(args, 'prompt');

    const result = await clientTest({
      repository,
      testId,
      testType,
      target,
      prompt,
      expectedBehaviour: args['expected-behaviour'],
    });
    printResult(result, options.json);
    process.exit(result.status === 'success' ? 0 : 1);
    return;
  }

  if (command === 'red-team') {
    const repository = required(args, 'repository');
    const testId = required(args, 'test-id');
    const target = required(args, 'target');
    const prompt = required(args, 'prompt');

    const result = await clientRedTeam({
      repository,
      testId,
      target,
      prompt,
      expectedBehaviour: args['expected-behaviour'],
      adversarialCategory: args['category'],
    });
    printResult(result, options.json);
    process.exit(result.status === 'success' ? 0 : 1);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`kira-testing: ${(err as Error).message}`);
  process.exit(1);
});
