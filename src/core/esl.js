import esl from 'modesl';
import { config } from './config.js';
import { logger } from './logger.js';

export class EslClient {
  constructor() {
    this.connection = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const { host, port, password } = config.esl;
      logger.info({ host, port }, 'Connecting to ESL');
      const con = new esl.Connection(host, port, password, () => {
        this.connection = con;
        logger.info('ESL connected successfully');
        con.subscribe([ 'all' ]);
        resolve(con);
      });

      con.on('error', (err) => {
        logger.error({ err }, 'ESL connection error');
        reject(err);
      });

      con.on('esl::event::CHANNEL_HANGUP_COMPLETE::*', (evt) => {
        logger.debug({ uuid: evt.getHeader('Unique-ID'), cause: evt.getHeader('Hangup-Cause') }, 'HANGUP_COMPLETE');
      });

      con.on('esl::end', () => {
        logger.warn('ESL connection ended');
        this.connection = null;
      });
    });
  }

  getCon() {
    if (!this.connection) throw new Error('ESL not connected');
    return this.connection;
  }
}

export const eslClient = new EslClient();

export default eslClient;

