import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import { generateUuid, originateParked, waitForAnswer, uuidBridge, uuidKill, originateLeg } from '../utils/originate.js';
import CallLogsRepository from './repositories/callLogs.js';

export class PreviewDialerService {
  constructor(con) {
    this.con = con;
    this.repo = new CallLogsRepository();
  }

  async dialLeadWithAgents(agentDestinations, leadDestination) {
    const { maxRounds, agentRingSeconds, leadRingSeconds } = config.dialer;

    for (let round = 1; round <= maxRounds; round++) {
      logger.info({ round }, 'Starting agent round');
      for (const agentDest of agentDestinations) {
        const agentUuid = generateUuid();
        logger.info({ agentDest, agentUuid }, 'Originating to agent');
        await this.repo.logAttempt({ round, role: 'agent', destination: agentDest, uuid: agentUuid });
        await originateParked(this.con, agentDest, {
          origination_uuid: agentUuid,
          ignore_early_media: 'true',
          hangup_after_bridge: 'true',
          call_direction: 'outbound',
          originate_timeout: agentRingSeconds,
          effective_caller_id_number: config.dialer.didNumber,
          origination_caller_id_number: config.dialer.didNumber,
          rtp_timeout: '60',
          rtp_hold_timeout: '60',
          media_timeout: '60',
        });

        const agentAnswered = await waitForAnswer(this.con, agentUuid, agentRingSeconds * 1000);
        if (!agentAnswered) {
          logger.info({ agentDest, agentUuid }, 'Agent no-answer');
          await this.repo.logOutcome({ round, role: 'agent', destination: agentDest, uuid: agentUuid, outcome: 'no-answer' });
          await uuidKill(this.con, agentUuid);
          continue;
        }

        // Agent answered; now call the lead
        const leadUuid = generateUuid();
        logger.info({ leadDestination, leadUuid }, 'Originating to lead');
        await this.repo.logAttempt({ round, role: 'lead', destination: leadDestination, uuid: leadUuid, agentUuid });
        await originateParked(this.con, leadDestination, {
          origination_uuid: leadUuid,
          ignore_early_media: 'true',
          hangup_after_bridge: 'true',
          call_direction: 'outbound',
          originate_timeout: leadRingSeconds,
          effective_caller_id_number: config.dialer.didNumber,
          origination_caller_id_number: config.dialer.didNumber,
          rtp_timeout: '60',
          rtp_hold_timeout: '60',
          media_timeout: '60',
        });

        const leadAnswered = await waitForAnswer(this.con, leadUuid, leadRingSeconds * 1000);
        if (!leadAnswered) {
          logger.info({ leadDestination, leadUuid }, 'Lead no-answer');
          await this.repo.logOutcome({ round, role: 'lead', destination: leadDestination, uuid: leadUuid, outcome: 'no-answer', agentUuid });
          await uuidKill(this.con, leadUuid);
          await uuidKill(this.con, agentUuid);
          continue;
        }

        // Both answered; bridge
        logger.info({ agentUuid, leadUuid }, 'Bridging agent and lead');
        await uuidBridge(this.con, agentUuid, leadUuid);
        await this.repo.logOutcome({ round, role: 'bridge', destination: 'agent<->lead', outcome: 'bridged', agentUuid, leadUuid });
        return { disposition: 'bridged', agent: agentDest, roundsTried: round };
      }
    }
    await this.repo.logOutcome({ role: 'campaign', outcome: 'unanswered' });
    return { disposition: 'unanswered' };
  }
}

export default PreviewDialerService;

