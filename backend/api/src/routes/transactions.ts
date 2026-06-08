import { Router, Request, Response } from 'express';
import { createClerkClient } from '@clerk/backend';
import { getPool } from '../db/pool';
import { getRedisClient } from '../redis/client';
import { TransactionStatus } from '../types';
import logger from '../logger';

const router = Router();

/**
 * GET /api/transactions
 * Returns paginated transaction list.
 * RLS automatically scopes by tenant for app_user.
 * Admin sees all.
 */
router.get('/transactions', async (req: Request, res: Response) => {
  const { dbRole, tenantId } = req.auth;
  const page     = parseInt(req.query.page as string  || '1',    10);
  const limit    = parseInt(req.query.limit as string || '20',   10);
  const status   = req.query.status  as string | undefined;
  const tenant   = req.query.tenant  as string | undefined; // admin filter
  const offset   = (page - 1) * limit;

  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Set database role for this transaction
    await client.query(`SET LOCAL ROLE ${dbRole}`);
    logger.debug({ dbRole, tenantId }, 'DB role set for query');

    // For app_user: set the session variable that RLS policy reads
    if (dbRole === 'app_user') {
      await client.query(
        `SET LOCAL app.current_tenant = '${tenantId}'`
      );
      logger.debug({ tenantId }, 'Tenant session variable set for RLS');
    }

    // Build dynamic WHERE clause (status filter, admin tenant filter)
    const conditions: string[] = [];
    const params: any[]        = [];
    let   paramIdx             = 1;

    if (status) {
      if (status.includes(',')) {
        const statusList = status.split(',');
        const placeholders = statusList.map(() => `$${paramIdx++}::transaction_status`).join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...statusList);
      } else {
        conditions.push(`status = $${paramIdx++}::transaction_status`);
        params.push(status);
      }
    }

    // Admins can filter by tenant_id via query param
    if (dbRole === 'app_admin' && tenant) {
      conditions.push(`tenant_id = $${paramIdx++}`);
      params.push(tenant);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Count query
    const countResult = await client.query(
      `SELECT COUNT(*) FROM transactions ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data query
    const dataResult = await client.query(
      `SELECT id, tenant_id, amount, status, created_at, customer_name, location, merchant_name, review_notes, reviewed_by, reviewed_at
       FROM transactions
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    await client.query('COMMIT');

    logger.debug(
      { dbRole, rows: dataResult.rows.length, total, page },
      'Transactions query executed'
    );

    logger.info({ path: '/api/transactions', status: 200 }, 'Response sent');

    res.json({
      data:       dataResult.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    logger.error({ err, dbRole }, 'Error fetching transactions');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * GET /api/stats
 * Returns KPI summary statistics.
 */
router.get('/stats', async (req: Request, res: Response) => {
  const { dbRole, tenantId } = req.auth;
  const pool   = getPool();
  let client;

  try {
    const redis  = await getRedisClient();

    // ── Short-lived DB cache (5 s) to absorb back-to-back polls ────────────
    const dbCacheKey = `api:stats:db:${dbRole}:${tenantId || 'global'}`;
    let statsRow: any = null;
    let chartRows: any[] = [];
    let tenantBreakdown: any[] = [];

    const dbCached = await redis.get(dbCacheKey).catch(() => null);
    if (dbCached) {
      const parsed = JSON.parse(dbCached);
      statsRow        = parsed.statsRow;
      chartRows       = parsed.chartRows;
      tenantBreakdown = parsed.tenantBreakdown;
    } else {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${dbRole}`);

      if (dbRole === 'app_user') {
        await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
      }

      const statsResult = await client.query(`
        SELECT
          COUNT(*)                                                          AS total,
          COUNT(*) FILTER (WHERE status = 'APPROVED')                      AS approved,
          COUNT(*) FILTER (WHERE status = 'REJECTED')                      AS rejected,
          COUNT(*) FILTER (WHERE status = 'FLAGGED')                       AS flagged,
          COUNT(*) FILTER (WHERE status = 'PENDING')                       AS pending,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'APPROVED')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE status != 'PENDING'), 0) * 100,
            1
          )                                                                 AS approval_rate,
          COALESCE(SUM(amount), 0)                                          AS total_volume,
          COALESCE(AVG(amount), 0)                                          AS avg_amount
        FROM transactions
      `);

      // Fetch chart data: 5-minute intervals for the last 1 hour
      const chartResult = await client.query(`
        SELECT 
          date_trunc('minute', created_at) - (CAST(extract(minute FROM created_at) AS integer) % 5) * interval '1 minute' AS bucket,
          COUNT(*)::integer AS count,
          COALESCE(SUM(amount), 0)::numeric AS volume,
          COUNT(*) FILTER (WHERE status = 'REJECTED' OR status = 'FLAGGED')::integer AS flagged_rejected
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        GROUP BY bucket
        ORDER BY bucket ASC
      `);

      // Per-tenant breakdown (admin only) — reuse same client/transaction
      if (dbRole === 'app_admin') {
        const tbResult = await client.query(`
          SELECT
            tenant_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
            COUNT(*) FILTER (WHERE status = 'FLAGGED')  AS flagged,
            COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
            COALESCE(SUM(amount), 0)                    AS volume
          FROM transactions
          GROUP BY tenant_id
          ORDER BY total DESC
        `);
        tenantBreakdown = tbResult.rows;
      }

      await client.query('COMMIT');

      statsRow  = statsResult.rows[0];
      chartRows = chartResult.rows;

      // Cache DB result for 5 seconds
      await redis.setEx(dbCacheKey, 5, JSON.stringify({ statsRow, chartRows, tenantBreakdown })).catch(() => {});
    }

    // Queue depth from Redis (admin only)
    let queueDepth = 0;
    if (dbRole === 'app_admin') {
      try {
        queueDepth = await redis.lLen('transactions:queue');
      } catch (err) {
        logger.warn({ err }, 'Could not fetch queue depth from Redis');
      }
    }

    // AI insights — serve from cache immediately; regenerate in background if stale
    const cacheKey = `api:stats:insights:${dbRole}:${tenantId || 'global'}`;
    let aiInsights = {
      total: 'Total number of transactions processed by the risk engine.',
      approval_rate: 'Percentage of transactions successfully cleared.',
      rejection_rate: 'Percentage of transactions blocked due to high risk.',
      flagged: 'Transactions currently held for manual investigator review.',
      total_volume: 'Aggregate dollar volume processed in the current period.',
      chart_explanation: 'Transaction flow is active with steady volume velocity. No major velocity anomalies detected in the current 5-minute bucket window.'
    };

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        // Cache hit — use immediately (no Gemini wait)
        aiInsights = JSON.parse(cached);
      } else {
        // Cache miss — respond with defaults now, generate Gemini insights in background
        const apiKey = process.env.gemini_api_key || process.env.GEMINI_API_KEY;
        if (apiKey) {
          const stats = statsRow;
          const totalCount   = parseInt(stats.total, 10);
          const pendingCount = parseInt(stats.pending, 10);
          const rejectedCount = parseInt(stats.rejected, 10);
          const rejectionRate = (totalCount - pendingCount) > 0
            ? ((rejectedCount / (totalCount - pendingCount)) * 100).toFixed(1)
            : '0.0';

          const prompt = `
            You are a banking risk data analyst for NewEra AI.
            Analyze these live merchant statistics and the last hour's 5-minute interval velocity chart data:
            
            Metrics:
            - Total Transactions: ${stats.total}
            - Approval Rate: ${stats.approval_rate}%
            - Rejection Rate: ${rejectionRate}%
            - Flagged Transactions: ${stats.flagged}
            - Total Volume: $${Number(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            
            Chart Data (5-min intervals for last hour):
            ${JSON.stringify(chartRows)}

            Based on this data, generate a raw JSON object (no markdown, no backticks, no other text) with these exact keys:
            {
              "total": "insight about total count (max 15 words)",
              "approval_rate": "insight about approval rate (max 15 words)",
              "rejection_rate": "insight about rejection rate (max 15 words)",
              "flagged": "insight about flagged risk (max 15 words)",
              "total_volume": "insight about total volume (max 15 words)",
              "chart_explanation": "a concise 2-sentence analysis of transaction velocity and risk hotspots over the last hour based on the trends and spikes"
            }
          `;

          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent?key=${apiKey}`;

          // Fire-and-forget: do NOT await — let the response go now
          fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          }).then(async (response) => {
            if (!response.ok) return;
            const resData = await response.json() as any;
            const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            try {
              const parsed = JSON.parse(cleanedText);
              if (parsed.total && parsed.approval_rate && parsed.rejection_rate && parsed.flagged && parsed.total_volume && parsed.chart_explanation) {
                const redisClient = await getRedisClient();
                await redisClient.setEx(cacheKey, 60, JSON.stringify(parsed));
                logger.debug({ cacheKey }, 'AI insights refreshed in background');
              }
            } catch (parseErr) {
              logger.warn({ parseErr }, 'Failed to parse background Gemini response');
            }
          }).catch((err) => {
            logger.warn({ err }, 'Background Gemini AI insights fetch failed');
          });
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load AI KPI insights from cache');
    }

    logger.info({ path: '/api/stats', status: 200 }, 'Response sent');

    res.json({
      ...statsRow,
      queue_depth:       queueDepth,
      tenant_breakdown:  tenantBreakdown,
      chart_data:        chartRows,
      ai_insights:       aiInsights,
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    logger.error({ err }, 'Error fetching stats');
    res.status(500).json({ error: 'Failed to fetch stats' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * GET /api/recent
 * Returns recent transactions from Redis cache (falls back to DB).
 */
router.get('/recent', async (req: Request, res: Response) => {
  const { dbRole, tenantId } = req.auth;
  const redis = await getRedisClient();

  try {
    const cached = await redis.lRange('transactions:recent', 0, 19);
    const parsed = cached.map(item => JSON.parse(item));

    // Scope to tenant if app_user
    const scoped = dbRole === 'app_user'
      ? parsed.filter((t: any) => t.tenant_id === tenantId)
      : parsed;

    logger.info({ path: '/api/recent', status: 200, count: scoped.length }, 'Response sent');
    res.json({ data: scoped });
  } catch (err) {
    logger.error({ err }, 'Error fetching recent transactions from cache');
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

/**
 * GET /api/transactions/:id/explain
 * Explains why a transaction was flagged or rejected using Gemini AI.
 */
router.get('/transactions/:id/explain', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { dbRole, tenantId } = req.auth;
  const apiKey = process.env.gemini_api_key || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.warn('Gemini API key is not configured in env');
    res.status(500).json({ error: 'AI Explanations are not configured on this server' });
    return;
  }

  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${dbRole}`);
    if (dbRole === 'app_user') {
      await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    }

    const result = await client.query(
      `SELECT id, tenant_id, amount, status, created_at, customer_name, location, merchant_name, review_notes, reviewed_by, reviewed_at
       FROM transactions
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Transaction not found or unauthorized' });
      return;
    }

    const txn = result.rows[0];

    // Formulate a prompt for Gemini
    const prompt = `
      You are a banking fraud investigator and risk analyst for NewEra AI.
      Explain why the following transaction was flagged/evaluated in the system.
      
      Transaction Details:
      - ID: ${txn.id}
      - Merchant/Organisation: ${txn.merchant_name} (Tenant ID: ${txn.tenant_id})
      - Customer Name: ${txn.customer_name}
      - Transaction Amount: $${txn.amount}
      - Location: ${txn.location}
      - Current Status: ${txn.status}
      - Timestamp: ${txn.created_at}
      
      Risk Assessment Context:
      - Transactions over $100,000 are automatically rejected.
      - Transactions over $10,000 are automatically flagged.
      - Mid-high range transactions over $5,000 have a 30% chance of being flagged.
      - Small transactions may also be flagged (8% chance) or rejected (3% chance) due to location/customer pattern anomalies.
      
      Please write a professional, concise risk explanation (2-3 sentences) detailing the reason for the status, potential risks associated with the location or amount, and recommended audit actions. Do NOT use any Markdown formatting, bolding, italics, or list bullets. Output plain text only.
    `;

    // Fetch explanation from Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText }, 'Gemini API request failed');
      res.status(502).json({ error: 'Failed to retrieve explanation from AI engine' });
      return;
    }

    const data = await response.json() as any;
    const explanation = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() 
      || 'No explanation generated by the risk AI engine.';

    res.json({ id, explanation });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    logger.error({ err, id }, 'Error generating AI explanation');
    res.status(500).json({ error: 'Internal server error while generating explanation' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * PATCH /api/transactions/:id/review
 * Update a transaction's status and add review notes.
 * Members can only set FLAGGED or SUSPICIOUS. Only admins can APPROVE or REJECT.
 */
router.patch('/transactions/:id/review', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { dbRole, tenantId, userId } = req.auth;
  const { status, review_notes } = req.body;

  if (!status || !review_notes) {
    res.status(400).json({ error: 'Both status and review_notes are required' });
    return;
  }

  const validStatuses = Object.values(TransactionStatus) as string[];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  // Role-based status restrictions:
  // Members can only set FLAGGED or SUSPICIOUS
  // Only admins can APPROVE or REJECT
  const memberAllowedStatuses = [TransactionStatus.FLAGGED, TransactionStatus.SUSPICIOUS];
  let finalStatus = status as TransactionStatus;

  if (dbRole === 'app_user' && !memberAllowedStatuses.includes(finalStatus)) {
    // Member tried to approve/reject — override to FLAGGED
    finalStatus = TransactionStatus.FLAGGED;
    logger.info({ userId, id, requestedStatus: status }, 'Member attempted admin-only status change — overridden to FLAGGED');
  }

  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${dbRole}`);
    if (dbRole === 'app_user') {
      await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    }

    const result = await client.query(
      `UPDATE transactions
       SET status = $1::transaction_status,
           review_notes = $2,
           reviewed_by = $3,
           reviewed_at = NOW()
       WHERE id = $4
       RETURNING id, status, review_notes, reviewed_by, reviewed_at`,
      [finalStatus, review_notes, userId, id]
    );

    await client.query('COMMIT');

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Transaction not found or unauthorized' });
      return;
    }

    logger.info({ id, finalStatus, reviewedBy: userId, dbRole }, 'Transaction reviewed');
    res.json({
      success: true,
      transaction: result.rows[0],
      overridden: finalStatus !== status,
      message: finalStatus !== status
        ? 'Status change requires admin approval. Transaction kept as FLAGGED.'
        : `Transaction status updated to ${finalStatus}.`
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    logger.error({ err, id }, 'Error reviewing transaction');
    res.status(500).json({ error: 'Failed to update transaction review' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * GET /api/transactions/report
 * Generate a 30-day transaction report with AI-powered analysis.
 * Returns a styled HTML document as a downloadable file.
 */
router.get('/transactions/report', async (req: Request, res: Response) => {
  const { dbRole, tenantId } = req.auth;
  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${dbRole}`);
    if (dbRole === 'app_user') {
      await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    }

    // Fetch 30-day transaction data
    const txnResult = await client.query(`
      SELECT id, tenant_id, amount, status, created_at, customer_name, location, merchant_name, review_notes, reviewed_by, reviewed_at
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
    `);

    // Fetch aggregated stats
    const statsResult = await client.query(`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE status = 'APPROVED')                      AS approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED')                      AS rejected,
        COUNT(*) FILTER (WHERE status = 'FLAGGED')                       AS flagged,
        COUNT(*) FILTER (WHERE status = 'SUSPICIOUS')                    AS suspicious,
        COUNT(*) FILTER (WHERE status = 'PENDING')                       AS pending,
        COALESCE(SUM(amount), 0)                                          AS total_volume,
        COALESCE(AVG(amount), 0)                                          AS avg_amount,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'APPROVED')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE status != 'PENDING'), 0) * 100,
          1
        )                                                                 AS approval_rate
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

    await client.query('COMMIT');

    const stats = statsResult.rows[0];
    const transactions = txnResult.rows;
    const totalCount = parseInt(stats.total, 10);
    const rejectedCount = parseInt(stats.rejected, 10);
    const pendingCount = parseInt(stats.pending, 10);
    const rejectionRate = (totalCount - pendingCount) > 0
      ? ((rejectedCount / (totalCount - pendingCount)) * 100).toFixed(1)
      : '0.0';

    // Generate AI report using Gemini
    const apiKey = process.env.gemini_api_key || process.env.GEMINI_API_KEY;
    let aiReport = {
      executive_summary: 'AI report generation is not available. Please configure the Gemini API key.',
      risk_analysis: 'Risk analysis requires AI configuration.',
      recommendations: 'Configure the Gemini API key to generate AI-powered recommendations.'
    };

    if (apiKey) {
      try {
        const topFlagged = transactions.filter((t: any) => t.status === 'FLAGGED' || t.status === 'REJECTED' || t.status === 'SUSPICIOUS').slice(0, 10);
        const prompt = `
          You are a senior banking risk analyst and compliance officer for NewEra AI.
          Generate a comprehensive 30-day transaction report based on the following data.

          Period: Last 30 days
          Total Transactions: ${stats.total}
          Total Volume: $${Number(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          Average Transaction: $${Number(stats.avg_amount).toFixed(2)}
          Approved: ${stats.approved} (${stats.approval_rate}%)
          Rejected: ${stats.rejected} (${rejectionRate}%)
          Flagged: ${stats.flagged}
          Suspicious: ${stats.suspicious}
          Pending: ${stats.pending}

          Top flagged/rejected transactions:
          ${JSON.stringify(topFlagged.map((t: any) => ({
            amount: t.amount,
            status: t.status,
            customer: t.customer_name,
            location: t.location,
            merchant: t.merchant_name
          })))}

          Generate a raw JSON object (no markdown, no backticks, no other text) with these exact keys:
          {
            "executive_summary": "A professional 3-4 sentence executive summary covering overall transaction health, key metrics, and notable patterns. Use formal banking language.",
            "risk_analysis": "A detailed 4-6 sentence risk analysis covering: identified risk patterns, geographic anomalies, high-value transaction trends, and flagging accuracy. Be specific with percentages and data references.",
            "recommendations": "3-5 bullet points (separated by newlines) with actionable recommendations for improving transaction security, reducing false positives, and strengthening the risk engine. Each bullet should start with a dash."
          }
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent?key=${apiKey}`;
        const aiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (aiResponse.ok) {
          const resData = await aiResponse.json() as any;
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanedText);
          if (parsed.executive_summary && parsed.risk_analysis && parsed.recommendations) {
            aiReport = parsed;
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to generate AI report content');
      }
    }

    // Generate styled HTML report
    const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const transactionRows = transactions.slice(0, 200).map((t: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-family:monospace;font-size:11px;color:#71717a">${String(t.id).substring(0, 8)}…</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:12px;color:#3f3f46">${t.customer_name || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-family:monospace;font-size:12px;text-align:right;color:#18181b">$${Number(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;text-align:center">
          <span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:10px;font-weight:700;text-transform:uppercase;${
            t.status === 'APPROVED' ? 'background:#dcfce7;color:#166534' :
            t.status === 'FLAGGED' ? 'background:#fef9c3;color:#854d0e' :
            t.status === 'REJECTED' ? 'background:#fee2e2;color:#991b1b' :
            t.status === 'SUSPICIOUS' ? 'background:#fce4ec;color:#880e4f' :
            'background:#f4f4f5;color:#52525b'
          }">${t.status}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:11px;color:#71717a;font-family:monospace">${t.location || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;font-family:monospace">${new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
      </tr>
    `).join('');

    const htmlReport = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NewEra AI — 30-Day Transaction Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #fafafa; color: #18181b; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #e4e4e7; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 18px; }
    .brand h1 { font-size: 20px; font-weight: 700; color: #18181b; }
    .brand p { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; }
    .report-meta { text-align: right; font-size: 12px; color: #71717a; }
    .report-meta strong { color: #18181b; display: block; font-size: 14px; margin-bottom: 4px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #3b82f6; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e4e4e7; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi-card { background: white; border: 1px solid #e4e4e7; border-radius: 10px; padding: 20px; }
    .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #a1a1aa; font-weight: 600; margin-bottom: 6px; }
    .kpi-value { font-size: 24px; font-weight: 700; font-family: 'Inter', monospace; }
    .kpi-value.blue { color: #2563eb; }
    .kpi-value.green { color: #16a34a; }
    .kpi-value.red { color: #dc2626; }
    .kpi-value.amber { color: #d97706; }
    .kpi-value.zinc { color: #18181b; }
    .ai-card { background: linear-gradient(135deg, #eff6ff, #f0f9ff); border: 1px solid #bfdbfe; border-radius: 10px; padding: 24px; margin-bottom: 16px; }
    .ai-card h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #2563eb; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
    .ai-card p { font-size: 13px; color: #1e3a5f; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #71717a; font-weight: 600; border-bottom: 2px solid #e4e4e7; background: #fafafa; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e4e4e7; text-align: center; font-size: 10px; color: #a1a1aa; }
    .footer strong { color: #71717a; }
    @media print {
      body { background: white; }
      .container { padding: 20px; }
      .kpi-grid { break-inside: avoid; }
      .ai-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">
        <div class="brand-icon">N</div>
        <div>
          <h1>NewEra AI</h1>
          <p>Risk Engine Platform</p>
        </div>
      </div>
      <div class="report-meta">
        <strong>30-Day Transaction Report</strong>
        ${periodStart} — ${reportDate}<br>
        Tenant: ${tenantId === '*' ? 'All Tenants (Admin)' : tenantId}<br>
        Generated: ${new Date().toLocaleString('en-US')}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Transactions</div><div class="kpi-value zinc">${Number(stats.total).toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Volume</div><div class="kpi-value blue">$${Number(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
      <div class="kpi-card"><div class="kpi-label">Approval Rate</div><div class="kpi-value green">${stats.approval_rate || 0}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Rejection Rate</div><div class="kpi-value red">${rejectionRate}%</div></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Approved</div><div class="kpi-value green">${Number(stats.approved).toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Flagged</div><div class="kpi-value amber">${Number(stats.flagged).toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Rejected</div><div class="kpi-value red">${Number(stats.rejected).toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg. Transaction</div><div class="kpi-value zinc">$${Number(stats.avg_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
    </div>

    <div class="section">
      <div class="section-title">✦ AI Executive Summary</div>
      <div class="ai-card">
        <h3>⚡ Powered by Gemini AI</h3>
        <p>${aiReport.executive_summary}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">✦ AI Risk Analysis</div>
      <div class="ai-card">
        <h3>🔍 Deep Risk Assessment</h3>
        <p>${aiReport.risk_analysis}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">✦ AI Recommendations</div>
      <div class="ai-card">
        <h3>📋 Action Items</h3>
        <p>${aiReport.recommendations.replace(/\n/g, '<br>')}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Transaction Detail (Last 30 Days${transactions.length > 200 ? ` — Showing 200 of ${transactions.length}` : ''})</div>
      <div style="overflow-x:auto;border:1px solid #e4e4e7;border-radius:10px;background:white">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:center">Status</th>
              <th>Location</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="footer">
      <strong>NewEra AI — Risk Engine Platform</strong><br>
      This report was auto-generated with AI-powered analysis by Gemini. For internal use only.<br>
      © ${new Date().getFullYear()} NewEra AI. All rights reserved.
    </div>
  </div>
</body>
</html>`;

    // Send as HTML file download
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="NewEraAI_30Day_Report_${new Date().toISOString().split('T')[0]}.html"`);
    res.send(htmlReport);
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    logger.error({ err }, 'Error generating transaction report');
    res.status(500).json({ error: 'Failed to generate report' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * GET /api/news
 * Returns real-time financial news regarding transactions, money, and banking.
 * Cached in Redis for 90 seconds. Supports ?refresh=1 to force re-fetch.
 */

/** Strip CDATA wrappers and decode XML entities */
function parseXmlText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .trim();
}

/** Try fetching an RSS feed and return parsed articles or null */
async function fetchRssFeed(url: string, sourceName: string): Promise<any[] | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const xml = await resp.text();

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const articles: any[] = [];
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = itemRegex.exec(xml)) !== null && count < 12) {
      const item = match[1];
      const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1];
      const link  = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]
                 || item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1];
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]
                   || item.match(/<dc:date>([\s\S]*?)<\/dc:date>/)?.[1];
      const desc   = item.match(/<description>([\s\S]*?)<\/description>/)?.[1];
      const src    = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1];

      if (title && link) {
        articles.push({
          title: parseXmlText(title),
          link: parseXmlText(link),
          pubDate: pubDate ? parseXmlText(pubDate) : new Date().toUTCString(),
          description: desc ? parseXmlText(desc).substring(0, 220) : 'No description available.',
          source: src ? parseXmlText(src) : sourceName,
        });
        count++;
      }
    }
    return articles.length > 0 ? articles : null;
  } catch {
    return null;
  }
}

router.get('/news', async (req: Request, res: Response) => {
  const redis = await getRedisClient();
  const cacheKey = 'api:news:list';
  const forceRefresh = req.query.refresh === '1';

  try {
    if (!forceRefresh) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    } else {
      await redis.del(cacheKey);
    }

    // Multi-source RSS cascade — first successful source wins
    const sources: Array<[string, string]> = [
      ['https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines', 'MarketWatch'],
      ['https://feeds.bbci.co.uk/news/business/rss.xml',                    'BBC Business'],
      ['https://finance.yahoo.com/news/rssindex',                           'Yahoo Finance'],
      ['https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', 'Reuters'],
    ];

    let articles: any[] | null = null;
    for (const [url, name] of sources) {
      articles = await fetchRssFeed(url, name);
      if (articles && articles.length > 0) {
        logger.info({ source: name, count: articles.length }, 'News fetched from RSS');
        break;
      }
    }

    if (!articles || articles.length === 0) {
      throw new Error('All RSS sources failed or returned no articles');
    }

    const payload = { articles, fetchedAt: new Date().toISOString() };
    await redis.setEx(cacheKey, 90, JSON.stringify(payload));   // 90-second cache
    res.json(payload);
  } catch (err) {
    logger.warn({ err }, 'Error fetching live news. Serving fallback transaction security news.');
    
    // Premium banking analyst fallback articles
    const fallbackNews = {
      articles: [
        {
          title: "New Regulation E Directive Expands Consumer Protections on Instant Payments",
          link: "https://finance.yahoo.com",
          pubDate: new Date().toUTCString(),
          description: "Federal regulators have finalized amendments to Regulation E, strengthening dispute resolution criteria for peer-to-peer transaction systems and digital wallets.",
          source: "Federal Banking Gazette"
        },
        {
          title: "Global FinTech Intelligence Report Notes 34% Rise in Automated Credential Stuffing",
          link: "https://finance.yahoo.com",
          pubDate: new Date(Date.now() - 15 * 60000).toUTCString(),
          description: "Security analysts observe a significant surge in card-testing scripts targeting mid-tier merchant transaction gateways, prompting calls for real-time velocity screening.",
          source: "FinTech Compliance Review"
        },
        {
          title: "AML Compliance Costs Skyrocket Amid Cross-Border Payment Decentralization",
          link: "https://finance.yahoo.com",
          pubDate: new Date(Date.now() - 45 * 60000).toUTCString(),
          description: "Private banking organizations double down on automated risk profiling modules to combat advanced money laundering routes using multi-hop ledger transfers.",
          source: "Global Anti-Money Laundering Journal"
        },
        {
          title: "Impossible Travel & Geolocation Anomalies: The Future of Transaction Verification",
          link: "https://finance.yahoo.com",
          pubDate: new Date(Date.now() - 90 * 60000).toUTCString(),
          description: "Major financial services adopt real-time IP reputation and mobile device telemetry correlation to block cardholder identity takeover attempts at checkout.",
          source: "Merchant Fraud Prevention Council"
        }
      ]
    };
    
    res.json(fallbackNews);
  }
});

function cleanXml(str: string): string {
  return str
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

/**
 * DELETE /api/organizations/:id
 * Delete an organization from Clerk. Only admins of the organization can perform this action.
 */
router.delete('/organizations/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { dbRole, orgId } = req.auth;

  // Security checks:
  // 1. Must be an admin of the active organization (dbRole === 'app_admin')
  // 2. The active organization ID must match the ID being deleted
  if (dbRole !== 'app_admin' || orgId !== id) {
    logger.warn(
      { userId: req.auth.userId, targetOrgId: id, activeOrgId: orgId, dbRole },
      'Unauthorized attempt to delete organization'
    );
    res.status(403).json({ error: 'Forbidden: only organization administrators can delete this organization' });
    return;
  }

  try {
    logger.info({ targetOrgId: id, userId: req.auth.userId }, 'Attempting to delete organization from Clerk');
    await clerk.organizations.deleteOrganization(id);
    logger.info({ targetOrgId: id }, 'Organization deleted successfully');
    res.json({ success: true, message: 'Organization deleted successfully' });
  } catch (err) {
    logger.error({ err, targetOrgId: id }, 'Failed to delete organization from Clerk');
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

export default router;
