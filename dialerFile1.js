import ESL from "modesl";

const FS_HOST = "127.0.0.1";
const FS_PORT = 8021;
const FS_PASSWORD = "ClueCon";

// Configuration - Update these values for your setup
const CONFIG = {
    agentNumbers: ["+923084283344"], // Add more agent numbers
    gateway: "external::didlogic",
    didNumber: "442039960029", // Your DID number
    accountId: "your_account_id", // Your account ID
    widgetId: "demo_widget"
};

class CallBridgeServer {
    constructor() {
        this.connection = null;
        this.activeCalls = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * Start the call bridge server
     */
    async start() {
        console.log("🚀 Starting Call Bridge Server...");
        console.log("=====================================");
        
        try {
            await this.connectToFreeSwitch();
            this.setupEventListeners();
            this.startHealthCheck();
            console.log("✅ Call Bridge Server started successfully!");
        } catch (error) {
            console.error("❌ Failed to start server:", error);
            this.scheduleReconnect();
        }
    }

    /**
     * Connect to FreeSWITCH ESL
     */
    async connectToFreeSwitch() {
        return new Promise((resolve, reject) => {
            console.log(`🔌 Connecting to FreeSWITCH at ${FS_HOST}:${FS_PORT}`);
            
            this.connection = new ESL.Connection(FS_HOST, FS_PORT, FS_PASSWORD, () => {
                console.log("✅ Connected to FreeSWITCH ESL");
                this.isConnected = true;
                this.reconnectAttempts = 0;
                resolve();
            });

            this.connection.on('esl::error', (error) => {
                console.error("❌ ESL Connection Error:", error);
                this.isConnected = false;
                reject(error);
            });

            this.connection.on('esl::end', () => {
                console.log("🔌 ESL Connection ended");
                this.isConnected = false;
                this.scheduleReconnect();
            });
        });
    }

    /**
     * Setup event listeners for call events
     */
    setupEventListeners() {
        console.log("🎧 Setting up event listeners...");
        
        // Subscribe to call events
        this.connection.events("plain", "all");
        
        this.connection.on("esl::event::CHANNEL_CREATE::*", (evt) => {
            this.handleChannelCreate(evt);
        });

        this.connection.on("esl::event::CHANNEL_ANSWER::*", (evt) => {
            this.handleChannelAnswer(evt);
        });

        this.connection.on("esl::event::CHANNEL_BRIDGE::*", (evt) => {
            this.handleChannelBridge(evt);
        });

        this.connection.on("esl::event::CHANNEL_HANGUP_COMPLETE::*", (evt) => {
            this.handleChannelHangup(evt);
        });
    }

    /**
     * Handle channel create events
     */
    handleChannelCreate(evt) {
        const uuid = evt.getHeader("Unique-ID");
        const callDirection = evt.getHeader("Call-Direction");
        const originationId = evt.getHeader("variable_call_origination_id");
        
        console.log(`🆕 Channel created: ${uuid} | Direction: ${callDirection}`);
        
        if (originationId && this.activeCalls.has(originationId)) {
            const callInfo = this.activeCalls.get(originationId);
            callInfo.channels.push({
                uuid,
                direction: callDirection,
                createdAt: new Date()
            });
        }
    }

    /**
     * Handle channel answer events
     */
    handleChannelAnswer(evt) {
        const uuid = evt.getHeader("Unique-ID");
        const callDirection = evt.getHeader("Call-Direction");
        const originationId = evt.getHeader("variable_call_origination_id");
        
        console.log(`📞 Channel answered: ${uuid} | Direction: ${callDirection}`);
        
        if (originationId && this.activeCalls.has(originationId)) {
            const callInfo = this.activeCalls.get(originationId);
            
            if (callDirection === "inbound") {
                console.log(`👨‍💼 Agent answered: ${uuid}`);
                callInfo.agentAnswered = true;
                callInfo.agentUuid = uuid;
                
                // Start calling the lead
                this.callLead(originationId);
            } else if (callDirection === "outbound") {
                console.log(`👤 Lead answered: ${uuid}`);
                callInfo.leadAnswered = true;
                callInfo.leadUuid = uuid;
                
                // Bridge the calls
                this.bridgeCalls(originationId);
            }
        }
    }

    /**
     * Handle channel bridge events
     */
    handleChannelBridge(evt) {
        const uuid = evt.getHeader("Unique-ID");
        const originationId = evt.getHeader("variable_call_origination_id");
        
        console.log(`🔗 Channels bridged: ${uuid}`);
        
        if (originationId && this.activeCalls.has(originationId)) {
            const callInfo = this.activeCalls.get(originationId);
            callInfo.status = "bridged";
            callInfo.bridgedAt = new Date();
            console.log(`✅ Call ${originationId} is now bridged between agent and lead`);
        }
    }

    /**
     * Handle channel hangup events
     */
    handleChannelHangup(evt) {
        const uuid = evt.getHeader("Unique-ID");
        const hangupCause = evt.getHeader("Hangup-Cause");
        const originationId = evt.getHeader("variable_call_origination_id");
        
        console.log(`📴 Channel hung up: ${uuid} | Cause: ${hangupCause}`);
        
        if (originationId && this.activeCalls.has(originationId)) {
            const callInfo = this.activeCalls.get(originationId);
            callInfo.status = "completed";
            callInfo.hangupCause = hangupCause;
            callInfo.completedAt = new Date();
            
            console.log(`📴 Call ${originationId} completed. Cause: ${hangupCause}`);
            console.log(`📊 Call Duration: ${this.calculateDuration(callInfo.startedAt, callInfo.completedAt)}`);
            
            // Remove from active calls
            this.activeCalls.delete(originationId);
        }
    }

    /**
     * Start a call flow (main entry point)
     */
    async startCall(leadNumber, leadName, widgetId) {
        if (!this.isConnected) {
            throw new Error("Not connected to FreeSWITCH");
        }

        const originationId = this.generateOriginationId();
        
        console.log(`🚀 Starting call flow:`);
        console.log(`   Lead: ${leadName} (${leadNumber})`);
        console.log(`   Widget: ${widgetId}`);
        console.log(`   Origination ID: ${originationId}`);
        
        // Store call info
        this.activeCalls.set(originationId, {
            originationId,
            leadNumber,
            leadName,
            widgetId,
            status: "initiating",
            startedAt: new Date(),
            channels: [],
            agentAnswered: false,
            leadAnswered: false
        });
        
        try {
            // Start calling agents
            await this.callAgents(originationId, leadNumber, leadName, widgetId);
            
            console.log(`✅ Call initiated successfully`);
            return { success: true, originationId };
            
        } catch (error) {
            console.error(`❌ Failed to initiate call:`, error);
            this.activeCalls.delete(originationId);
            return { success: false, error: error.message };
        }
    }

    /**
     * Call agents (equivalent to Go's agent selection)
     */
    async callAgents(originationId, leadNumber, leadName, widgetId) {
        const agentNumber = CONFIG.agentNumbers[0]; // Use first agent for demo
        const agentUuid = this.generateUUID();
        
        console.log(`📞 Calling agent: ${agentNumber}`);
        
        // Build originate command for agent
        const agentCmd = `originate {
            origination_uuid=${agentUuid},
            ignore_early_media=true,
            hangup_after_bridge=false,
            park_after_bridge=false,
            continue_on_fail=true,
            originate_timeout=30,
            call_origination_id=${originationId},
            lead_number=${leadNumber},
            lead_name=${encodeURIComponent(leadName)},
            widget_id=${widgetId},
            account_id=${CONFIG.accountId},
            outbound_did_number=${CONFIG.didNumber}
        }sofia/gateway/${CONFIG.gateway}/${agentNumber} &park()`;
        
        console.log("🧾 Agent Command:", agentCmd);
        
        const result = await this.api(agentCmd);
        console.log("📤 Agent originate result:", result.trim());
        
        if (!result.startsWith("+OK")) {
            throw new Error("Failed to start agent call");
        }
        
        // Store agent UUID
        const callInfo = this.activeCalls.get(originationId);
        callInfo.agentUuid = agentUuid;
    }

    /**
     * Call lead when agent answers
     */
    async callLead(originationId) {
        const callInfo = this.activeCalls.get(originationId);
        if (!callInfo) return;
        
        const leadUuid = this.generateUUID();
        
        console.log(`📞 Dialing lead: ${callInfo.leadNumber}`);
        
        // Build originate command for lead
        const leadCmd = `originate {
            origination_uuid=${leadUuid},
            ignore_early_media=true,
            bypass_media=false,
            proxy_media=false,
            hangup_after_bridge=true,
            originate_timeout=30,
            call_origination_id=${originationId},
            lead_leg=true
        }sofia/gateway/${CONFIG.gateway}/${callInfo.leadNumber} &park()`;
        
        console.log("🧾 Lead Command:", leadCmd);
        
        const result = await this.api(leadCmd);
        console.log("📤 Lead originate result:", result.trim());
        
        if (!result.startsWith("+OK")) {
            console.log("❌ Failed to originate lead");
            return;
        }
        
        // Store lead UUID
        callInfo.leadUuid = leadUuid;
    }

    /**
     * Bridge agent and lead calls
     */
    async bridgeCalls(originationId) {
        const callInfo = this.activeCalls.get(originationId);
        if (!callInfo || !callInfo.agentUuid || !callInfo.leadUuid) return;
        
        console.log(`🔗 Bridging agent (${callInfo.agentUuid}) <-> lead (${callInfo.leadUuid})`);
        
        const bridgeResult = await this.api(`uuid_bridge ${callInfo.agentUuid} ${callInfo.leadUuid}`);
        console.log("📤 Bridge result:", bridgeResult.trim());
    }

    /**
     * Execute FreeSWITCH API command
     */
    api(cmd) {
        return new Promise((resolve) => {
            this.connection.api(cmd, (res) => resolve(res.getBody()));
        });
    }

    /**
     * Generate UUID
     */
    generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0,
                v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Generate origination ID
     */
    generateOriginationId() {
        return 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Calculate call duration
     */
    calculateDuration(startTime, endTime) {
        const duration = endTime - startTime;
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    /**
     * Get active calls status
     */
    getActiveCalls() {
        return Array.from(this.activeCalls.values());
    }

    /**
     * Start health check
     */
    startHealthCheck() {
        setInterval(() => {
            if (this.isConnected) {
                console.log(`💓 Server Health: Connected | Active Calls: ${this.activeCalls.size}`);
            } else {
                console.log("💔 Server Health: Disconnected");
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Schedule reconnection
     */
    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
            
            setTimeout(() => {
                console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                this.start().catch(() => {
                    // Reconnection failed, will try again
                });
            }, delay);
        } else {
            console.error("❌ Max reconnection attempts reached. Server stopped.");
            process.exit(1);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log("🛑 Shutting down Call Bridge Server...");
        
        if (this.connection) {
            this.connection.close();
        }
        
        console.log("✅ Server shutdown complete");
        process.exit(0);
    }
}

// Create server instance
const server = new CallBridgeServer();

// Start the server
server.start().catch((error) => {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
});

// Demo function - start a test call
async function runDemo() {
    // Wait for server to be ready
    setTimeout(async () => {
        console.log("\n🚀 Starting demo call...");
        
        const result = await server.startCall(
            "+923234327076",  // Lead number
            "John Doe",       // Lead name
            "demo_widget"     // Widget ID
        );
        
        if (result.success) {
            console.log(`✅ Demo call started with ID: ${result.originationId}`);
        } else {
            console.error(`❌ Demo call failed: ${result.error}`);
        }
    }, 5000); // Wait 5 seconds for server to be ready
}

// Run demo if this file is executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
    runDemo();
// }

// Handle graceful shutdown
process.on('SIGINT', () => {
    server.shutdown();
});

process.on('SIGTERM', () => {
    server.shutdown();
});

export default CallBridgeServer;
