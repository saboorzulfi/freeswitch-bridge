import ESL from "modesl";

const FS_HOST = "127.0.0.1";
const FS_PORT = 8021;
const FS_PASSWORD = "ClueCon";

const AGENT_NUMBER = "+923084283344";
const LEAD_NUMBER = "+923010000000"; // replace with actual test lead
const GATEWAY = "external::didlogic";

const conn = new ESL.Connection(FS_HOST, FS_PORT, FS_PASSWORD, () => {
  console.log("✅ Connected to FreeSWITCH ESL");
  startAgentCall(conn);
});

async function startAgentCall(con) {
  const agentUuid = generateUUID();
  console.log("📞 Starting agent call...");

  // build originate string
  const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=true,hangup_after_bridge=false,park_after_bridge=false,continue_on_fail=true,originate_timeout=30}sofia/gateway/${GATEWAY}/${AGENT_NUMBER} &park()`;
  console.log("🧾 Agent Command:", agentCmd);

  // subscribe to all events
  con.events("plain", "all");

  // start the originate
  const result = await api(con, agentCmd);
  console.log("📤 Agent originate result:", result.trim());

  if (!result.startsWith("+OK")) {
    console.log("❌ Failed to start agent call");
    return;
  }

  // wait for the real phone (B-leg) to answer
  const answered = await waitForAgentAnswer(con, agentUuid, 60000);
  if (answered) {
    console.log("✅ Agent answered! Dialing lead...");
    await callLead(con, AGENT_NUMBER, LEAD_NUMBER);
  } else {
    console.log("❌ Agent did not answer");
  }
}

function waitForAgentAnswer(con, aLegUuid, timeout) {
  return new Promise((resolve) => {
    let bLegUuid = null;
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(false);
      }
    }, timeout);

    con.on("esl::event::CHANNEL_CREATE::*", (evt) => {
      const otherLeg = evt.getHeader("Other-Leg-Unique-ID");
      const uniqueId = evt.getHeader("Unique-ID");
      if (otherLeg === aLegUuid) {
        bLegUuid = uniqueId;
        console.log(`🔄 Detected B-leg created: ${bLegUuid}`);
      }
    });

    con.on("esl::event::CHANNEL_ANSWER::*", (evt) => {
      const uniqueId = evt.getHeader("Unique-ID");
      if (uniqueId === aLegUuid || uniqueId === bLegUuid) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          console.log(`✅ Channel answered: ${uniqueId}`);
          resolve(true);
        }
      }
    });
  });
}

async function callLead(con, agentNumber, leadNumber) {
  const leadUuid = generateUUID();
  const cmd = `originate {origination_uuid=${leadUuid},ignore_early_media=true,originate_timeout=30}sofia/gateway/${GATEWAY}/${leadNumber} &bridge(sofia/gateway/${GATEWAY}/${agentNumber})`;
  console.log("📞 Dialing lead:", cmd);
  const res = await api(con, cmd);
  console.log("📤 Lead call result:", res.trim());
}

function api(con, cmd) {
  return new Promise((resolve) => {
    con.api(cmd, (res) => resolve(res.getBody()));
  });
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}