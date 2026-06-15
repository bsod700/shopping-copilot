import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, generateText, streamText, stepCountIs } from "ai";
import {
  searchProducts,
  getProduct,
  listCategories,
  suggestFollowUps,
  addToCart,
  checkout,
} from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { getConversation, saveMessages, updateConversationTitle } from "@/lib/persistence";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

export async function POST(req: Request) {
  try {
    const { messages, conversationId }: { messages: ChatUIMessage[]; conversationId: string } =
      await req.json();

    const result = streamText({
      model: openai("gpt-5.4-mini"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools: { searchProducts, getProduct, listCategories, suggestFollowUps, addToCart, checkout },
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse<ChatUIMessage>({
      originalMessages: messages,
      onFinish: async ({ messages: finalMessages }) => {
        try {
          await saveMessages(conversationId, finalMessages);

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
