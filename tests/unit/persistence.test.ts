/**
 * @fileoverview Unit tests for `src/lib/persistence.ts`.
 *
 * Uses an in-memory SQLite database (`url: ":memory:"`) so no file is created
 * and every test run is isolated from the real dev.db. The `@/lib/db` module is
 * mocked so the real `db.ts` and `env.ts` are never evaluated — no environment
 * variables required.
 *
 * Test groups:
 * - `saveMessages + loadMessages` — the delete-then-recreate transaction, `createdAt`
 *   injection into metadata, part serialization, and chronological ordering.
 * - `findOrCreateEmptyConversation` — reuse an existing empty untitled conversation,
 *   but not one that has messages or a custom title.
 * - `deleteConversation` — cascade delete removes messages.
 * - `listConversations` — returned newest-updated-first.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const { PrismaClient } = await import("@/generated/prisma/client");

  const adapter = new PrismaBetterSqlite3({ url: ":memory:" });
  const db = new PrismaClient({ adapter });

  // Apply the schema to the in-memory database before any test runs.
  // `$executeRawUnsafe` is used because DDL statements can't go through
  // Prisma's parameterized query builder.
  await db.$executeRawUnsafe(`
    CREATE TABLE "Conversation" (
      "id"        TEXT     NOT NULL PRIMARY KEY,
      "title"     TEXT     NOT NULL DEFAULT 'New conversation',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE "Message" (
      "id"             TEXT     NOT NULL PRIMARY KEY,
      "conversationId" TEXT     NOT NULL,
      "role"           TEXT     NOT NULL,
      "content"        TEXT     NOT NULL,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  return { db };
});

import { db } from "@/lib/db";
import {
  createConversation,
  deleteConversation,
  findOrCreateEmptyConversation,
  listConversations,
  loadMessages,
  saveMessages,
} from "@/lib/persistence";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

function makeMessage(id: string, role: "user" | "assistant", text: string): ChatUIMessage {
  return { id, role, parts: [{ type: "text", text }], metadata: {} } as ChatUIMessage;
}

describe("persistence", () => {
  beforeEach(async () => {
    await db.conversation.deleteMany(); // cascades to messages via ON DELETE CASCADE
  });

  describe("saveMessages + loadMessages", () => {
    it("saves messages and loads them back", async () => {
      const conv = await createConversation();
      const messages = [makeMessage("m1", "user", "hello"), makeMessage("m2", "assistant", "hi")];

      await saveMessages(conv.id, messages);
      const loaded = await loadMessages(conv.id);

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe("m1");
      expect(loaded[0].role).toBe("user");
      expect(loaded[1].id).toBe("m2");
    });

    it("replaces all messages on a second save (delete-then-recreate)", async () => {
      const conv = await createConversation();

      await saveMessages(conv.id, [makeMessage("m1", "user", "first message")]);
      await saveMessages(conv.id, [makeMessage("m2", "user", "second message")]);

      const loaded = await loadMessages(conv.id);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("m2");
    });

    it("injects createdAt from the DB row into message metadata", async () => {
      const conv = await createConversation();
      await saveMessages(conv.id, [makeMessage("m1", "user", "hello")]);

      const loaded = await loadMessages(conv.id);

      expect(typeof loaded[0].metadata?.createdAt).toBe("number");
      expect(loaded[0].metadata!.createdAt).toBeGreaterThan(0);
    });

    it("preserves the full parts array through JSON serialization", async () => {
      const conv = await createConversation();
      const original = makeMessage("m1", "user", "check parts");

      await saveMessages(conv.id, [original]);
      const loaded = await loadMessages(conv.id);

      expect(loaded[0].parts).toEqual(original.parts);
    });

    it("returns messages in chronological order", async () => {
      const conv = await createConversation();
      const messages = [
        makeMessage("m1", "user", "first"),
        makeMessage("m2", "assistant", "second"),
        makeMessage("m3", "user", "third"),
      ];

      await saveMessages(conv.id, messages);
      const loaded = await loadMessages(conv.id);

      expect(loaded.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    });

    it("returns an empty array for a conversation with no messages", async () => {
      const conv = await createConversation();
      expect(await loadMessages(conv.id)).toEqual([]);
    });
  });

  describe("findOrCreateEmptyConversation", () => {
    it("creates a new conversation when none exists", async () => {
      const conv = await findOrCreateEmptyConversation();
      expect(conv.id).toBeTruthy();
      expect(conv.title).toBe("New conversation");
    });

    it("reuses an existing empty untitled conversation instead of creating a new one", async () => {
      const first = await findOrCreateEmptyConversation();
      const second = await findOrCreateEmptyConversation();
      expect(second.id).toBe(first.id);
    });

    it("does not reuse a conversation that already has messages", async () => {
      const conv = await findOrCreateEmptyConversation();
      await saveMessages(conv.id, [makeMessage("m1", "user", "hello")]);

      const next = await findOrCreateEmptyConversation();
      expect(next.id).not.toBe(conv.id);
    });

    it("does not reuse a conversation with a custom title", async () => {
      const conv = await createConversation();
      await db.conversation.update({
        where: { id: conv.id },
        data: { title: "Shopping for laptops" },
      });

      const next = await findOrCreateEmptyConversation();
      expect(next.id).not.toBe(conv.id);
    });
  });

  describe("deleteConversation", () => {
    it("removes the conversation and cascades to its messages", async () => {
      const conv = await createConversation();
      await saveMessages(conv.id, [makeMessage("m1", "user", "hi")]);

      await deleteConversation(conv.id);

      const conversations = await listConversations();
      expect(conversations.find((c) => c.id === conv.id)).toBeUndefined();
      expect(await loadMessages(conv.id)).toHaveLength(0);
    });
  });

  describe("listConversations", () => {
    it("returns conversations ordered by most recently updated first", async () => {
      const a = await createConversation();
      await new Promise((r) => setTimeout(r, 10));
      const b = await createConversation();

      const list = await listConversations();
      expect(list[0].id).toBe(b.id);
      expect(list[1].id).toBe(a.id);
    });
  });
});
