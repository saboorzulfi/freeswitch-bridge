import ESL from 'modesl';
import crypto from 'crypto';

const HOST = '127.0.0.1';
const PORT = 8021;
const PASSWORD = 'ClueCon'; // change if your ESL password is different

// ✅ Use exactly the same working format from your CLI test
const AGENT_NUMBER = 'sofia/gateway/external::didlogic/+923084283344';
const LEAD_NUMBER  = 'sofia/gateway/external::didlogic/+923091487321';

// --- Generate unique IDs
function uuid() {
  return crypto.randomUUID();
}

// --- Connect to ESL
const conn = new ESL.Connection(HOST, PORT, PASSWORD, () => {
  console.log('✅ Connected to FreeSWITCH ESL');
  startCallFlow(conn).catch(err => console.error('❌ Error:', err));
});

// --- Core Call Flow
async function startCallFlow(con) {
  console.log('📞 Starting agent call...');
  const agentUuid = uuid();

  // ⚡ NO SPACE after the variables block
  const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=true,hangup_after_bridge=false,park_after_bridge=false,continue_on_fail=true,originate_timeout=30}${AGENT_NUMBER} &park()`;

  console.log('🧾 Agent Command:', agentCmd);
  con.bgapi(agentCmd, res => console.log('📤 Agent originate result:', res.getBody()));

  const agentAnswered = await waitForAnswer(con, agentUuid, 30000);
  if (!agentAnswered) {
    console.log('❌ Agent did not answer');
    return;
  }

  console.log('✅ Agent answered. Dialing lead...');
  const leadUuid = uuid();

  // ⚡ Same no-space format here too
  const leadCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=true,hangup_after_bridge=false,park_after_bridge=false,continue_on_fail=true,originate_timeout=30}${LEAD_NUMBER} &park()`;

  console.log('🧾 Lead Command:', leadCmd);
  con.bgapi(leadCmd, res => console.log('📤 Lead originate result:', res.getBody()));

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

// --- Helper: Wait for answer events
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
