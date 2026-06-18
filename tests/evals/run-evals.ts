/**
 * @fileoverview CLI runner for the eval suite defined in `prompts.ts`.
 *
 * Usage:
 *   npx tsx tests/evals/run-evals.ts          # run all cases
 *   npx tsx tests/evals/run-evals.ts <id>     # run one case by id
 *
 * Each case is run through `runCase`, which replays all turns sequentially,
 * accumulates tool calls + tool results across steps, and returns an `EvalContext`
 * for the case's `check` function. Multi-turn cases pass the full conversation
 * history into each subsequent turn, so the model sees realistic context.
 *
 * Design decisions:
 * - Uses `gpt-5.4-mini` (same model as production) so prompt regressions are caught
 *   against the real model, not a cheaper stand-in that might behave differently.
 * - `stopWhen: stepCountIs(5)` mirrors the production cap to avoid unbounded loops.
 * - `needsApproval: true` tools (`addToCart`, `checkout`) are included so the model
 *   doesn't confuse their absence with a missing tool and hallucinate a workaround.
 * - Exits with code 1 if any case fails, so CI can gate on evals.
 */
process.env.NODE_ENV = "test";
import { config } from "dotenv";
config(); // load .env before any SDK imports read OPENAI_API_KEY
import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import {
  createSearchProductsTool,
  createSortShownProductsTool,
  getProduct,
  listCategories,
  suggestFollowUps,
  addToCart,
  checkout,
} from "@/lib/ai/tools";
import type { Product } from "@/lib/types";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { evalCases, type EvalContext } from "./prompts";

async function runCase(turns: string[], conversationId: string): Promise<EvalContext> {
  let messages: ModelMessage[] = [];
  let toolCalls: EvalContext["toolCalls"] = [];
  let toolResults: EvalContext["toolResults"] = [];
  let text = "";
  let lastProducts: Product[] = [];

  for (const turn of turns) {
    messages = [...messages, { role: "user", content: turn }];

    // Rebuild tools each turn so sortShownProducts closes over the latest products
    const tools = {
      searchProducts: createSearchProductsTool(conversationId),
      sortShownProducts: createSortShownProductsTool(lastProducts),
      getProduct,
      listCategories,
      suggestFollowUps,
      addToCart,
      checkout,
    };

    const result = streamText({
      model: openai("gpt-5.4-mini"),
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });

    text = await result.text;
    const steps = await result.steps;
    for (const step of steps) {
      toolCalls = [...toolCalls, ...step.toolCalls.map((c) => ({ toolName: c.toolName, input: c.input }))];
      toolResults = [
        ...toolResults,
        ...step.toolResults.map((r) => ({ toolName: r.toolName, output: (r as { output?: unknown }).output })),
      ];
      // Track last searchProducts result so the next turn's sortShownProducts has real data
      for (const r of step.toolResults) {
        if (r.toolName === "searchProducts") {
          const output = (r as { output?: { products?: Product[] } }).output;
          if (output?.products) lastProducts = output.products;
        }
      }
    }

    const response = await result.response;
    messages = [...messages, ...(response.messages as ModelMessage[])];
  }

  return { text, toolCalls, toolResults, messages };
}

async function main() {
  const filter = process.argv[2];
  const cases = filter ? evalCases.filter((c) => c.id === filter) : evalCases;

  if (cases.length === 0) {
    console.error(`No eval case matches "${filter}". Available: ${evalCases.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }

  const clr = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
  };

  const PASS = `${clr.bold}${clr.green}✓ PASS${clr.reset}`;
  const FAIL = `${clr.bold}${clr.red}✗ FAIL${clr.reset}`;
  const ERR  = `${clr.bold}${clr.red}⚠ ERR ${clr.reset}`;

  console.log(`\n${clr.bold}${clr.cyan}Evals${clr.reset}  ${clr.dim}${cases.length} case${cases.length !== 1 ? "s" : ""}${clr.reset}\n`);

  let passed = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const evalCase of cases) {
    process.stdout.write(`  ${evalCase.id.padEnd(42)}`);
    try {
      const ctx = await runCase(evalCase.turns, `eval-${evalCase.id}`);
      const result = evalCase.check(ctx);
      if (result.pass) {
        console.log(PASS);
        passed++;
      } else {
        console.log(FAIL);
        failures.push({ id: evalCase.id, reason: result.reason ?? "no reason" });
      }
    } catch (err) {
      console.log(ERR);
      failures.push({ id: evalCase.id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const total = passed + failures.length;
  const allPassed = failures.length === 0;

  console.log(`\n${"─".repeat(52)}`);
  if (allPassed) {
    console.log(`  ${clr.green}${clr.bold}✓ All ${total} passed${clr.reset}`);
  } else {
    console.log(`  ${clr.green}✓ ${passed} passed${clr.reset}   ${clr.red}✗ ${failures.length} failed${clr.reset}   ${clr.dim}${total} total${clr.reset}`);
    console.log();
    for (const f of failures) {
      console.log(`  ${clr.red}✗${clr.reset} ${clr.bold}${f.id}${clr.reset}`);
      console.log(`    ${clr.dim}${f.reason}${clr.reset}`);
    }
  }
  console.log();

  if (failures.length > 0) process.exit(1);
}

main();
