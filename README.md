## FreeSWITCH Preview Dialer (Node.js + ESL)

### Prerequisites
- FreeSWITCH running on the same host or reachable over network
- `event_socket.conf.xml` enabled and listening (default 0.0.0.0:8021 or 127.0.0.1:8021)
- ACL permitting this host to connect (see `vars.xml`/`acl.conf.xml`)

### Configure FreeSWITCH ESL
1) Enable Event Socket:
   - File: `conf/autoload_configs/event_socket.conf.xml`
   - Set:
     - `<param name="listen-ip" value="127.0.0.1"/>`
     - `<param name="listen-port" value="8021"/>`
     - `<param name="password" value="ClueCon"/>`
2) Reload FreeSWITCH or `fs_cli -x 'reload mod_event_socket'`.

### Environment
Copy `.env.example` to `.env` and adjust:

```
ESL_HOST=127.0.0.1
ESL_PORT=8021
ESL_PASSWORD=ClueCon
LOG_LEVEL=info
MAX_ROUNDS=3
AGENT_RING_SECONDS=20
LEAD_RING_SECONDS=25
MONGO_URI=mongodb://localhost:27017
MONGO_DB=fs_preview_dialer
```

### Install & Run
```
npm install
npm run start
```

### Configure Dial Destinations
Edit `src/index.js` and update:
- Agents: `sofia/internal/1001`, ...
- Lead: `sofia/gateway/my_trunk/15551234567`

### Flow
1. Call agents sequentially with timeout
2. On first agent answer, call the lead
3. If lead answers, bridge agent↔lead
4. If no agents answer after 3 rounds, mark as unanswered

### Troubleshooting
- Connection refused: ensure ESL is enabled and ACL allows this host
- Mongo connection refused: start local MongoDB or update `MONGO_URI`
- No audio: check NAT, `ext-sip-ip`/`ext-rtp-ip`, codecs
- Inspect events: run `fs_cli -x 'sofia status'` and monitor logs

### FreeSWITCH SIP trunk (didlogic)

Place this XML on your FreeSWITCH server to enable the `didlogic` gateway used by the app:

```xml
<include>
  <gateway name="didlogic">
    <param name="username" value="18125"/>
    <param name="password" value="Ora@333666999"/>
    <param name="proxy" value="sip.de.didlogic.net"/>
    <param name="realm" value="sip.de.didlogic.net"/>
    <param name="from-domain" value="sip.de.didlogic.net"/>
    <param name="register" value="true"/>
    <param name="expire-seconds" value="3600"/>
    <param name="retry-seconds" value="30"/>
    <param name="caller-id-in-from" value="true"/>
  </gateway>
</include>
```

- Path: `conf/sip_profiles/external/didlogic.xml`
- Set `external_sip_ip` and `external_rtp_ip` in `conf/vars.xml` to your public IP.
- Reload and verify:

```bash
fs_cli -x 'reloadxml'
fs_cli -x 'sofia profile external rescan'
fs_cli -x 'sofia status gateway didlogic'
```

Alternatively, from this repo you can deploy:

```bash
scripts/deploy-freeswitch.sh user@your-fs-host /etc/freeswitch
```

### Using the API over the SIP trunk

- Both agents and lead are dialed through the `didlogic` gateway.
- Caller ID is set to `0145405558`.

POST example:

```bash
curl -X POST http://localhost:3000/dial \
  -H 'Content-Type: application/json' \
  -d '{"agents":["03001234567","03007654321"],"lead":"0145405558"}'
```

