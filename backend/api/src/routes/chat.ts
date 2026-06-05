import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPool } from '../db/pool';
import logger from '../logger';

const router = Router();

// ── Gemini AI client ─────────────────────────────────────────────────────────
const API_KEY = process.env.gemini_api_key || process.env.GEMINI_API_KEY || '';
const genAI   = new GoogleGenerativeAI(API_KEY);

import fs from 'fs';
import path from 'path';

let cachedKnowledgeBase = '';
let cachedConversations: { question: string; answer: string }[] = [];
let datasetLoaded = false;

function loadDataset() {
  if (datasetLoaded) return;
  try {
    const filePath = path.join(process.cwd(), 'dataset.json');
    if (!fs.existsSync(filePath)) {
      logger.warn('dataset.json not found at ' + filePath);
      return;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.train)) {
      // 1. Extract system prompt context from first conversation
      const firstConv = data.train[0]?.conversations;
      if (firstConv) {
        const sysMsg = firstConv.find((c: any) => c.from === 'system');
        if (sysMsg) {
          cachedKnowledgeBase = sysMsg.value;
        }
      }

      // 2. Extract Q&As for keyword matching
      cachedConversations = [];
      for (const item of data.train) {
        const humanMsg = item.conversations.find((c: any) => c.from === 'human');
        const gptMsg = item.conversations.find((c: any) => c.from === 'gpt');
        if (humanMsg?.value && gptMsg?.value) {
          cachedConversations.push({
            question: humanMsg.value,
            answer: gptMsg.value,
          });
        }
      }
      datasetLoaded = true;
      logger.info(`dataset.json parsed successfully. Loaded ${cachedConversations.length} conversations.`);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to parse dataset.json');
  }
}

function searchDataset(query: string, limit = 3): string {
  loadDataset();
  if (cachedConversations.length === 0) return '';

  const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  if (queryTerms.length === 0) return '';

  const scored = cachedConversations.map(conv => {
    let score = 0;
    const qText = conv.question.toLowerCase();
    const aText = conv.answer.toLowerCase();
    
    for (const term of queryTerms) {
      if (qText.includes(term)) score += 3; // higher weight for matching question
      if (aText.includes(term)) score += 1;
    }
    return { ...conv, score };
  });

  const matches = scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (matches.length === 0) return '';

  return `
RELEVANT CO-FOUNDER / TEAM DETAILS FROM DATASET:
=============================================================
${matches.map((m, i) => `[Snippet #${i+1}]\nQuestion: ${m.question}\nAnswer: ${m.answer}`).join('\n\n')}
=============================================================`;
}

function cleanMessageContent(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');

  // Strip leading reasoning/planning lines.
  // We identify them as lines starting with '* ' or '• ' at the very beginning of the response
  // that contain meta/planning language.
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    
    const isReasoningBullet = (trimmed.startsWith('* ') || trimmed.startsWith('• ')) && 
      /user wants|user asks|acknowledge|mention|explain|note:|point out|system prompt|constraint|crucially/i.test(trimmed);
    
    if (isReasoningBullet) {
      startIdx = i + 1;
    } else {
      break;
    }
  }

  const afterPreamble = lines.slice(startIdx);
  const cleaned: string[] = [];

  // Filter out any other clear planning/meta lines that might be scattered,
  // but be extremely conservative so we don't strip actual response content.
  const planningRegex = /^\*\s+(user (wants|asks|is asking|question|need)|the user|system prompt|constraint|crucially)/i;

  for (const line of afterPreamble) {
    const trimmed = line.trim();
    if (!planningRegex.test(trimmed)) {
      cleaned.push(line);
    }
  }

  return cleaned
    .map(line => line.trim())
    .filter((line, idx, arr) => {
      // Collapse more than one consecutive blank line
      if (line.length === 0 && idx > 0 && arr[idx - 1].length === 0) return false;
      return true;
    })
    .join('\n')
    .trim();
}

// ── RAG: Fetch live transaction context for the org ──────────────────────────
async function fetchTransactionContext(tenantId: string, dbRole: string): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${dbRole}`);

    if (dbRole === 'app_user') {
      await client.query(
        `SET LOCAL app.current_tenant = '${tenantId}'`
      );
      logger.debug({ tenantId }, 'Tenant session variable set for RLS in chat');
    }

    const result = await client.query(
      `SELECT
         COUNT(*)                                      AS total,
         SUM(amount)                                   AS total_volume,
         SUM(CASE WHEN status = 'APPROVED'  THEN 1 ELSE 0 END)  AS approved,
         SUM(CASE WHEN status = 'FLAGGED'   THEN 1 ELSE 0 END)  AS flagged,
         SUM(CASE WHEN status = 'REJECTED'  THEN 1 ELSE 0 END)  AS rejected,
         SUM(CASE WHEN status = 'PENDING'   THEN 1 ELSE 0 END)  AS pending,
         MIN(created_at)                               AS oldest_txn,
         MAX(created_at)                               AS newest_txn
       FROM transactions`
    );

    const stats = result.rows[0];

    // Recent flagged/rejected transactions (last 10)
    const recentFlagged = await client.query(
      `SELECT id, amount, status, customer_name, merchant_name, created_at
       FROM transactions
       WHERE status IN ('FLAGGED', 'REJECTED')
       ORDER BY created_at DESC
       LIMIT 10`
    );

    // Top merchants by volume
    const topMerchants = await client.query(
      `SELECT merchant_name, COUNT(*) as count, SUM(amount) as volume
       FROM transactions
       GROUP BY merchant_name
       ORDER BY volume DESC
       LIMIT 5`
    );

    await client.query('COMMIT');

    const context = `
LIVE TRANSACTION DATA CONTEXT (Scope: ${dbRole === 'app_admin' ? 'All Tenants (Admin View)' : `Tenant: ${tenantId}`}):
=============================================================
SUMMARY STATISTICS:
- Total Transactions: ${stats.total || 0}
- Total Volume: $${Number(stats.total_volume || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
- Approved: ${stats.approved || 0}
- Flagged: ${stats.flagged || 0}
- Rejected: ${stats.rejected || 0}
- Pending: ${stats.pending || 0}
- Data Range: ${stats.oldest_txn ? new Date(stats.oldest_txn).toLocaleDateString() : 'N/A'} to ${stats.newest_txn ? new Date(stats.newest_txn).toLocaleDateString() : 'N/A'}

RECENT FLAGGED / REJECTED TRANSACTIONS (last 10):
${recentFlagged.rows.length === 0 ? 'None' : recentFlagged.rows.map((t: any) =>
  `  - ID:${t.id} | ${t.status} | $${Number(t.amount).toFixed(2)} | Customer:${t.customer_name || 'N/A'} | Merchant:${t.merchant_name || 'N/A'} | Date:${new Date(t.created_at).toLocaleString()}`
).join('\n')}

TOP MERCHANTS BY VOLUME:
${topMerchants.rows.length === 0 ? 'None' : topMerchants.rows.map((m: any) =>
  `  - ${m.merchant_name}: ${m.count} txns | Volume: $${Number(m.volume).toFixed(2)}`
).join('\n')}
=============================================================`;

    return context;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Failed to fetch transaction context for RAG');
    return 'Transaction data temporarily unavailable. Please answer based on general financial risk knowledge.';
  } finally {
    client.release();
  }
}

// ── POST /api/chat ────────────────────────────────────────────────────────────
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, history = [] } = req.body;
    const { tenantId = '', dbRole = 'app_user' } = req.auth || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!API_KEY) {
      return res.status(503).json({
        reply: '⚠️ Gemini API key is not configured. Please set `gemini_api_key` in your .env file and rebuild the container.',
      });
    }

    // ── RAG: Fetch transaction context ──────────────────────────────────────
    const context = await fetchTransactionContext(tenantId, dbRole);

    // ── RAG: Load and search dataset.json context ───────────────────────────
    loadDataset();
    const knowledgeBaseContext = cachedKnowledgeBase 
      ? `\n\nCO-FOUNDERS & COMPANY KNOWLEDGE BASE PROFILE:\n${cachedKnowledgeBase}\n`
      : '';
    const datasetContext = searchDataset(message);

    // ── Build system prompt with RAG context ────────────────────────────────
    const systemPrompt = `You are Nova, an intelligent, helpful AI assistant for NewEra AI — a financial transaction risk monitoring platform.
You have access to real-time transaction data for the current organisation, and a company knowledge base containing details about co-founders (Simon Mathias, Chris Drinkwater) and company members.

${context}
${knowledgeBaseContext}
${datasetContext}

INSTRUCTIONS:
- You are allowed to answer any kind of questions from the user. Do not restrict the conversation to only transaction monitoring. Feel free to answer general knowledge questions, converse naturally, or discuss the co-founders/team members and their backgrounds.
- When answering questions about live transaction data, risk patterns, flagged/rejected transactions, and platform statistics, use the data context provided above.
- When answering questions about the company, co-founders, or team members, use the knowledge base and co-founder context.
- Keep your answers conversational, concise, and helpful. Use markdown where it improves readability.
- Format numbers, currencies, and counts clearly.
- If the user asks about details of company members/co-founders, answer fully and accurately using the context available.

CRITICAL OUTPUT RULE:
- Do NOT output any internal chain of thought, planning notes, reasoning checklist, system instructions, or metadata in your response.
- Do NOT output bullet points of your planned actions (e.g., "* User wants...", "* Acknowledge...").
- Start your response immediately with the direct answer/reply.`;

    // ── Build chat history for multi-turn ───────────────────────────────────
    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      systemInstruction: systemPrompt,
    });

    const chatHistory = history
      .filter((m: any) => m.role && m.content)
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.role === 'assistant' ? cleanMessageContent(m.content) : m.content }],
      }));

    // Gemini API requires that history starts with a user message
    const firstUserIdx = chatHistory.findIndex((m: any) => m.role === 'user');
    const cleanHistory = firstUserIdx === -1 ? [] : chatHistory.slice(firstUserIdx);

    const chat = model.startChat({
      history: cleanHistory,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    const result = await chat.sendMessage(message);
    const rawReply  = result.response.text();
    const reply = cleanMessageContent(rawReply);

    return res.json({ reply });
  } catch (err: any) {
    logger.error({ err }, 'Chat endpoint error');
    return res.status(500).json({
      reply: `⚠️ An error occurred while generating the response: ${err.message || 'Unknown error'}. Please try again.`,
    });
  }
});

export default router;
