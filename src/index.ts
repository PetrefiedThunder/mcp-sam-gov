#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.SAM_GOV_API_KEY || "";
const server = new McpServer({ name: "mcp-sam-gov", version: "1.0.0" });

async function sam(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.sam.gov${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SAM.gov API ${res.status}: ${await res.text()}`);
  return res.json();
}

server.tool("search_opportunities", "Search federal contract opportunities", {
  query: z.string().optional().describe("Keyword search"),
  naics: z.string().optional().describe("NAICS code"),
  set_aside: z.string().optional().describe("Set-aside type (SBA, 8a, WOSB, SDVOSB, HUBZone)"),
  posted_from: z.string().optional().describe("Posted after date (MM/DD/YYYY)"),
  posted_to: z.string().optional().describe("Posted before date (MM/DD/YYYY)"),
  type: z.enum(["o", "p", "k", "r", "s", "i", "u"]).optional().describe("Notice type: o=solicitation, p=presolicitation, k=combined, r=sources sought, s=special, i=intent to bundle"),
  limit: z.number().default(10),
}, async ({ query, naics, set_aside, posted_from, posted_to, type, limit }) => {
  const params: Record<string, string> = { limit: String(limit) };
  if (query) params.q = query;
  if (naics) params.ncode = naics;
  if (set_aside) params.typeOfSetAside = set_aside;
  if (posted_from) params.postedFrom = posted_from;
  if (posted_to) params.postedTo = posted_to;
  if (type) params.ptype = type;
  const data = await sam("/opportunities/v2/search", params);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("entity_search", "Search SAM.gov entity registrations (contractors/grantees)", {
  legal_business_name: z.string().optional().describe("Business name"),
  uei: z.string().optional().describe("Unique Entity ID (SAM)"),
  cage_code: z.string().optional().describe("CAGE code"),
  naics: z.string().optional().describe("NAICS code"),
  state: z.string().optional().describe("Two-letter state code"),
  limit: z.number().default(10),
}, async ({ legal_business_name, uei, cage_code, naics, state, limit }) => {
  const params: Record<string, string> = { size: String(limit) };
  if (legal_business_name) params.legalBusinessName = legal_business_name;
  if (uei) params.ueiSAM = uei;
  if (cage_code) params.cageCode = cage_code;
  if (naics) params.naicsCode = naics;
  if (state) params.physicalAddressProvinceOrStateCode = state;
  const data = await sam("/entity-information/v3/entities", params);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("exclusions", "Search SAM.gov exclusions (debarred/suspended entities)", {
  name: z.string().optional().describe("Entity name"),
  uei: z.string().optional(),
  classification: z.enum(["Individual", "Firm", "Vessel", "Special Entity Designation"]).optional(),
  limit: z.number().default(10),
}, async ({ name, uei, classification, limit }) => {
  const params: Record<string, string> = { size: String(limit) };
  if (name) params.q = name;
  if (uei) params.ueiSAM = uei;
  if (classification) params.classification = classification;
  const data = await sam("/entity-information/v3/exclusions", params);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("contract_awards", "Search federal contract award data (USASpending)", {
  keyword: z.string().optional(),
  agency: z.string().optional().describe("Awarding agency name"),
  recipient: z.string().optional().describe("Recipient name"),
  naics: z.string().optional(),
  limit: z.number().default(10),
}, async ({ keyword, agency, recipient, naics, limit }) => {
  const body: any = { limit, page: 1, sort: "Award Amount", order: "desc", filters: {} };
  if (keyword) body.filters.keywords = [keyword];
  if (agency) body.filters.agencies = [{ type: "awarding", name: agency }];
  if (recipient) body.filters.recipient_search_text = [recipient];
  if (naics) body.filters.naics_codes = { require: [naics] };
  const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
