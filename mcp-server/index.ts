import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchProducts } from "./dummyjson.js";

const server = new McpServer({
  name: "shopping-copilot-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "search_products",
  {
    title: "Search Products",
    description: "Search the DummyJSON product catalog by query, category, and sort order.",
    inputSchema: {
      query: z.string().optional().describe("Free-text search query"),
      category: z.string().optional().describe("Exact category slug to filter by"),
      sortBy: z.enum(["price", "rating", "title"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(20).optional().describe("Max results to return (default 5)"),
    },
  },
  async ({ query, category, sortBy, order, limit }) => {
    const result = await searchProducts({ query, category, sortBy, order, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
