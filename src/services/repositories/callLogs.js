import { getDb } from '../../core/mongo.js';

export class CallLogsRepository {
  constructor() {
    this.collection = () => getDb().collection('call_logs');
  }

  async logAttempt(payload) {
    const doc = {
      type: 'attempt',
      ts: new Date(),
      ...payload,
    };
    await this.collection().insertOne(doc);
  }

  async logOutcome(payload) {
    const doc = {
      type: 'outcome',
      ts: new Date(),
      ...payload,
    };
    await this.collection().insertOne(doc);
  }
}

export default CallLogsRepository;

