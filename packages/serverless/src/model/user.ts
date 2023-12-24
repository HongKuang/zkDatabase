import { randomBytes } from 'crypto';
import ModelCollection from './collection';
import { ModelDocument } from './document';
import {
  DatabaseEngine,
  ZKDATABASE_MANAGEMENT_DB,
} from './abstract/database-engine';
import ModelSession, { SessionSchema } from './session';

export type UserSchema = {
  username: string;
  email: string;
  publicKey: string;
  userData: any;
  createdAt: Date;
  updatedAt: Date;
};

export class ModelUser extends ModelDocument {
  constructor() {
    super(ZKDATABASE_MANAGEMENT_DB, 'user');
  }

  public async create() {
    if (
      await DatabaseEngine.getInstance().isCollection(
        this.databaseName || '',
        this.collectionName || ''
      )
    ) {
      return new ModelCollection(this.databaseName, this.collectionName).create(
        ['username', 'email', 'publicKey']
      );
    }
    throw new Error('Database and collection was not set');
  }

  public async signUp(
    username: string,
    email: string,
    publicKey: string,
    userData: any
  ) {
    return this.insertOne({
      username,
      email,
      publicKey,
      createdAt: new Date(),
      updatedAt: new Date(),
      userData,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  public async signIn(username: string): Promise<SessionSchema> {
    const newSession = await new ModelSession().insertOne({
      username,
      sessionId: randomBytes(32).toString('hex'),
      sessionKey: randomBytes(32).toString('hex'),
      createdAt: new Date(),
    });
    return newSession as any;
  }

  // eslint-disable-next-line class-methods-use-this
  public async signOut(sessionId: string) {
    return new ModelSession().drop({
      sessionId,
    });
  }
}

export default ModelUser;
