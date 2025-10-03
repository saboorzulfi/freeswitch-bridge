import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../core/logger.js';
import { eslClient } from '../core/esl.js';
import PreviewDialerService from '../services/dialer.js';
import AgentsRepository from '../services/repositories/agents.js';
import LeadsRepository from '../services/repositories/leads.js';
import { config } from '../core/config.js';

const bodySchema = z.object({
  agents: z.array(z.string()).min(1),
  lead: z.string()
});

function toDialStringsFromAgents(agentsDocsOrNumbers) {
  const prefix = config.dialer.agentPrefix;
  return agentsDocsOrNumbers.map((a) => typeof a === 'string' ? `${prefix}${a}` : `${prefix}${a.number}`);
}

function toDialStringForLead(leadDocOrNumber) {
  const prefix = config.dialer.leadPrefix;
  return typeof leadDocOrNumber === 'string' ? `${prefix}${leadDocOrNumber}` : `${prefix}${leadDocOrNumber.number}`;
}

export function buildRoutes() {
  const router = Router();

  router.get('/health', (req, res) => res.json({ ok: true }));

  router.post('/api/dial', async (req, res) => {
    try {
      const parsed = bodySchema.parse(req.body);
      const agentDialStrings = toDialStringsFromAgents(parsed.agents.map(n => ({ number: n })));
      const leadDialString = toDialStringForLead(parsed.lead);

      const con = eslClient.getCon();
      const dialer = new PreviewDialerService(con);
      const result = await dialer.dialLeadWithAgents(agentDialStrings, leadDialString);
      return res.json(result);
    } catch (err) {
      logger.error({ err }, 'Error handling /dial');
      return res.status(400).json({ error: err.message });
    }
  });

  return router;
}

export default buildRoutes;

