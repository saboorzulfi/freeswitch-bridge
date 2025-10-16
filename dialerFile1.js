import ESL from "modesl";

// Configuration - Update these for your FreeSWITCH server
const FS_HOST = "127.0.0.1";
const FS_PORT = 8021;
const FS_PASSWORD = "ClueCon";

const AGENT_NUMBER = "+923084283344";
const LEAD_NUMBER = "+923234327076";
const GATEWAY = "external::didlogic";

let connection = null;
let isConnected = false;

/**
 * Connect to FreeSWITCH ESL
 */
async function connectToFreeSwitch() {
    return new Promise((resolve, reject) => {
        console.log(`🔌 Connecting to FreeSWITCH at ${FS_HOST}:${FS_PORT}`);
        
        connection = new ESL.Connection(FS_HOST, FS_PORT, FS_PASSWORD, () => {
            console.log("✅ Connected to FreeSWITCH ESL");
            isConnected = true;
            setupEventListeners();
            resolve();
        });

        connection.on('esl::error', (error) => {
            console.error("❌ ESL Connection Error:", error);
            isConnected = false;
            reject(error);
        });

        connection.on('esl::end', () => {
            console.log("🔌 ESL Connection ended");
            isConnected = false;
        });
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    console.log("🎧 Setting up event listeners...");
    
    // Subscribe to call events
    connection.events("plain", "all");
    
    connection.on("esl::event::CHANNEL_CREATE::*", (evt) => {
        const uuid = evt.getHeader("Unique-ID");
        const direction = evt.getHeader("Call-Direction");
        console.log(`🆕 Channel created: ${uuid} | Direction: ${direction}`);
    });

    connection.on("esl::event::CHANNEL_ANSWER::*", (evt) => {
        const uuid = evt.getHeader("Unique-ID");
        const direction = evt.getHeader("Call-Direction");
        const callerIdName = evt.getHeader("Caller-Caller-ID-Name");
        const callerIdNumber = evt.getHeader("Caller-Caller-ID-Number");
        console.log(`📞 Channel answered: ${uuid} | Direction: ${direction} | Caller: ${callerIdName} (${callerIdNumber})`);
    });

    connection.on("esl::event::CHANNEL_BRIDGE::*", (evt) => {
        const uuid = evt.getHeader("Unique-ID");
        console.log(`🔗 Channels bridged: ${uuid}`);
    });

    connection.on("esl::event::CHANNEL_HANGUP_COMPLETE::*", (evt) => {
        const uuid = evt.getHeader("Unique-ID");
        const cause = evt.getHeader("Hangup-Cause");
        console.log(`📴 Channel hung up: ${uuid} | Cause: ${cause}`);
    });
}

/**
 * Execute FreeSWITCH API command
 */
function api(cmd) {
    return new Promise((resolve) => {
        connection.api(cmd, (res) => resolve(res.getBody()));
    });
}

/**
 * Generate UUID
 */
function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0,
            v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Start agent call
 */
async function startAgentCall() {
    const agentUuid = generateUUID();
    console.log("📞 Starting agent call...");

    // Build originate string with proper media settings
    const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=false,hangup_after_bridge=false,park_after_bridge=false,continue_on_fail=true,originate_timeout=30,bypass_media=false,proxy_media=false}sofia/gateway/${GATEWAY}/${AGENT_NUMBER} &park()`;
    console.log("🧾 Agent Command:", agentCmd);

    // Start the originate
    const result = await api(agentCmd);
    console.log("📤 Agent originate result:", result.trim());

    if (!result.startsWith("+OK")) {
        console.log("❌ Failed to start agent call");
        return null;
    }

    return agentUuid;
}

/**
 * Wait for agent to answer
 */
function waitForAgentAnswer(agentUuid, timeout = 60000) {
    return new Promise((resolve) => {
        let answered = false;

        const timer = setTimeout(() => {
            if (!answered) {
                answered = true;
                resolve(false);
            }
        }, timeout);

        connection.on("esl::event::CHANNEL_ANSWER::*", (evt) => {
            const uuid = evt.getHeader("Unique-ID");
            if (uuid === agentUuid && !answered) {
                answered = true;
                clearTimeout(timer);
                console.log(`✅ Agent answered: ${uuid}`);
                resolve(true);
            }
        });
    });
}

/**
 * Call lead and bridge
 */
async function callLead(agentUuid) {
    const leadUuid = generateUUID();
    
    console.log(`📞 Dialing lead: ${LEAD_NUMBER}`);
    
    // Step 1: originate the lead and park it with proper media settings
    const leadCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=true,originate_timeout=30}sofia/gateway/${GATEWAY}/${LEAD_NUMBER} &park()`;
    console.log("🧾 Lead Command:", leadCmd);
    
    const res = await api(leadCmd);
    console.log("📤 Lead originate result:", res.trim());
    
    if (!res.startsWith("+OK")) {
        console.log("❌ Failed to originate lead");
        return;
    }
    
    // Step 2: Wait until the lead answers
    const answered = await waitForLeadAnswer(leadUuid, 60000);
    if (!answered) {
        console.log("❌ Lead did not answer");
        return;
    }
    
    // Step 3: When lead answers, bridge with agent
    console.log(`🔗 Bridging agent (${agentUuid}) <-> lead (${leadUuid})`);
    
    // Check media status before bridging
    const agentMedia = await api(`uuid_dump ${agentUuid}`);
    const leadMedia = await api(`uuid_dump ${leadUuid}`);
    console.log("🎧 Agent media status:", agentMedia.includes("media") ? "Active" : "Inactive");
    console.log("🎧 Lead media status:", leadMedia.includes("media") ? "Active" : "Inactive");
    
    const bridgeRes = await api(`uuid_bridge ${agentUuid} ${leadUuid}`);
    console.log("📤 Bridge result:", bridgeRes.trim());
    
    if (bridgeRes.startsWith("+OK")) {
        console.log("✅ Bridge successful! Audio should now be flowing between agent and lead.");
    } else {
        console.log("❌ Bridge failed:", bridgeRes);
    }
}

/**
 * Wait for lead to answer
 */
function waitForLeadAnswer(leadUuid, timeout = 60000) {
    return new Promise((resolve) => {
        let answered = false;

        const timer = setTimeout(() => {
            if (!answered) {
                answered = true;
                resolve(false);
            }
        }, timeout);

        connection.on("esl::event::CHANNEL_ANSWER::*", (evt) => {
            const uuid = evt.getHeader("Unique-ID");
            if (uuid === leadUuid && !answered) {
                answered = true;
                clearTimeout(timer);
                console.log(`✅ Lead answered: ${uuid}`);
                resolve(true);
            }
        });
    });
}

/**
 * Main function to start call flow
 */
async function startCallFlow() {
    try {
        console.log("🚀 Starting Call Flow");
        console.log("====================");
        console.log(`Agent: ${AGENT_NUMBER}`);
        console.log(`Lead: ${LEAD_NUMBER}`);
        console.log(`Gateway: ${GATEWAY}`);
        console.log("");

        // Connect to FreeSWITCH
        await connectToFreeSwitch();

        // Start agent call
        const agentUuid = await startAgentCall();
        if (!agentUuid) {
            console.log("❌ Failed to start agent call");
            return;
        }

        // Wait for agent to answer
        const agentAnswered = await waitForAgentAnswer(agentUuid, 60000);
        if (agentAnswered) {
            console.log("✅ Agent answered! Dialing lead...");
            await callLead(agentUuid);
        } else {
            console.log("❌ Agent did not answer");
        }

    } catch (error) {
        console.error("❌ Call flow failed:", error);
    }
}

/**
 * Graceful shutdown
 */
function shutdown() {
    console.log("🛑 Shutting down...");
    if (connection) {
        connection.close();
    }
    process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the call flow
startCallFlow();
