import { getDb } from '../../core/mongo.js';

export class LeadsRepository {
  constructor() {
    this.collection = () => getDb().collection('leads');
  }

  async findById(id) {
    const doc = await this.collection().findOne({ _id: id }, { projection: { _id: 1, number: 1 } });
    return doc;
  }
}

export default LeadsRepository;

