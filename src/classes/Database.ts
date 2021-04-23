import fs from "fs";
import mysql from "mysql";

if (!process.env.DB_DATABASE) {
    throw new Error("Environment variable DB_DATABASE is missing");
}
// create the connection to database
// Create the connection pool. The pool-specific settings are the defaults
const pool = mysql.createPool({
    host: process.env.DB_HOST ?? "localhost",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASS ?? "root",
    port: parseInt(process.env.DB_PORT ?? "3306"),
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT ?? "10"),
    queueLimit: 0,
    charset: "utf8mb4",
    ssl: (process.env.DB_USE_SSL ?? false) ? {
        ca: process.env.DB_CA ? fs.readFileSync(process.env.DB_CA) : undefined,
        rejectUnauthorized: process.env.DB_CA ? true : false,
    } : undefined
});

let debug = false;

if (debug) {
    pool.on("acquire", function (connection) {
        console.log("Connection %d acquired", connection.threadId);
    });

    pool.on("connection", function (connection) {
        console.log("Connection %d created", connection.threadId);
    });

    pool.on("enqueue", function () {
        console.log("Waiting for available connection slot");
    });

    pool.on("release", function (connection) {
        console.log("Connection %d released", connection.threadId);
    });
}

/// Database is a wrapper arround mysql, because we want to use promises + types
export const Database = {
    setDebug(enabled = true) {
        debug = enabled;
    },

    async getConnection(): Promise<mysql.PoolConnection> {
        // Todo: use the settings here to provide a good connection pool
        return new Promise((resolve, reject) => {
            pool.getConnection((err, connection) => {
                if (err) {
                    console.error("connection failed");
                    return reject(err);
                }
                return resolve(connection);
            });
        });
    },

    escapeId(value: string): string {
        return pool.escapeId(value);
    },

    async end(): Promise<mysql.MysqlError | undefined> {
        return new Promise((resolve, reject) => {
            pool.end(function (err) {
                if (err) {
                    console.error(err);
                    return reject(err);
                }

                if (debug) {
                    console.log("All connections have ended in the pool");
                }
                return resolve();
            });
        });
    },

    startQuery(): [number, number] {
        return process.hrtime();
    },

    logQuery(q, hrstart: [number, number]) {
        if (debug) {
            const hrend = process.hrtime(hrstart);
            console.warn(q.sql.replace(/\n+ +/g, "\n"), "started at " + (hrend[0] * 1000 + hrend[1] / 1000000) + "ms");
        }
        
    },

    finishQuery(q, hrstart: [number, number]) {
        if (debug) {
            const hrend = process.hrtime(hrstart);
            console.log(q.sql.replace(/\s+/g, " "), "in " + (hrend[0] * 1000 + hrend[1] / 1000000) + "ms");
        }
    },

    async select(query: string, values?: any, useConnection?: mysql.PoolConnection): Promise<[any[], mysql.FieldInfo[] | undefined]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        return new Promise((resolve, reject) => {
            const hrstart = this.startQuery();
            const q = connection.query({ sql: query, nestTables: true, values: values }, (err, results, fields) => {
                if (!useConnection) connection.release();

                this.finishQuery(q, hrstart);

                if (err) {
                    return reject(err);
                }

                return resolve([results, fields]);
            });
            this.logQuery(q, hrstart);
        });
    },

    async insert(
        query: string,
        values?: any,
        useConnection?: mysql.PoolConnection
    ): Promise<[{ insertId: any; affectedRows: number }, mysql.FieldInfo[] | undefined]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        return new Promise((resolve, reject) => {
            const hrstart = this.startQuery();
            const q = connection.query(query, values, (err, results, fields) => {
                if (!useConnection) connection.release();

                this.finishQuery(q, hrstart);

                if (err) {
                    return reject(err);
                }
                return resolve([results, fields]);
            });
            this.logQuery(q, hrstart);
        });
    },

    async update(query: string, values?: any, useConnection?: mysql.PoolConnection): Promise<[{ changedRows: number }, mysql.FieldInfo[] | undefined]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        return new Promise((resolve, reject) => {
            const hrstart = this.startQuery();
            const q = connection.query(query, values, (err, results, fields) => {
                if (!useConnection) connection.release();

                this.finishQuery(q, hrstart);

                if (err) {
                    return reject(err);
                }
                return resolve([results, fields]);
            });
            this.logQuery(q, hrstart);
        });
    },

    async delete(query: string, values?: any, useConnection?: mysql.PoolConnection): Promise<[{ affectedRows: number }, mysql.FieldInfo[] | undefined]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        return new Promise((resolve, reject) => {
            const hrstart = this.startQuery();
            const q = connection.query(query, values, (err, results, fields) => {
                if (!useConnection) connection.release();

                this.finishQuery(q, hrstart);

                if (err) {
                    return reject(err);
                }
                return resolve([results, fields]);
            });
            this.logQuery(q, hrstart);
        });
    },

    async statement(query: string, values?: any, useConnection?: mysql.PoolConnection): Promise<[any, any]> {
        const connection: mysql.PoolConnection = useConnection ?? (await this.getConnection());
        return new Promise((resolve, reject) => {
            const hrstart = this.startQuery();
            const q = connection.query(query, values, (err, results, fields) => {
                if (!useConnection) connection.release();

                this.finishQuery(q, hrstart);

                if (err) {
                    return reject(err);
                }
                return resolve([results, fields]);
            });
            this.logQuery(q, hrstart);
        });
    },
};
