import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import {
  createSearchProductsTool,
  getProduct,
  listCategories,
  suggestFollowUps,
  addToCart,
  checkout,
} from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { evalCases, type EvalContext } from "./prompts";

async function runCase(turns: string[], conversationId: string): Promise<EvalContext> {
  const tools = {
    searchProducts: createSearchProductsTool(conversationId),
    getProduct,
    listCategories,
    suggestFollowUps,
    addToCart,
    checkout,
  };
  let messages: ModelMessage[] = [];
  let toolCalls: EvalContext["toolCalls"] = [];
  let toolResults: EvalContext["toolResults"] = [];
  let text = "";

  for (const turn of turns) {
    messages = [...messages, { role: "user", content: turn }];

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

  let passed = 0;
  let failed = 0;

  for (const evalCase of cases) {
    process.stdout.write(`${evalCase.id} ... `);
    try {
      const ctx = await runCase(evalCase.turns, `eval-${evalCase.id}`);
      const result = evalCase.check(ctx);
      if (result.pass) {
        console.log("PASS");
        passed++;
      } else {
        console.log(`FAIL - ${result.reason}`);
        console.log(`  reply: ${ctx.text.slice(0, 200)}`);
        console.log(`  tool calls: ${ctx.toolCalls.map((c) => `${c.toolName}(${JSON.stringify(c.input)})`).join(", ")}`);
        failed++;
      }
    } catch (err) {
      console.log(`ERROR - ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${passed + failed} passed`);
  if (failed > 0) process.exit(1);
}

main();
