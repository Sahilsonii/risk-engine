import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pool } from 'pg';
import logger from '../logger';

const router = Router();

// ── DB Pool (reuse from transactions if possible, else new) ──────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT  || '5432', 10),
  user:     process.env.DB_USER     || 'api_service',
  password: process.env.DB_PASS     || 'api_service_pass',
  database: process.env.DB_NAME     || 'risk_engine',
});

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
  const cleaned: string[] = [];

  const metaKeywords = [
    'user question', 'snippet', 'event:', 'action:', 'personal effort:', 
    'raised over', 'additional effort:', 'purpose:', 'what did chris',
    'user asks', 'user role', 'ai role', 'current state', 'available data',
    'knowledge base', 'role:', 'context:', 'identity:', 'focus:', 'achievement:',
    'location:', 'key traits:', 'education:', 'mission:', 'constraint:',
    'tone:', 'style:', 'the system prompt', 'the instructions', 'since there is no',
    'i must be honest', 'however, to be', 'rule:', 'crucially:', 'context is',
    'expert ai risk analyst', 'rag-enhanced'
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    
    // Check if the line matches any meta keyword
    const isMeta = metaKeywords.some(keyword => {
      if (keyword.endsWith(':')) {
        return lower.includes(keyword) || 
               (trimmed.startsWith('*') && lower.includes(keyword.replace(':', '')));
      }
      return lower.includes(keyword);
    });

    if (isMeta) {
      continue; // skip the metadata/reasoning line
    }

    cleaned.push(line);
  }

  return cleaned
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();
}

// ── RAG: Fetch live transaction context for the org ──────────────────────────
async function fetchTransactionContext(tenantId: string, dbRole: string): Promise<string> {
  try {
    const isStatsAdmin = dbRole === 'app_admin';
    const whereClause = isStatsAdmin ? 'WHERE 1=1' : 'WHERE tenant_id = $1';
    const params = isStatsAdmin ? [] : [tenantId];

    const result = await pool.query(
      `SELECT
         COUNT(*)                                      AS total,
         SUM(amount)                                   AS total_volume,
         SUM(CASE WHEN status = 'APPROVED'  THEN 1 ELSE 0 END)  AS approved,
         SUM(CASE WHEN status = 'FLAGGED'   THEN 1 ELSE 0 END)  AS flagged,
         SUM(CASE WHEN status = 'REJECTED'  THEN 1 ELSE 0 END)  AS rejected,
         SUM(CASE WHEN status = 'PENDING'   THEN 1 ELSE 0 END)  AS pending,
         MIN(created_at)                               AS oldest_txn,
         MAX(created_at)                               AS newest_txn
       FROM transactions
       ${whereClause}`,
      params
    );

    const stats = result.rows[0];

    // Recent flagged/rejected transactions (last 10)
    const recentFlagged = await pool.query(
      `SELECT id, amount, status, customer_name, merchant_name, created_at
       FROM transactions
       ${isStatsAdmin ? "WHERE status IN ('FLAGGED', 'REJECTED')" : "WHERE tenant_id = $1 AND status IN ('FLAGGED', 'REJECTED')"}
       ORDER BY created_at DESC
       LIMIT 10`,
      params
    );

    // Top merchants by volume
    const topMerchants = await pool.query(
      `SELECT merchant_name, COUNT(*) as count, SUM(amount) as volume
       FROM transactions
       ${isStatsAdmin ? "WHERE 1=1" : "WHERE tenant_id = $1"}
       GROUP BY merchant_name
       ORDER BY volume DESC
       LIMIT 5`,
      params
    );

    const context = `
LIVE TRANSACTION DATA CONTEXT (Scope: ${isStatsAdmin ? 'All Tenants (Admin View)' : `Tenant: ${tenantId}`}):
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
    logger.error({ err }, 'Failed to fetch transaction context for RAG');
    return 'Transaction data temporarily unavailable. Please answer based on general financial risk knowledge.';
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
    const systemPrompt = `You are an expert AI Risk Analyst for a financial transaction risk management platform called NewEra AI.
You have access to real-time transaction data for the current organisation via a RAG (Retrieval-Augmented Generation) system.

${context}
${knowledgeBaseContext}
${datasetContext}

INSTRUCTIONS:
- Always base your answers on the live transaction data OR the co-founder/company knowledge base provided above
- If asked about co-founders (Simon Mathias, Chris Drinkwater), New Era AI, Stellar Energy UK, CRM automation (GoHighLevel, GHL), use the knowledge base or dataset context
- Be concise, precise, and data-driven in your responses
- Format numbers clearly (currency, percentages, counts)
- If asked about trends, analyse the flagged/rejected patterns
- Use markdown formatting where helpful (bold for key figures, bullet points for lists)
- If the data/knowledge base doesn't contain enough information to answer confidently, say so clearly
- Never fabricate transaction IDs or amounts not present in the data
- You are speaking to a merchant/analyst user, so maintain a professional but approachable tone
- CRITICAL: Output ONLY the direct response/message content to the user. Do NOT output any chain-of-thought, internal reasoning, planning bullet points, checklist notes, or user/system prompt metadata. Your output must start directly with your response text.`;

    // ── Build chat history for multi-turn ───────────────────────────────────
    const model = genAI.getGenerativeModel({
      model: 'gemma-4-31b-it',
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
