import colors from "colors";
import { promises as fs } from "fs";

import { Migration as MigrationModel } from "../models/Migration";
import { Database } from './Database';

type MigrationFunction = () => Promise<void>;

async function directoryExists(filePath): Promise<boolean> {
    try {
        return (await fs.stat(filePath)).isDirectory();
    } catch (err) {
        return false;
    }
}

export class Migration {
    up: MigrationFunction;
    down: MigrationFunction | undefined;

    constructor(up: MigrationFunction, down?: MigrationFunction) {
        this.up = up;
        this.down = down;
    }

    /***
     * Given a folder, loop all the folders in that folder and run the migrations in the 'migrations' folder
     */
    static async runAll(folder: string): Promise<boolean> {
        console.log("Running all migrations...")

        // First check if we have migrations table
        const setupMigration = await this.getMigration(__dirname + '/../migrations/000000000-setup-migrations.sql')
        if (!setupMigration) {
            throw new Error("Setup migration missing")
        }
        await setupMigration.up();
        await MigrationModel.markAsExecuted("000000000-setup-migrations.sql");

        const parts = folder.split("/");
        const firstPart = parts.shift()
        if (firstPart === undefined) {
            throw new Error("Invalid folder path")
        }
        let folderQueue: string[] = [firstPart]
        const migrations: [string, string][] = []

        for(const part of parts) {
            if (part == "*") {
                const newQueue: string[] = [];
                for (folder of folderQueue) {
                    // Read all directories
                    const recursiveFolders = (await fs.readdir(folder, { withFileTypes: true })).filter(dirent => dirent.isDirectory()).map(dirent => folder+"/"+dirent.name)
                    newQueue.push(...recursiveFolders)
                }
                folderQueue = newQueue
            } else {
                folderQueue = folderQueue.map(folder => folder + "/" + part)
            }
        }

        for (const p of folderQueue) {
            if (await directoryExists(p)) {
                const folderFiles = await fs.readdir(p);

                for (const file of folderFiles) {
                    const full = p + "/" + file;
                    const name = file;
                    if (!(await MigrationModel.isExecuted(name))) {
                        migrations.push([name, full]);
                    }
                }
            }
        }

        // Make sure we run the migrations in order
        migrations.sort((a, b) => {
            // It is expected to return a negative value if first argument is less than second argument, zero if they're equal and a positive value otherwise. If omitted, the elements are sorted in ascending, ASCII character order.
            if (a < b) return -1
            if (a > b) return 1
            return 0
        });

        for (const [name, file] of migrations) {
            // Check if SQL or TypeScript
            const migration = await this.getMigration(file)
            if (!migration) {
                continue;
            }

            process.stdout.write(colors.bold("Migration " + name));
            try {
                await migration.up();
                await MigrationModel.markAsExecuted(name);
                process.stdout.write(": " + colors.green("OK") + "\n");
            } catch (e) {
                process.stdout.write(": " + colors.red("FAILED") + "\n");
                process.stderr.write(colors.bold.red("Error: " + e.message + "\n"));
                return false;
            }
        }
        return true;
    }

    static async getMigration(file: string): Promise<Migration | undefined> {
        let migration: Migration
        if (file.endsWith('.sql')) {
            if (file.endsWith('.down.sql')) {
                // Ignore. This will contain the downgrade implementation.
                return;
            }
            const sqlStatement = await fs.readFile(file, { encoding: "utf-8" });
            const statements = sqlStatement.split(";");

            migration = new Migration(async () => {
                for (const statement of statements) {
                    const trimmed = statement.trim();
                    if (trimmed.length > 0) await Database.statement(trimmed);
                }
            });

        } else {
            if (file.includes(".test.")) {
                return;
            }
            if (file.endsWith(".d.ts")) {
                return;
            }
            if (!file.endsWith(".ts") && !file.endsWith(".js")) {
                return;
            }

            const imported = await import(file);
            migration = imported.default;
        }
        return migration
    }
}
