import fs from 'fs';
import mysql from 'mysql2/promise';
import { DatabaseStoredValue } from './Column';
export type SQLResultRow = Record<string, DatabaseStoredValue>;
export type SQLResultNamespacedRow = Record<string, SQLResultRow>;

type SelectOptions = { connection?: mysql.PoolConnection; nestTables?: boolean };

/// Database is a wrapper arround mysql, because we want to use promises + types
export class DatabaseInstance {
    pool: mysql.Pool;
    debug = false;

    constructor(options: {
        debug?: boolean;
        host?: string;
        user?: string;
        password?: string;
        port?: number;
        database?: string | null; // set to null to not use a default database
        connectionLimit?: number;
        multipleStatements?: boolean;
        charset?: string;
        useSSL?: boolean;
        ca?: string;
    } = {}) {
        const settings = {
            host: options.host ?? process.env.DB_HOST ?? 'localhost',
            user: options.user ?? process.env.DB_USER ?? 'root',
            password: options.password ?? process.env.DB_PASS ?? 'root',
            port: options.port ? options.port : parseInt(process.env.DB_PORT ?? '3306'),
            database: options.database === undefined ? process.env.DB_DATABASE : options.database,
            connectionLimit: options.connectionLimit ? options.connectionLimit : parseInt(process.env.DB_CONNECTION_LIMIT ?? '10'),
            multipleStatements: options.multipleStatements ?? ((process.env.DB_MULTIPLE_STATEMENTS ?? 'false') === 'true'),
            charset: options.charset ?? process.env.DB_CHARSET ?? 'utf8mb4_0900_ai_ci',
            useSSL: options.useSSL ?? !!process.env.DB_USE_SSL,
            ca: options.ca ?? process.env.DB_CA,
        };

        if (settings.database === undefined) {
            throw new Error('Environment variable DB_DATABASE is missing');
        }

        this.pool = mysql.createPool({
            host: settings.host,
            user: settings.user,
            password: settings.password,
            port: settings.port,
            database: settings.database ?? undefined,
            waitForConnections: true,
            connectionLimit: settings.connectionLimit,
            queueLimit: 0,
            multipleStatements: settings.multipleStatements,
            charset: settings.charset,
            decimalNumbers: true,
            jsonStrings: true,
            ssl: settings.useSSL
                ? {
                        ca: settings.ca ? fs.readFileSync(settings.ca) : undefined,
                        rejectUnauthorized: settings.ca ? true : false,
                    }
                : undefined,
        });

        this.debug = options?.debug ?? false;

        if (this.debug) {
            this.pool.on('acquire', function (connection) {
                console.log('Connection %d acquired', connection.threadId);
            });

            this.pool.on('connection', function (connection) {
                console.log('Connection %d created', connection.threadId);
            });

            this.pool.on('enqueue', function () {
                console.log('Waiting for available connection slot');
            });

            this.pool.on('release', function (connection) {
                console.log('Connection %d released', connection.threadId);
            });
        }
    }

    setDebug(enabled = true) {
        this.debug = enabled;
    }

    async getConnection(): Promise<mysql.PoolConnection> {
        // Todo: use the settings here to provide a good connection pool
        return await this.pool.getConnection();
    }

    escapeId(value: string): string {
        return this.pool.escapeId(value);
    }

    async end(): Promise<void> {
        return await this.pool.end();
    }

    startQuery(): [number, number] {
        return process.hrtime();
    }

    logQuery(q, hrstart: [number, number]) {
        if (this.debug) {
            const hrend = process.hrtime(hrstart);
            console.warn(q.sql.replace(/\n+ +/g, '\n'), 'started at ' + (hrend[0] * 1000 + hrend[1] / 1000000) + 'ms');
        }
    }

    finishQuery(q, hrstart: [number, number]) {
        if (this.debug) {
            const hrend = process.hrtime(hrstart);
            console.log(q.sql.replace(/\s+/g, ' '), 'in ' + (hrend[0] * 1000 + hrend[1] / 1000000) + 'ms');
        }
    }

    select(query: string, values?: any, options?: SelectOptions & { nestTables: true }): Promise<[SQLResultNamespacedRow[], mysql.FieldPacket[] | undefined]>;
    select(query: string, values?: any, options?: SelectOptions & { nestTables: false }): Promise<[SQLResultRow[], mysql.FieldPacket[] | undefined]>;
    async select(query: string, values?: any, options: SelectOptions = {}): Promise<[(SQLResultNamespacedRow | SQLResultRow)[], mysql.FieldPacket[] | undefined]> {
        const connection: mysql.PoolConnection = options.connection ?? (await this.getConnection());
        try {
            const q = await connection.query({ sql: query, nestTables: options.nestTables ?? true, values: values });
            return [
                q[0] as (SQLResultNamespacedRow | SQLResultRow)[],
                q[1] as mysql.FieldPacket[] | undefined,
            ];
        }
        finally {
            if (!options.connection) {
                connection.release();
            }
        }
    }

    async insert(
        query: string,
        values?: any,
        useConnection?: mysql.PoolConnection,
    ): Promise<[{ insertId: any; affectedRows: number }, mysql.FieldPacket[] | undefined]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        try {
            const q = await connection.query({ sql: query, values: values });
            return [
                q[0] as { insertId: any; affectedRows: number },
                q[1] as mysql.FieldPacket[] | undefined,
            ];
        }
        finally {
            if (!useConnection) {
                connection.release();
            }
        }
    }

    async update(query: string, values?: any, useConnection?: mysql.PoolConnection): Promise<[
        { /** @deprecated */ changedRows: number; affectedRows: number }
        , mysql.FieldPacket[] | undefined]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        try {
            const q = await connection.query({ sql: query, values: values });
            return [
                q[0] as { changedRows: number; affectedRows: number },
                q[1] as mysql.FieldPacket[] | undefined,
            ];
        }
        finally {
            if (!useConnection) {
                connection.release();
            }
        }
    }

    async delete(query: string, values?: any, useConnection?: mysql.PoolConnection): Promise<[{ affectedRows: number }, mysql.FieldPacket[] | undefined]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        try {
            const q = await connection.query({ sql: query, values: values });
            return [
                q[0] as { affectedRows: number },
                q[1] as mysql.FieldPacket[] | undefined,
            ];
        }
        finally {
            if (!useConnection) {
                connection.release();
            }
        }
    }

    async statement(query: string, values?: any, useConnection?: mysql.PoolConnection): Promise<[any, any]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        try {
            const q = await connection.query({ sql: query, values: values });
            return [
                q[0] as any,
                q[1] as any,
            ];
        }
        finally {
            if (!useConnection) {
                connection.release();
            }
        }
    }
}

export const Database = new DatabaseInstance();
