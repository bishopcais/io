import mongoose, { Model, Document } from 'mongoose';
import Io from './io';
import { MongoOptions } from './types';

export class Mongo {
  public mongoose: mongoose.Mongoose;

  public options: MongoOptions;

  public constructor(io: Io) {
    io.config.defaults({
      mongo: {
        host: 'localhost',
        port: 27017,
        db: 'cais',
      },
    });

    this.options = io.config.get<MongoOptions>('mongo');

    let conn_string = 'mongodb://';
    conn_string += `${this.options.host}`;
    conn_string += ':';
    conn_string += `${this.options.port}`;
    conn_string += '/';
    conn_string += `${this.options.db}`;

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

    this.mongoose.connect(conn_string, options);

    this.mongoose.connection.on('error', (err): void => {
      console.error('MongoDB connection error.');
      console.error(err);
      process.exit(1);
    });
  }

  public model<T extends Document>(name: string, schema: mongoose.Schema): Model<T> {
    return this.mongoose.model<T>(name, schema);
  }

  public disconnect(): Promise<void> {
    return this.mongoose.disconnect();
  }
}

export default Mongo;
