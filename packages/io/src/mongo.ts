import mongoose, { Model, Document } from 'mongoose';
import { Io } from './io';
import { MongoOptions } from './types';

/**
 * Mongo module.
 *
 * Provides a shallow interface to the underlying mongoose library, available
 * aa the `mongoose` property.
 */
export class Mongo {
  /**
   * Mongoose instance. See [Mongoose#API](https://mongoosejs.com/docs/api.html) for details on its API.
   */
  public mongoose: mongoose.Mongoose;

  public options: MongoOptions;

  /**
   * Instantiate the Mongo module.
   *
   * Please view [mongoose#connect](https://mongoosejs.com/docs/api/mongoose.html#mongoose_Mongoose-connect) for all
   * allowed configuration options. These options should be set in the cog.json file.
   *
   * The defaults if not specifed are:
   *
   * ```json
   * {
   *   "mongo": {
   *     "host": "localhost",
   *     "port": 27017,
   *     "db": "cais"
   *   }
   * }
   * ```
   *
   * @param io Io instance
   */
  public constructor(io: Io) {
    io.config.defaults({
      mongo: {
        host: 'localhost',
        port: 27017,
        db: 'cais',
      },
    });

    this.options = io.config.get<MongoOptions>('mongo');

    let connString = 'mongodb://';
    connString += `${this.options.host}`;
    connString += ':';
    connString += `${this.options.port}`;
    connString += '/';
    connString += `${this.options.db}`;

    this.mongoose = mongoose;
    const options: mongoose.ConnectionOptions = {
      useNewUrlParser: true,
      useFindAndModify: false,
      useCreateIndex: true,
      useUnifiedTopology: true,
    };
    if (this.options.user) {
      options.user = this.options.user;
    }
    if (this.options.pass) {
      options.pass = this.options.pass;
    }

    this.mongoose.connect(connString, options).catch(() => {
      /* pass */
    });

    this.mongoose.connection.on('error', (err): void => {
      console.error('MongoDB connection error.');
      console.error(err);
      process.exit(1);
    });
  }

  /**
   * Shallow wrapper around the [mongoose.model](https://mongoosejs.com/docs/api/model.html#model_Model) method. Please
   * see its docs for more details.
   *
   * @param name - The name of the model
   * @param schema - The schema of the model
   */
  public model<T extends Document>(
    name: string,
    schema: mongoose.Schema,
  ): Model<T> {
    return this.mongoose.model<T>(name, schema);
  }

  public disconnect(): Promise<void> {
    return this.mongoose.disconnect();
  }
}
