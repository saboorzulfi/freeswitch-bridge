import ESL from 'modesl';
import crypto from 'crypto';

// ESL connection details
const HOST = '127.0.0.1';
const PORT = 8021;
const PASSWORD = 'ClueCon'; // change if different

// ✅ Use the working gateway pattern (as tested via fs_cli)
const AGENT_NUMBER = 'sofia/gateway/external::didlogic/+923084283344';
const LEAD_NUMBER  = 'sofia/gateway/external::didlogic/+923091487321';

// --- Helper: Generate UUID
function uuid() {
  return crypto.randomUUID();
}

// --- Connect to ESL
const conn = new ESL.Connection(HOST, PORT, PASSWORD, () => {
  console.log('✅ Connected to FreeSWITCH ESL');
  startCallFlow(conn).catch(err => console.error('❌ Error:', err));
});

// --- Call Flow
async function startCallFlow(con) {
  console.log('📞 Starting agent call...');
  const agentUuid = uuid();

  // Step 1: Originate agent and park
  const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=true,hangup_after_bridge=false,park_after_bridge=false,continue_on_fail=true,originate_timeout=30} ${AGENT_NUMBER} &park()`;
  con.bgapi(agentCmd, res => console.log('Agent originate result:', res.getBody()));

  const agentAnswered = await waitForAnswer(con, agentUuid, 30000);
  if (!agentAnswered) {
    console.log('❌ Agent did not answer');
    return;
  }

  console.log('✅ Agent answered. Dialing lead...');
  const leadUuid = uuid();

  // Step 2: Originate lead and park
  const leadCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=true,hangup_after_bridge=false,park_after_bridge=false,continue_on_fail=true,originate_timeout=30} ${LEAD_NUMBER} &park()`;
  con.bgapi(leadCmd, res => console.log('Lead originate result:', res.getBody()));

  const leadAnswered = await waitForAnswer(con, leadUuid, 30000);
  if (!leadAnswered) {
    console.log('❌ Lead did not answer, hanging up agent...');
    con.bgapi(`uuid_kill ${agentUuid}`);
    return;
  }

  console.log('✅ Both answered. Bridging...');
  con.bgapi(`uuid_bridge ${agentUuid} ${leadUuid}`, res => {
    console.log('🔗 Bridge result:', res.getBody());
  });
}

// --- Helper: Wait for channel answer
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
      if (chanUuid === uuid && !resolved) {
        resolved = true;
        clearTimeout(timer);
        console.log(`✅ CHANNEL_ANSWER detected for ${uuid}`);
        resolve(true);
      }
    };

    con.on('esl::event::CHANNEL_ANSWER::*', onAnswer);
  });
}
