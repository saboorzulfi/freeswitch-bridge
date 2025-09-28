import { getDb } from '../../core/mongo.js';

export class AgentsRepository {
  constructor() {
    this.collection = () => getDb().collection('agents');
  }

  async findByIds(ids) {
    const list = await this.collection().find({ _id: { $in: ids } }).project({ _id: 1, number: 1 }).toArray();
    return list;
  }
}

export default AgentsRepository;

