import ESL from 'modesl';
import crypto from 'crypto';

const HOST = '127.0.0.1';
const PORT = 8021;
const PASSWORD = 'ClueCon';

const AGENT_NUMBER = 'sofia/gateway/external::didlogic/+923084283344';
const LEAD_NUMBER = 'sofia/gateway/external::didlogic/+923091487321';

function generateUUID() {
  return crypto.randomUUID();
}

const conn = new ESL.Connection(HOST, PORT, PASSWORD, async () => {
  console.log('✅ Connected to FreeSWITCH ESL');
  await startCallFlow(conn);
});

async function startCallFlow(con) {
  console.log('📞 Starting agent call...');
  const agentUuid = generateUUID();

  const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=true,bypass_media=false,hangup_after_bridge=false,park_after_bridge=false,continue_on_fail=true,originate_timeout=30} ${AGENT_NUMBER} &park()`;
  console.log("🧾 Agent Command:", agentCmd);

  con.bgapi(agentCmd, async res => {
    console.log("📤 Agent originate result:", res.getBody());
    const agentAnswered = await waitForAnswer(con, agentUuid, 30000);

    if (!agentAnswered) {
      console.log("❌ Agent did not answer");
      return;
    }

    console.log("✅ Agent answered! Dialing lead...");

    const leadUuid = generateUUID();
    const leadCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=true,bypass_media=false,hangup_after_bridge=true,originate_timeout=30,leg_timeout=30,continue_on_fail=true,originate_continue_on_timeout=true} ${LEAD_NUMBER} &park()`;

    console.log("📞 Lead Command:", leadCmd);

    con.bgapi(leadCmd, async leadRes => {
      console.log("📤 Lead originate result:", leadRes.getBody());

      const leadAnswered = await waitForAnswer(con, leadUuid, 30000);
      if (!leadAnswered) {
        console.log("❌ Lead did not answer, hanging up agent...");
        con.bgapi(`uuid_kill ${agentUuid}`);
        return;
      }

      console.log("✅ Both answered — bridging with audio...");

      // ✅ This makes FreeSWITCH manage both legs (RTP + hangup)
      con.bgapi(`uuid_bridge ${agentUuid} ${leadUuid}`, bridgeRes => {
        console.log("🔗 Bridge result:", bridgeRes.getBody());
      });
    });
  });
}

function waitForAnswer(con, uuid, timeoutMs) {
  return new Promise(resolve => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, timeoutMs);

    const onAnswer = evt => {
      const chanUuid = evt.getHeader('Unique-ID');
      const eventName = evt.getHeader('Event-Name');
      if (chanUuid === uuid && eventName === "CHANNEL_ANSWER" && !resolved) {
        resolved = true;
        clearTimeout(timer);
        console.log(`✅ Channel answered: ${uuid}`);
        resolve(true);
      }
    };

    con.on('esl::event::CHANNEL_ANSWER::*', onAnswer);
  });
}
