import { Database } from "./Database";
import { Model } from "./Model";

export class ManyToManyRelation<Key extends keyof any, A extends Model, B extends Model> {
    modelA: { new (): A } & typeof Model;
    modelB: { new (): B } & typeof Model;

    /**
     * E.g. parents
     */
    modelKey: Key;

    /**
     * Sort the loading of this relation
     */
    sortKey: string | undefined;
    sortOrder: "ASC" | "DESC" = "ASC";

    /**
     * E.g. _models_parents
     */
    get linkTable(): string {
        return "_" + [this.modelA.table, this.modelB.table].sort().join("_");
    }

    /**
     * e.g. modelsId
     */
    get linkKeyA(): string {
        return (
            this.modelA.table +
            this.modelA.primary.name.charAt(0).toUpperCase() +
            this.modelA.primary.name.substring(1) +
            ((this.modelA as any) === this.modelB ? "A" : "")
        );
    }

    /**
     * e.g. parentsId
     */
    get linkKeyB(): string {
        return (
            this.modelB.table +
            this.modelB.primary.name.charAt(0).toUpperCase() +
            this.modelB.primary.name.substring(1) +
            ((this.modelA as any) === this.modelB ? "B" : "")
        );
    }

    constructor(modelA: { new (): A } & typeof Model, modelB: { new (): B } & typeof Model, modelKey: Key) {
        this.modelA = modelA;
        this.modelB = modelB;
        this.modelKey = modelKey;
    }

    setSort(key: string, order: "ASC" | "DESC" = "ASC"): this {
        this.sortKey = key;
        this.sortOrder = order;
        return this;
    }

    /// Generate a join query
    joinQuery(namespaceA: string, namespaceB: string): string {
        const linkNamespace = namespaceA + "_" + namespaceB;
        let str = `LEFT JOIN ${this.linkTable} as ${linkNamespace} on ${linkNamespace}.${this.linkKeyA} = ${namespaceA}.${this.modelA.primary.name}\n`;
        str += `LEFT JOIN ${this.modelB.table} as ${namespaceB} on ${linkNamespace}.${this.linkKeyB} = ${namespaceB}.${this.modelB.primary.name}`;
        return str;
    }

    orderByQuery(namespaceA: string, namespaceB: string): string {
        if (this.sortKey === undefined) {
            return "";
        }
        const linkNamespace = namespaceA + "_" + namespaceB;
        let str = `\nORDER BY ${linkNamespace}.${this.sortKey}`;
        if (this.sortOrder == "DESC") {
            str += " DESC";
        }
        return str + "\n";
    }

    /// Load the relation of a model and return the loaded models
    async load(modelA: A, sorted: boolean = true): Promise<B[]> {
        const namespaceB = "B";
        const linkNamespace = "A_B";
        let str = `SELECT ${this.modelB.getDefaultSelect(namespaceB)} FROM ${this.linkTable} as ${linkNamespace}\n`;
        str += `JOIN ${this.modelB.table} as ${namespaceB} on ${linkNamespace}.${this.linkKeyB} = ${namespaceB}.${this.modelB.primary.name}\n`;
        str += `WHERE ${linkNamespace}.${this.linkKeyA} = ?`;

        if (sorted) {
            str += this.orderByQuery("A", "B");
        }

        const [rows] = await Database.select(str, [modelA.getPrimaryKey()]);
        const modelsB = this.modelB.fromRows(rows, namespaceB) as B[];
        modelA.setManyRelation(this, modelsB);
        return modelsB;
    }

    /// Whether this relation is loaded
    isLoaded(model: A): model is A & Record<Key, B[]> {
        // Also not loaded if null, since it should be an empty array or an array if it is loaded
        return Array.isArray((model as any)[this.modelKey]);
    }

    async setLinkTable(modelA: A, modelB: B, linkTableValues: { [key: string]: any }) {
        let str = `UPDATE ${this.linkTable} SET ? WHERE ${Database.escapeId(this.linkKeyA)} = ? AND ${Database.escapeId(this.linkKeyB)} = ?`;

        const [result] = await Database.update(str, [linkTableValues, modelA.getPrimaryKey(), modelB.getPrimaryKey()]);
        if (result.changedRows != 1) {
            // Todo: add option to fail silently
            throw new Error("Failed to update link table. Check if combination exists");
        }
    }

    async linkIds(modelA: string | number, modelsB: (string | number)[], linkTableValues?: { [key: string]: any[] }): Promise<number> {
        // Nested arrays are turned into grouped lists (for bulk inserts), e.g. [['a', 'b'], ['c', 'd']] turns into ('a', 'b'), ('c', 'd')
        let result: {
            affectedRows: number;
        };
        if (linkTableValues !== undefined) {
            const linkTableKeys: string[] = Object.keys(linkTableValues);

            for (var property in linkTableValues) {
                if (linkTableValues.hasOwnProperty(property)) {
                    if (linkTableValues[property].length != modelsB.length) {
                        throw new Error(
                            "Amount of link table values for key " +
                                property +
                                " (" +
                                linkTableValues[property].length +
                                ") are not equal to amount of models linked (" +
                                modelsB.length +
                                ")"
                        );
                    }
                }
            }

            const query = `INSERT INTO ${Database.escapeId(this.linkTable)} (
                    ${Database.escapeId(this.linkKeyA)}, 
                    ${Database.escapeId(this.linkKeyB)}, 
                    ${linkTableKeys.map((k) => Database.escapeId(k)).join(", ")}
                ) VALUES ?`;
            [result] = await Database.insert(query, [modelsB.map((modelB, i) => [modelA, modelB, ...linkTableKeys.map((k) => linkTableValues[k][i])])]);
        } else {
            const query = `INSERT INTO ${Database.escapeId(this.linkTable)} (
                    ${Database.escapeId(this.linkKeyA)}, 
                    ${Database.escapeId(this.linkKeyB)}
                ) VALUES ?`;
            [result] = await Database.insert(query, [modelsB.map((modelB) => [modelA, modelB])]);
        }
        return result.affectedRows;
    }

    async link(modelA: A, modelsB: B[], linkTableValues?: { [key: string]: any[] }): Promise<void> {
        const modelAId = modelA.getPrimaryKey();
        if (!modelAId) {
            throw new Error("Cannot link if model is not saved yet");
        }

        const affectedRows = await this.linkIds(
            modelAId,
            modelsB.map((modelB) => {
                const id = modelB.getPrimaryKey();
                if (!id) {
                    throw new Error("Cannot link to a model that is not saved yet");
                }
                return id;
            }),
            linkTableValues
        );

        // If the relation is loaded, also modify the value of the relation
        if (this.isLoaded(modelA)) {
            if (affectedRows == modelsB.length) {
                const arr: B[] = (modelA as any)[this.modelKey];
                arr.push(...modelsB);
            } else {
                // This could happen in race conditions and simultanious requests

                console.warn("Warning: linking expected to affect " + modelsB.length + " rows, but only affected " + affectedRows + " rows");

                // TODO: Manually correct by doing a query (safest)
                throw new Error("Fallback behaviour net yet implemented");
            }
        }
    }

    /**
     * Delete all the links from modelA for this relation
     * @param modelA
     */
    async clearId(modelA: string | number): Promise<void> {
        const query = `DELETE FROM ${this.linkTable} WHERE ${this.linkKeyA} = ?`;

        // Arrays are turned into list, e.g. ['a', 'b'] turns into 'a', 'b'
        const [result] = await Database.delete(query, [modelA]);

        if (result.affectedRows == 0) {
            console.warn("Cleared many to many relation, but didn't deleted any entries");
        }
    }

    /**
     * Delete all the links from modelA for this relation
     * @param modelA
     */
    async clear(modelA: A): Promise<void> {
        this.clearId(modelA.getPrimaryKey()!);
        modelA.setManyRelation(this, []);
    }

    /**
     * Delete all the links from modelA for this relation
     * @param modelA
     */
    async syncId(modelA: string | number, modelsB: (string | number)[], linkTableValues?: { [key: string]: any[] }): Promise<void> {
        // todo: add transaction
        this.clearId(modelA);
        this.linkIds(modelA, modelsB, linkTableValues);
    }

    async unlink(modelA: A, ...modelsB: B[]): Promise<void> {
        const query = `DELETE FROM ${this.linkTable} WHERE ${this.linkKeyA} = ? AND ${this.linkKeyB} IN (?)`;

        // Arrays are turned into list, e.g. ['a', 'b'] turns into 'a', 'b'
        const [result] = await Database.delete(query, [modelA.getPrimaryKey(), modelsB.map((modelB) => modelB.getPrimaryKey())]);

        if (this.isLoaded(modelA)) {
            if (result.affectedRows == modelsB.length) {
                const arr: B[] = (modelA as any)[this.modelKey];
                const idMap = modelsB.map((model) => model.getPrimaryKey());
                modelA.setManyRelation(
                    this,
                    arr.filter((model) => {
                        return !idMap.includes(model.getPrimaryKey());
                    })
                );
            } else {
                // This could happen in race conditions and simultanious requests
                console.warn("Warning: unlinking expected to affect " + modelsB.length + " rows, but only affected " + result.affectedRows + " rows");

                // TODO: Manually correct by doing a query (safest)
                throw new Error("Fallback behaviour net yet implemented");
            }
        }
    }
}
