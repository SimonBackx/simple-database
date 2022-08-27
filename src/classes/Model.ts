/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Column } from "./Column";
import { Database, SQLResultNamespacedRow, SQLResultRow } from "./Database";
import { ModelConstructor, ParseWhereArguments, SelectQuery, Where, WhereSign } from "./Query";
import { ModelWith, ToOne, ToMany, Relation } from "./relations/ToOne";

export class Model /* static implements RowInitiable<Model> */ {
    static primary: Column;

    /**
     * Properties that are stored in the table (including foreign keys, but without mapped relations!)
     */
    static columns: Map<string, Column>;
    static debug = false;
    static showWarnings = false;
    static table: string; // override this!
    static relations: ToOne<'const', Model>[];

    existsInDatabase = false;

    private savedProperties = new Map<string, any>();

    /**
     * Sometimes we have skipUpdate properties that still should get saved on specific occasions. 
     * E.g. update updatedAt field manually if is the only changed field.
     */
    private forceSaveProperties = new Set<string>();

    constructor() {
        // Read values
        if (!this.static.relations) {
            this.static.relations = [];
        }

        if (!this.static.columns) {
            this.static.columns = new Map<string, Column>();
        }
    }

    /**
     * Delete the value of a key from memory
     */
    eraseProperty(key: string) {
        const column = this.static.columns.get(key);
        if (!column) {
            throw new Error("Unknown property " + key);
        }
        delete this[key];
        this.savedProperties.delete(key);
    }

    /**
     * Make sure this key will get saved on the next save, even when it is not changed or when it is skipUpdate
     */
    forceSaveProperty(key: string) {
        this.forceSaveProperties.add(key);
    }

    /**
     * Mark all properties as changed, so they will get updated on the next save
     */
    markAllChanged() {
        this.savedProperties = new Map<string, any>();
    }

    /**
     * Returns the default select to select the needed properties of this table
     * @param namespace: optional namespace of this select
     */
    static getDefaultSelect(namespace: string = this.table): string {
        return "`" + namespace + "`.*";
    }

    static selectColumnsWithout(namespace: string = this.table, ...exclude: string[]): string {
        const properties = Array.from(this.columns.keys()).flatMap((name) => (exclude.includes(name) ? [] : [name]));

        if (properties.length == 0) {
            // todo: check what to do in this case.
            throw new Error("Not implemented yet");
        }
        return "`" + namespace + "`.`" + properties.join("`, `" + namespace + "`.`") + "`";
    }

    /**
     * Set a relation to undefined, marking it as not loaded (so it won't get saved in the next save)
     * @param relation
     */
    /*unloadRelation<Key extends keyof any, Value extends Model>(
        this: this & Record<Key, Value>,
        relation: ManyToOneRelation<Key, any>
    ): this & Record<Key, undefined> {
        // Todo: check if relation is nullable?
        const t = this as any;
        delete t[relation.modelKey];
        return t;
    }*/

    /**
     * Set a relation to null, deleting it on the next save (unless unloadRelation is called)
     * @param relation
     */
    /*unsetRelation<Key extends keyof any, Value extends Model>(
        this: this & Record<Key, Value>,
        relation: ManyToOneRelation<Key, any>
    ): this & Record<Key, null> {
        // Todo: check if relation is nullable?
        return this.setOptionalRelation(relation, null);
    }*/

    /*setOptionalRelation<Key extends keyof any, Value extends Model>(
        relation: ManyToOneRelation<Key, Value>,
        value: Value | null
    ): this & Record<Key, Value | null> {
        // Todo: check if relation is nullable?

        if (value !== null && !value.existsInDatabase) {
            throw new Error("You cannot set a relation to a model that are not yet saved in the database.");
        }
        const t = this as any;
        t[relation.modelKey] = value;
        t[relation.foreignKey] = value ? value.getPrimaryKey() : null;
        return t;
    }*/

    /*setRelation<Key extends keyof any, Value extends Model, V extends Value>(relation: ManyToOneRelation<Key, Value>, value: V): this & Record<Key, V> {
        if (!value.existsInDatabase) {
            throw new Error("You cannot set a relation to a model that are not yet saved in the database.");
        }
        const t = this as any;
        t[relation.modelKey] = value;
        t[relation.foreignKey] = value.getPrimaryKey();
        return t;
    }*/

    // TypeScript is having a hard type resolving the types correctly, so we help it a bit by adding some more specific types for each relation type
    //setRelation<Key extends string, M extends Model>(relation: ToMany<Key, M>, value: M[]): asserts this is this & Record<Key, M[]>
    //setRelation<Key extends string, M extends Model>(relation: ToOne<Key, M>, value: M): asserts this is this & Record<Key, M>
    setRelation<Key extends string, Value>(relation: Relation<Key, Value>, value: Value): asserts this is this & Record<Key, Value> {
        if (Array.isArray(value)) {
            for (const v of value) {
                if (!v.existsInDatabase) {
                    throw new Error("You cannot set a relation to an array with a model that are not yet saved in the database.");
                }
            }
        } else if (value !== null && !(value as any).existsInDatabase) {
            throw new Error("You cannot set a relation to a model that are not yet saved in the database.");
        }
        
        /*this[relation.modelKey] = value;
        t[relation.foreignKey] = value.getPrimaryKey();*/
        const t = this as any;

        if (relation instanceof ToOne) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            t[relation.modelKey] = value;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            t[relation.foreignKey] = (value as Model)?.getPrimaryKey() ?? null;
        } else {
            t[relation.modelKey] = value;
        }
    }

    /// Whether this relation is loaded
    isLoaded<R extends Relation<any, any>>(relation: R): this is ModelWith<this, R> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return this[relation.modelKey] !== undefined;
    }

    /// Whether this relation is set (and not null)
    isSet<R extends Relation<any, any>>(relation: R): this is ModelWith<this, R> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return this[relation.modelKey] !== undefined && this[relation.modelKey] !== null;
    }

    /**
     * Set a many relation. Note that this doesn't save the relation! You'll need to use the methods of the relation instead
     */
    /*setManyRelation<Key extends keyof any, Value extends Model>(
        relation: ManyToManyRelation<Key, any, Value, any> | OneToManyRelation<Key, any, Value>,
        value: Value[]
    ): this & Record<Key, Value[]> {
        value.forEach((v) => {
            if (!v.existsInDatabase) {
                throw new Error("You cannot set a relation to models that are not yet saved in the database.");
            }
        });
        const t = this as any;
        t[relation.modelKey] = value;
        return t;
    }*/

    /**
     * Load the returned properties from a DB response row into the model
     * If the row's primary key is null, undefined is returned
     */
    static fromRow<T extends Model>(this: ModelConstructor<T>, row: SQLResultRow): T | undefined {
        if (row === undefined || (this.primary && (row[this.primary.name] === null || row[this.primary.name] === undefined))) {
            return undefined;
        }

        const model = new this();
        for (const column of this.columns.values()) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (row[column.name] !== undefined) {
                const value = column.from(row[column.name]);
                model[column.name] = value;
            } else {
                // Override default value to prevent any saving!
                model[column.name] = undefined;
            }
        }

        model.markSaved();
        return model;
    }

    static fromRows<T extends Model>(this: ModelConstructor<T>, rows: SQLResultNamespacedRow[], namespace: string): T[] {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return rows.flatMap((row) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const model = this.fromRow(row[namespace]);
            if (model) {
                return [model];
            }
            return [];
        }) as any;
    }

    private markSaved() {
        this.existsInDatabase = true;

        this.savedProperties.clear();
        this.forceSaveProperties.clear();
        
        for (const column of this.static.columns.values()) {
            if (this[column.name] !== undefined) {
                // If undefined: do not update, since we didn't save the value
                this.savedProperties.set(column.name, column.saveProperty(this[column.name]));
            }
        }

        /// Save relation foreign keys (so we can check if the id has changed)
        for (const relation of this.static.relations) {
            if (this.isLoaded(relation)) {
                const model = this[relation.modelKey];
                this[relation.foreignKey] = model?.getPrimaryKey() ?? null;
            }
        }
    }

    get static(): typeof Model {
        return this.constructor as typeof Model;
    }

    getPrimaryKey(): number | string {
        return (this as Record<string, unknown>)[this.static.primary.name] as number | string;
    }

    /**
     * Get a model by its primary key
     * @param id primary key
     */
    static async getByID<T extends Model>(this: ModelConstructor<T>, id: number | string): Promise<T | undefined> {
        return await this.select().where(this.primary.name, id).first();
    }

    /**
     * Get multiple models by their ID
     * @param ids primary key of the models you want to fetch
     */
    static async getByIDs<T extends Model>(this: ModelConstructor<T>, ...ids: (number | string)[]): Promise<T[]> {
        if (ids.length == 0) {
            return [];
        }
        return await this.select().where(this.primary.name, ids).fetch();
    }


    /**
     * Get multiple models by a simple where
     */
    /*static async where<T extends typeof Model>(this: T, where: SQLWhereQuery, extra?: { 
        limit?: number; 
        sort?: (string | { column: string | SQLWhereQuery; direction?: "ASC" | "DESC"})[];
        select?: string;
    }): Promise<InstanceType<T>[]> {
        const params: any[] = []
        
        let query = `SELECT ${extra?.select ?? this.getDefaultSelect()} FROM \`${this.table}\`` 
        if (Object.keys(where).length !== 0) {
            const [whereQuery, p] = this.buildWhereQuery(where)
            query += `WHERE ` + whereQuery;
            params.push(...p)
        }

        if (extra && extra.sort !== undefined) {
            const sortQuery: string[] = []

            for (const item of extra.sort) {
                if (typeof item == "string") {
                    sortQuery.push(Database.escapeId(item) + " ASC")
                } else if (typeof item.column == "string") {
                    sortQuery.push(Database.escapeId(item.column)+" "+(item.direction ?? "ASC"))
                } else {
                    // Repeat use of a where query in the sorting (needed when fulltext searching and need to sort on the score, because limit won't work without this for an unknown reason)
                    const [w, p] = this.buildWhereQuery(item.column)
                    
                    sortQuery.push("("+ w + ") " + (item.direction ?? "ASC"))
                    params.push(...p)
                }
            }

            query += ` ORDER BY ` + sortQuery.join(", ");
        }

        if (extra && extra.limit !== undefined) {
            query += ` LIMIT ?`;
            params.push(extra.limit);
        }

        const [rows] = await Database.select(query, params);

        return this.fromRows(rows, this.table);
    }*/

    /**
     * Build your own select query, and cast the result to an arary of Model
     */
    /*static async select<T extends typeof Model>(this: T, query: string, params: any[], select?: string): Promise<InstanceType<T>[]> {
        const q = (select ? select : `SELECT ${this.getDefaultSelect()} FROM \`${this.table}\` `)+query;
        const [rows] = await Database.select(q, params);
        return this.fromRows(rows, this.table);
    }*/

    static select<T extends Model>(this: ModelConstructor<T>): SelectQuery<T> {
        return new SelectQuery(this)
    }

    static where<T extends Model>(this: ModelConstructor<T>, ...args: ParseWhereArguments): SelectQuery<T> {
        return new SelectQuery(this).where(...args);
    }

    /**
     * Get multiple models by a simple where
     */
    static async all<T extends Model>(this: ModelConstructor<T>, limit?: number): Promise<T[]> {
        const params: any[] = [];
        let query = `SELECT ${this.getDefaultSelect()} FROM \`${this.table}\``;

        if (limit) {
            query += ` LIMIT ?`;
            params.push(limit);
        }

        const [rows] = await Database.select(query, params);
        return this.fromRows(rows, this.table);
    }

    /**
     * Return an object of all the properties that are changed and their database representation
     */
    async getChangedDatabaseProperties(): Promise<{fields: Record<string, unknown>; skipUpdate: number}> {
        const set: Record<string, unknown> = {};
        let skipUpdate = 0
        
        for (const column of this.static.columns.values()) {
            // Run beforeSave
            if (column.beforeSave) {
                this[column.name] = await column.beforeSave.call(this, this[column.name]);
            }

            if (column.primary && column.type == "integer" && this.static.primary.name == "id") {
                // Auto increment: not allowed to set
                continue;
            }

            if (!this.existsInDatabase && this[column.name] === undefined) {
                // In the future we might make some columns optional because they have a default value in the database.
                // But that could cause inconsitent state, so it would be better to generate default values in code.
                throw new Error("Tried to create model " + this.constructor.name + " with undefined property " + column.name);
            }

            if (this[column.name] !== undefined) {
                const forceSave = this.forceSaveProperties.has(column.name) 
                if (forceSave || column.isChanged(this.savedProperties.get(column.name), this[column.name])) {
                    set[column.name] = column.to(this[column.name]);

                    if (column.skipUpdate && !forceSave) {
                        skipUpdate++
                    }
                }
            }
        }

        return {fields: set, skipUpdate};
    }

    async save(): Promise<boolean> {
        if (!this.static.table) {
            throw new Error("Table name not set");
        }

        if (!this.static.primary) {
            throw new Error("Primary key not set for model " + this.constructor.name);
        }

        // Check if relation models were modified
        for (const relation of this.static.relations) {
            // If a relation is loaded, we can check if it changed the value of the foreign key
            if (this.isLoaded(relation)) {
                // The foreign key is modified (set, changed or cleared)
                if (this.isSet(relation)) {
                    const model = this[relation.modelKey] ;

                    if (!model.existsInDatabase) {
                        throw new Error("You cannot set a relation that is not yet saved in the database.");
                    }

                    if (this[relation.foreignKey] !== model.getPrimaryKey()) {
                        // Should always match because setRelation will make it match on setting it.
                        throw new Error(
                            "You cannot modify the value of a foreign key when the relation is loaded. Unload the relation first or modify the relation with setRelation"
                        );
                    }
                } else {
                    if (this[relation.foreignKey] !== null) {
                        // Should always match because setRelation will make it match on setting it.
                        throw new Error(
                            "You cannot set a foreign key when the relation is loaded. Unload the relation first or modify the relation with setRelation"
                        );
                    }
                }
            }
        }

        const id = this.getPrimaryKey();
        if (!id) {
            if (this.existsInDatabase) {
                throw new Error("Model " + this.constructor.name + " was loaded from the Database, but didn't select the ID. Saving not possible.");
            }
        } else {
            if (!this.existsInDatabase && this.static.primary.type == "integer" && this.static.primary.name == "id") {
                throw new Error(
                    `PrimaryKey was set programmatically without fetching the model ${this.constructor.name} from the database. This is not allowed for integer primary keys.`
                );
            }
        }

        const { fields, skipUpdate } = await this.getChangedDatabaseProperties();

        if (Object.keys(fields).length == 0) {
            if (Model.showWarnings) console.warn("Tried to update model without any properties modified");
            return false;
        }

        if (this.existsInDatabase && skipUpdate === Object.keys(fields).length) {
            if (Model.showWarnings) console.warn("Tried to update model without any properties modified");
            return false;
        }   

        if (Model.debug) console.log("Saving " + this.constructor.name + " to...", fields);

        // todo: save here
        if (!this.existsInDatabase) {
            if (Model.debug) console.log(`Creating new ${this.constructor.name}`);

            const [result] = await Database.insert("INSERT INTO `" + this.static.table + "` SET ?", [fields]);

            if (this.static.primary.type == "integer" && this.static.primary.name == "id") {
                // Auto increment value
                this[this.static.primary.name] = result.insertId;
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                if (Model.debug) console.log(`New id = ${this[this.static.primary.name]}`);
            }
        } else {
            if (Model.debug) console.log(`Updating ${this.constructor.name} where ${this.static.primary.name} = ${id}`);

            const [result] = await Database.update("UPDATE `" + this.static.table + "` SET ? WHERE `" + this.static.primary.name + "` = ?", [fields, id]);
            if (result.changedRows != 1 && Model.showWarnings) {
                console.warn(`Updated ${this.constructor.name}, but it didn't change a row. Check if ID exists.`);
            }
        }

        // Mark everything as saved
        this.markSaved();
        return true;
    }

    async delete() {
        const id = this.getPrimaryKey();

        if (!id && this.existsInDatabase) {
            throw new Error("Model " + this.constructor.name + " was loaded from the Database, but didn't select the ID. Deleting not possible.");
        }

        if (!id || !this.existsInDatabase) {
            throw new Error("Model " + this.constructor.name + " can't be deleted if it doesn't exist in the database already");
        }

        if (Model.debug) console.log(`Updating ${this.constructor.name} where ${this.static.primary.name} = ${id}`);

        const [result] = await Database.delete("DELETE FROM `" + this.static.table + "` WHERE `" + this.static.primary.name + "` = ?", [id]);
        if (result.affectedRows != 1 && Model.showWarnings) {
            console.warn(`Deleted ${this.constructor.name}, but it didn't change a row. Check if ID exists.`);
        }

        this.existsInDatabase = false;
        if (this.static.primary.type == "integer" && this.static.primary.name == "id") {
            this.eraseProperty(this.static.primary.name);
        }
        this.savedProperties.clear();
    }
}
