import { Router, Request, Response } from 'express';
import { getPool } from '../db/pool';
import { getRedisClient } from '../redis/client';
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
  const client = await pool.connect();

  try {
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
      conditions.push(`status = $${paramIdx++}::transaction_status`);
      params.push(status);
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
      `SELECT id, tenant_id, amount, status, created_at, customer_name, location, merchant_name
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
    await client.query('ROLLBACK');
    logger.error({ err, dbRole }, 'Error fetching transactions');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/stats
 * Returns KPI summary statistics.
 */
router.get('/stats', async (req: Request, res: Response) => {
  const { dbRole, tenantId } = req.auth;
  const pool   = getPool();
  const redis  = await getRedisClient();
  const client = await pool.connect();

  try {
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

    await client.query('COMMIT');

    // Queue depth from Redis (admin only)
    let queueDepth = 0;
    if (dbRole === 'app_admin') {
      try {
        queueDepth = await redis.lLen('transactions:queue');
      } catch (err) {
        logger.warn({ err }, 'Could not fetch queue depth from Redis');
      }
    }

    // Per-tenant breakdown (admin only)
    let tenantBreakdown: any[] = [];
    if (dbRole === 'app_admin') {
      const tbClient = await pool.connect();
      try {
        await tbClient.query('BEGIN');
        await tbClient.query('SET LOCAL ROLE app_admin');
        const tbResult = await tbClient.query(`
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
        await tbClient.query('COMMIT');
        tenantBreakdown = tbResult.rows;
      } finally {
        tbClient.release();
      }
    }

    // AI insights caching
    const cacheKey = `api:stats:insights:${dbRole}:${tenantId || 'global'}`;
    let aiInsights = {
      total: 'Total number of transactions processed by the risk engine.',
      approval_rate: 'Percentage of transactions successfully cleared.',
      rejection_rate: 'Percentage of transactions blocked due to high risk.',
      flagged: 'Transactions currently held for manual investigator review.',
      total_volume: 'Aggregate dollar volume processed in the current period.'
    };

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        aiInsights = JSON.parse(cached);
      } else {
        const apiKey = process.env.gemini_api_key || process.env.GEMINI_API_KEY;
        if (apiKey) {
          const stats = statsResult.rows[0];
          const totalCount = parseInt(stats.total, 10);
          const pendingCount = parseInt(stats.pending, 10);
          const rejectedCount = parseInt(stats.rejected, 10);
          const rejectionRate = (totalCount - pendingCount) > 0 
            ? ((rejectedCount / (totalCount - pendingCount)) * 100).toFixed(1)
            : '0.0';

          const prompt = `
            You are a banking risk data analyst for NewEra AI.
            Analyze these live merchant statistics and write a short, highly professional, single-sentence insight (max 15 words) for each metric explaining what the current state means.
            Metrics:
            - Total Transactions: ${stats.total}
            - Approval Rate: ${stats.approval_rate}%
            - Rejection Rate: ${rejectionRate}%
            - Flagged Transactions: ${stats.flagged}
            - Total Volume: $${Number(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}

            Format your output as a raw JSON object (no markdown, no backticks, no other text) with these exact keys:
            {
              "total": "insight about total count",
              "approval_rate": "insight about approval rate",
              "rejection_rate": "insight about rejection rate",
              "flagged": "insight about flagged risk",
              "total_volume": "insight about total volume"
            }
          `;

          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
          const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          });

          if (response.ok) {
            const resData = await response.json() as any;
            const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedText);
            if (parsed.total && parsed.approval_rate && parsed.rejection_rate && parsed.flagged && parsed.total_volume) {
              aiInsights = parsed;
              await redis.setEx(cacheKey, 60, JSON.stringify(aiInsights));
            }
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load/generate AI KPI insights');
    }

    logger.info({ path: '/api/stats', status: 200 }, 'Response sent');

    res.json({
      ...statsResult.rows[0],
      queue_depth:       queueDepth,
      tenant_breakdown:  tenantBreakdown,
      chart_data:        chartResult.rows,
      ai_insights:       aiInsights,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Error fetching stats');
    res.status(500).json({ error: 'Failed to fetch stats' });
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${dbRole}`);
    if (dbRole === 'app_user') {
      await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    }

    const result = await client.query(
      `SELECT id, tenant_id, amount, status, created_at, customer_name, location, merchant_name
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
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
    await client.query('ROLLBACK');
    logger.error({ err, id }, 'Error generating AI explanation');
    res.status(500).json({ error: 'Internal server error while generating explanation' });
  } finally {
    client.release();
  }
});

export default router;
