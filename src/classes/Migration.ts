import { promises as fs } from "fs";

import { Migration as MigrationModel } from "../models/Migration";
import { Database } from './Database';
import {logger, StyledText} from "@simonbackx/simple-logging"

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
        const dirname = __dirname;

        // Get the current working directory by removing shared part of folder and dirname
        const shared = dirname.split("/").filter((part, index) => part == folder.split("/")[index]).join("/")
        const cwd = folder.replace(shared, "")

        logger.log(
            new StyledText('[Migration]').addClass('migration', 'prefix').addTag('migration'),
            ' ',
            new StyledText('Running all... ').addClass('migration', 'runAll'),
            new StyledText(cwd).addClass('migration', 'folder').addStyle('dim')
        )

        process.env.DB_MULTIPLE_STATEMENTS = "true";

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
                        
            logger.log(
                new StyledText('[Migration]').addClass('migration', 'prefix').addTag('migration'),
                ' ',
                new StyledText('Running ').addClass('migration', 'start'),
                new StyledText(name).addClass('migration', 'start', 'name'),
            )

            try {
                await logger.setContext({
                    prefixes: [new StyledText('[Migration]').addClass('migration', 'prefix'), ' '],
                    tags: ['migration']
                }, async () => {
                    await migration.up();
                    await MigrationModel.markAsExecuted(name);
                })

                logger.log(
                    new StyledText('[Migration]').addClass('migration', 'prefix').addTag('migration'),
                    ' ',
                    new StyledText('✓').addClass('migration', 'success', 'tag'),
                    ' ',
                    new StyledText("Migration " + name + " ran successfully").addClass('migration', 'success', 'text'),
                )

            } catch (e) {
                // Logger.errorWithContext({textColor: ['dim', 'red'], prefix: ' FAILED ', addSpace: true, prefixColor: ['bgRed']}, "Migration " + name + " failed", e)
                logger.error(
                    new StyledText('[Migration]').addClass('migration', 'prefix').addTag('migration'),
                    ' ',
                    new StyledText('✗').addClass('migration', 'failed', 'tag'),
                    ' ',
                    new StyledText("Migration " + name + " failed").addClass('migration', 'failed', 'text'),
                    ' ',
                    new StyledText(e).addClass('migration', 'failed', 'error')
                )
                return false;
            }
        }

        logger.log(
            new StyledText('[Migration]').addClass('migration', 'prefix').addTag('migration'),
            ' ',
            new StyledText('✨').addClass('migration', 'success', 'tag', 'all'),
            ' ',
            new StyledText("All migrations done").addClass('migration', 'success', 'text', 'all'),
        )
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

            migration = new Migration(async () => {
                await Database.statement(sqlStatement);
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
