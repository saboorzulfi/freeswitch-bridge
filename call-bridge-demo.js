const ESL = require('modesl');
const fs = require('fs');

/**
 * FreeSWITCH Call Bridge Demo
 * 
 * This script demonstrates how to:
 * 1. Connect to FreeSWITCH via ESL
 * 2. Call agents via SIP trunk
 * 3. Bridge agents with leads
 * 4. Handle call events
 * 
 * Based on Go backend's call flow analysis
 */

class FreeSwitchCallBridge {
    constructor(config) {
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 8021,
            password: config.password || 'ClueCon',
            ...config
        };
        
        this.connection = null;
        this.activeCalls = new Map();
        this.agentNumbers = config.agentNumbers || [];
        this.didNumber = config.didNumber || '';
        this.accountId = config.accountId || 'default';
    }

    /**
     * Connect to FreeSWITCH ESL
     */
    async connect() {
        return new Promise((resolve, reject) => {
            console.log(`🔌 Connecting to FreeSWITCH at ${this.config.host}:${this.config.port}`);
            
            this.connection = new ESL.Connection(this.config.host, this.config.port, this.config.password);
            
            this.connection.on('esl::ready', () => {
                console.log('✅ Connected to FreeSWITCH ESL');
                this.setupEventListeners();
                resolve();
            });
            
            this.connection.on('esl::error', (error) => {
                console.error('❌ ESL Connection Error:', error);
                reject(error);
            });
            
            this.connection.on('esl::end', () => {
                console.log('🔌 ESL Connection ended');
            });
        });
    }

    /**
     * Setup event listeners for call events
     */
    setupEventListeners() {
        console.log('🎧 Setting up event listeners...');
        
        // Listen for call events
        this.connection.subscribe('CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE CHANNEL_BRIDGE');
        
        this.connection.on('esl::event::*', (event) => {
            this.handleCallEvent(event);
        });
    }

    /**
     * Handle FreeSWITCH call events
     */
    handleCallEvent(event) {
        const eventName = event.getHeader('Event-Name');
        const uuid = event.getHeader('Unique-ID');
        const callDirection = event.getHeader('Call-Direction');
        const hangupCause = event.getHeader('Hangup-Cause');
        
        console.log(`📞 Event: ${eventName} | UUID: ${uuid} | Direction: ${callDirection}`);
        
        switch (eventName) {
            case 'CHANNEL_CREATE':
                console.log(`🆕 Channel created: ${uuid}`);
                break;
                
            case 'CHANNEL_ANSWER':
                console.log(`📞 Channel answered: ${uuid}`);
                this.handleChannelAnswer(uuid, event);
                break;
                
            case 'CHANNEL_BRIDGE':
                console.log(`🔗 Channels bridged: ${uuid}`);
                this.handleChannelBridge(uuid, event);
                break;
                
            case 'CHANNEL_HANGUP_COMPLETE':
                console.log(`📴 Channel hung up: ${uuid} | Cause: ${hangupCause}`);
                this.handleChannelHangup(uuid, event);
                break;
        }
    }

    /**
     * Handle when a channel answers
     */
    handleChannelAnswer(uuid, event) {
        const callDirection = event.getHeader('Call-Direction');
        const originationId = event.getHeader('variable_call_origination_id');
        
        if (callDirection === 'inbound') {
            console.log(`👨‍💼 Agent answered: ${uuid}`);
            // Agent answered, now bridge to lead
            this.bridgeToLead(uuid, originationId);
        } else if (callDirection === 'outbound') {
            console.log(`👤 Lead answered: ${uuid}`);
            // Lead answered, call is now bridged
        }
    }

    /**
     * Handle when channels are bridged
     */
    handleChannelBridge(uuid, event) {
        console.log(`🔗 Call bridged successfully: ${uuid}`);
        const originationId = event.getHeader('variable_call_origination_id');
        
        if (this.activeCalls.has(originationId)) {
            const callInfo = this.activeCalls.get(originationId);
            callInfo.status = 'bridged';
            callInfo.bridgedAt = new Date();
            console.log(`✅ Call ${originationId} is now bridged between agent and lead`);
        }
    }

    /**
     * Handle when a channel hangs up
     */
    handleChannelHangup(uuid, event) {
        const originationId = event.getHeader('variable_call_origination_id');
        const hangupCause = event.getHeader('Hangup-Cause');
        
        if (this.activeCalls.has(originationId)) {
            const callInfo = this.activeCalls.get(originationId);
            callInfo.status = 'completed';
            callInfo.hangupCause = hangupCause;
            callInfo.completedAt = new Date();
            
            console.log(`📴 Call ${originationId} completed. Cause: ${hangupCause}`);
            console.log(`📊 Call Duration: ${this.calculateDuration(callInfo.startedAt, callInfo.completedAt)}`);
            
            // Remove from active calls
            this.activeCalls.delete(originationId);
        }
    }

    /**
     * Start a call flow (equivalent to Go's CallLead function)
     */
    async startCall(leadNumber, leadName, widgetId) {
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
            status: 'initiating',
            startedAt: new Date(),
            agentNumbers: [...this.agentNumbers]
        });
        
        try {
            // Generate FreeSWITCH originate command (similar to Go's campaignDialString)
            const dialString = this.generateDialString(originationId, leadNumber, leadName, widgetId);
            
            console.log(`📞 Executing FreeSWITCH command:`);
            console.log(`   ${dialString}`);
            
            // Execute the originate command
            const result = await this.executeCommand(dialString);
            
            console.log(`✅ Call initiated successfully`);
            return { success: true, originationId, result };
            
        } catch (error) {
            console.error(`❌ Failed to initiate call:`, error);
            this.activeCalls.delete(originationId);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate FreeSWITCH dial string (equivalent to Go's campaignDialString)
     */
    generateDialString(originationId, leadNumber, leadName, widgetId) {
        const contactPrefix = `sofia/gateway/${this.accountId}/`;
        
        // Build agent legs (similar to Go's agentLegs)
        const agentLegs = this.agentNumbers.map((agentNumber, index) => {
            return `[agent_leg=true,agent_number=${agentNumber},agent_id=agent_${index}]${contactPrefix}${agentNumber}`;
        });
        
        // Generate universal variables (similar to Go's universal string)
        const universalVars = {
            'ignore_early_media': 'true',
            'continue_on_fail': 'true',
            'originate_continue_on_timeout': 'true',
            'hangup_after_bridge': 'false',
            'originate_timeout': '20',
            'origination_caller_id_name': this.didNumber,
            'origination_caller_id_number': this.didNumber,
            'outbound_did_number': this.didNumber,
            'widget_id': widgetId,
            'call_type': 'round_robin',
            'call_origination_id': originationId,
            'account_id': this.accountId,
            'lead_number': leadNumber,
            'source_type': 'website',
            'lead_name': encodeURIComponent(leadName),
            'total_agents': this.agentNumbers.length
        };
        
        // Convert to FreeSWITCH format
        const universalString = Object.entries(universalVars)
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        
        // Join agent legs (use comma for parallel ringing)
        const agentLegsString = agentLegs.join(',');
        
        // Generate final FreeSWITCH command
        return `bgapi originate {${universalString}}${agentLegsString} BridgeToLead XML default`;
    }

    /**
     * Bridge to lead (equivalent to Go's BridgeToLead XML)
     */
    async bridgeToLead(agentUuid, originationId) {
        const callInfo = this.activeCalls.get(originationId);
        if (!callInfo) {
            console.error(`❌ No call info found for origination ID: ${originationId}`);
            return;
        }
        
        console.log(`🔗 Bridging agent ${agentUuid} to lead ${callInfo.leadNumber}`);
        
        const contactPrefix = `sofia/gateway/${this.accountId}/`;
        const bridgeCommand = `uuid_bridge ${agentUuid} [lead_leg=true]${contactPrefix}${callInfo.leadNumber}`;
        
        try {
            const result = await this.executeCommand(bridgeCommand);
            console.log(`✅ Bridge command executed: ${result}`);
        } catch (error) {
            console.error(`❌ Failed to bridge call:`, error);
        }
    }

    /**
     * Execute FreeSWITCH command
     */
    async executeCommand(command) {
        return new Promise((resolve, reject) => {
            this.connection.api(command, (response) => {
                if (response.getBody()) {
                    resolve(response.getBody());
                } else {
                    reject(new Error('Command execution failed'));
                }
            });
        });
    }

    /**
     * Generate unique origination ID
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
     * Disconnect from FreeSWITCH
     */
    disconnect() {
        if (this.connection) {
            console.log('🔌 Disconnecting from FreeSWITCH...');
            this.connection.close();
        }
    }
}

/**
 * Demo usage
 */
async function runDemo() {
    console.log('🎯 FreeSWITCH Call Bridge Demo');
    console.log('================================');
    
    // Configuration (update these values for your setup)
    const config = {
        host: 'localhost',           // FreeSWITCH host
        port: 8021,                  // ESL port
        password: 'ClueCon',         // ESL password
        accountId: 'your_account_id', // Your account ID (used as gateway name)
        didNumber: '442039960029',    // Your DID number
        agentNumbers: [              // Agent phone numbers
            '+923084283344',
        ]
    };
    
    const callBridge = new FreeSwitchCallBridge(config);
    
    try {
        // Connect to FreeSWITCH
        await callBridge.connect();
        
        // Start a demo call
        console.log('\n🚀 Starting demo call...');
        const result = await callBridge.startCall(
            '+923234327076',  // Lead number
            'Ali',     // Lead name
            'demo_widget'   // Widget ID
        );
        
        if (result.success) {
            console.log(`✅ Call initiated with ID: ${result.originationId}`);
            
            // Monitor active calls
            const monitorInterval = setInterval(() => {
                const activeCalls = callBridge.getActiveCalls();
                console.log(`📊 Active calls: ${activeCalls.length}`);
                
                activeCalls.forEach(call => {
                    console.log(`   ${call.originationId}: ${call.status} (${call.leadName})`);
                });
                
                // Stop monitoring if no active calls
                if (activeCalls.length === 0) {
                    clearInterval(monitorInterval);
                    console.log('🏁 All calls completed. Demo finished.');
                    callBridge.disconnect();
                    process.exit(0);
                }
            }, 5000);
            
        } else {
            console.error(`❌ Failed to start call: ${result.error}`);
        }
        
    } catch (error) {
        console.error('❌ Demo failed:', error);
        callBridge.disconnect();
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});

// Run demo if this file is executed directly
if (require.main === module) {
    runDemo();
}

module.exports = FreeSwitchCallBridge;
