/**
 * @fileoverview Streaming chat API route.
 *
 * POST /api/chat — accepts the current UIMessage list + conversationId, streams
 * the assistant response via the Vercel AI SDK's `streamText`, then persists
 * the final message list and generates a conversation title in the background.
 *
 * Model choice:
 * - `gpt-5.4-mini` for the main chat stream (fast, cheap, capable enough for
 *   structured tool-calling and shopping reasoning).
 * - `gpt-5.4-nano` for title generation (fire-and-forget, needs only 4-6 words).
 *
 * Persistence is inside `onFinish` and deliberately non-blocking — a persistence
 * failure should not fail the stream the user already received. Title generation
 * is further insulated with `.catch()` that falls back to a 40-char truncation of
 * the first user message, so a failed nano call never blocks the title update.
 *
 * `stopWhen: stepCountIs(5)` caps the tool-call chain at 5 steps to prevent
 * runaway loops while allowing enough depth for multi-tool multi-intent queries.
 */
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, generateId, generateText, streamText, stepCountIs } from "ai";
import type { ModelMessage, ToolResultPart } from "ai";
import {
  createSearchProductsTool,
  createSortShownProductsTool,
  extractLastProducts,
  getProduct,
  getBestRated,
  listCategories,
  suggestFollowUps,
  addToCart,
  checkout,
} from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { getConversation, saveMessages, updateConversationTitle } from "@/lib/persistence";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

/**
 * Replaces full searchProducts JSON payloads in older turns with compact
 * one-line summaries, e.g. "[searchProducts: 5 products — Title A, Title B, ...]".
 *
 * Only turns more than `keepTurns` user-messages back are compressed; the most
 * recent exchange is always kept verbatim so the model still has full context
 * for immediate follow-up questions about the products it just returned.
 *
 * Called from `prepareStep` so it runs before every model step (including
 * multi-step tool-call chains within one user turn), keeping the prompt lean
 * throughout the conversation without any manual cleanup.
 */
function compressOldToolResults(messages: ModelMessage[], keepTurns = 1): ModelMessage[] {
  // Find the index of the Nth-from-last user message — everything before it
  // is "old history" eligible for compression.
  let userMsgsSeen = 0;
  let cutoffIdx = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userMsgsSeen++;
      if (userMsgsSeen > keepTurns) {
        cutoffIdx = i + 1; // compress everything strictly before this index
        break;
      }
    }
  }

  if (cutoffIdx === 0) return messages; // not enough history to compress

  return messages.map((msg, i) => {
    if (i >= cutoffIdx || msg.role !== "tool") return msg;

    const compressedContent = (msg.content as ToolResultPart[]).map((part) => {
      if (part.type !== "tool-result" || part.toolName !== "searchProducts") return part;

      // output may arrive as a plain object or wrapped: { type:'json', value:{...} }
      const raw = part.output as Record<string, unknown> | null | undefined;
      const payload = (raw?.type === "json" ? (raw.value as Record<string, unknown>) : raw) ?? {};
      const products = payload.products as Array<{ title: string }> | undefined;

      if (!products?.length) return part;

      const titles = products.map((p) => p.title).join(", ");
      const summary = `[searchProducts: ${products.length} product${products.length === 1 ? "" : "s"} — ${titles}]`;
      return { ...part, output: { type: "text" as const, value: summary } };
    });

    return { ...msg, content: compressedContent };
  });
}

export async function POST(req: Request) {
  try {
    const { messages, conversationId }: { messages: ChatUIMessage[]; conversationId: string } =
      await req.json();

    const result = streamText({
      model: openai("gpt-5.4-mini"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools: {
        searchProducts: createSearchProductsTool(conversationId),
        sortShownProducts: createSortShownProductsTool(extractLastProducts(messages)),
        getProduct,
        getBestRated,
        listCategories,
        suggestFollowUps,
        addToCart,
        checkout,
      },
      stopWhen: stepCountIs(5),
      prepareStep: ({ messages: stepMessages }) => ({
        messages: compressOldToolResults(stepMessages),
      }),
      onFinish: ({ usage }) => {
        console.log(`[tokens] input: ${usage.inputTokens} | output: ${usage.outputTokens}`);
      },
    });

    return result.toUIMessageStreamResponse<ChatUIMessage>({
      originalMessages: messages,
      generateMessageId: generateId,
      onFinish: async ({ messages: finalMessages }) => {
        try {
          const messagesToSave = finalMessages.filter((m) => m.id);
          await saveMessages(conversationId, messagesToSave);

          // Only generate a title once, on the very first user message.
          // Falls back to a 40-char truncation if the nano model call fails.
          const conversation = await getConversation(conversationId);
          if (conversation?.title === "New conversation") {
            const firstUserText = finalMessages
              .find((m) => m.role === "user")
              ?.parts.find((p) => p.type === "text")?.text;
            if (firstUserText) {
              generateText({
                model: openai("gpt-5.4-nano"),
                prompt: `Summarize this request in 4-6 words for a chat list title, plain text, no quotes: ${firstUserText}`,
              })
                .then(({ text }) => updateConversationTitle(conversationId, text.trim()))
                .catch(() => updateConversationTitle(conversationId, firstUserText.slice(0, 40)));
            }
          }
        } catch (err) {
          console.error("Persistence error:", err);
        }
      },
    });
  } catch (err) {
    console.error("Chat error:", err);
    return Response.json(
      { error: "Something went wrong talking to the assistant. Please try again." },
      { status: 500 },
    );
  }
}
