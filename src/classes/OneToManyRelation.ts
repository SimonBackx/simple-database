import { Database } from "./Database";
import { Model } from "./Model";

export class OneToManyRelation<Key extends keyof any, A extends Model, B extends Model> {
    modelA: { new (): A } & typeof Model;
    modelB: { new (): B } & typeof Model;

    /**
     * Foreign key of the other model that references the current model
     */
    foreignKey: keyof B;

    /**
     * E.g. categories
     */
    modelKey: Key;

    constructor(modelA: { new (): A } & typeof Model, modelB: { new (): B } & typeof Model, modelKey: Key, foreignKey: keyof B) {
        this.modelA = modelA;
        this.modelB = modelB;
        this.modelKey = modelKey;
        this.foreignKey = foreignKey;
    }

    /// Whether this relation is loaded
    isLoaded(model: A): model is A & Record<Key, B> {
        // Also not loaded if null, since it should be an empty array or an array if it is loaded
        return Array.isArray((model as any)[this.modelKey]);
    }

    /**
     * Generate a join query
     * @param namespaceA namespace in the SQL query of modelA
     * @param namespaceB namespace in the SQL query of modelB
     */
    joinQuery(namespaceA: string, namespaceB: string): string {
        return `LEFT JOIN ${this.modelB.table} as ${namespaceB} on ${namespaceB}.${this.foreignKey} = ${namespaceA}.${this.modelA.primary.name}\n`;
    }

    /// Load the relation of a model and return the loaded models
    async load(modelA: A): Promise<B[]> {
        const namespaceB = "B";
        let str = `SELECT ${this.modelB.getDefaultSelect(namespaceB)} FROM ${this.modelB.table} as ${namespaceB}\n`;
        str += `WHERE ${namespaceB}.${this.foreignKey} = ?`;

        const [rows] = await Database.select(str, [modelA.getPrimaryKey()]);
        const modelsB = this.modelB.fromRows(rows, namespaceB) as B[];
        modelA.setManyRelation(this, modelsB);
        return modelsB;
    }
}
