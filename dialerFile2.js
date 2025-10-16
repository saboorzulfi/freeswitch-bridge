import ESL from "modesl";

// Configuration - Update these for your FreeSWITCH server
const FS_HOST = "127.0.0.1";
const FS_PORT = 8021;
const FS_PASSWORD = "ClueCon";

const AGENT_NUMBER = "+923084283344";
const LEAD_NUMBER = "+971502472077";
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
        const callerIdName = evt.getHeader("Caller-Caller-ID-Name");
        const callerIdNumber = evt.getHeader("Caller-Caller-ID-Number");
        console.log(`🆕 Channel created: ${uuid} | Direction: ${direction} | Caller: ${callerIdName} (${callerIdNumber})`);
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
        const otherUuid = evt.getHeader("Other-Leg-Unique-ID");
        console.log(`🔗 Channels bridged: ${uuid} <-> ${otherUuid}`);
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
 * Start agent call with direct bridge approach
 */
async function startAgentCall() {
    const agentUuid = generateUUID();
    console.log("📞 Starting agent call...");

    // Use a more direct approach - originate agent and wait for answer
    const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=false,hangup_after_bridge=false,continue_on_fail=true,originate_timeout=30,bypass_media=false,proxy_media=false}sofia/gateway/${GATEWAY}/${AGENT_NUMBER} &echo()`;
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
 * Call lead and bridge using originate with bridge
 */
async function callLeadAndBridge(agentUuid) {
    const leadUuid = generateUUID();
    
    console.log(`📞 Dialing lead and bridging: ${LEAD_NUMBER}`);
    
    // Use originate with bridge - this should handle media properly
    const bridgeCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=true,originate_timeout=30}sofia/gateway/${GATEWAY}/${LEAD_NUMBER} &bridge(sofia/gateway/${GATEWAY}/${AGENT_NUMBER})`;
    console.log("🧾 Bridge Command:", bridgeCmd);
    
    const res = await api(bridgeCmd);
    console.log("📤 Bridge originate result:", res.trim());
    
    if (!res.startsWith("+OK")) {
        console.log("❌ Failed to bridge calls");
        return false;
    }
    
    return true;
}

/**
 * Alternative approach: Use uuid_bridge after both calls are established
 */
async function callLeadSeparate(agentUuid) {
    const leadUuid = generateUUID();
    
    console.log(`📞 Dialing lead separately: ${LEAD_NUMBER}`);
    
    // Originate lead with park
    const leadCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=false,originate_timeout=30}sofia/gateway/${GATEWAY}/${LEAD_NUMBER} &park()`;
    console.log("🧾 Lead Command:", leadCmd);
    
    const res = await api(leadCmd);
    console.log("📤 Lead originate result:", res.trim());
    
    if (!res.startsWith("+OK")) {
        console.log("❌ Failed to originate lead");
        return false;
    }
    
    // Wait for lead to answer
    const answered = await waitForLeadAnswer(leadUuid, 60000);
    if (!answered) {
        console.log("❌ Lead did not answer");
        return false;
    }
    
    // Bridge the calls
    console.log(`🔗 Bridging agent (${agentUuid}) <-> lead (${leadUuid})`);
    
    // Check media status before bridging
    try {
        const agentMedia = await api(`uuid_dump ${agentUuid}`);
        const leadMedia = await api(`uuid_dump ${leadUuid}`);
        console.log("🎧 Agent media status:", agentMedia.includes("media") ? "Active" : "Inactive");
        console.log("🎧 Lead media status:", leadMedia.includes("media") ? "Active" : "Inactive");
    } catch (error) {
        console.log("⚠️ Could not check media status:", error.message);
    }
    
    const bridgeRes = await api(`uuid_bridge ${agentUuid} ${leadUuid}`);
    console.log("📤 Bridge result:", bridgeRes.trim());
    
    if (bridgeRes.startsWith("+OK")) {
        console.log("✅ Bridge successful! Audio should now be flowing between agent and lead.");
        return true;
    } else {
        console.log("❌ Bridge failed:", bridgeRes);
        return false;
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
        console.log("🚀 Starting Call Flow (Audio-Fixed Version)");
        console.log("==========================================");
        console.log(`Agent: ${AGENT_NUMBER}`);
        console.log(`Lead: ${LEAD_NUMBER}`);
        console.log(`Gateway: ${GATEWAY}`);
        console.log("");

        // Connect to FreeSWITCH
        await connectToFreeSwitch();

        // Method 1: Try direct bridge approach
        console.log("🔄 Trying Method 1: Direct Bridge Approach");
        const success = await callLeadAndBridge(null);
        
        if (success) {
            console.log("✅ Method 1 successful!");
            return;
        }

        console.log("❌ Method 1 failed, trying Method 2...");

        // Method 2: Separate calls then bridge
        console.log("🔄 Trying Method 2: Separate Calls + Bridge");
        
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
            await callLeadSeparate(agentUuid);
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
