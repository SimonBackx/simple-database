import { Database } from './Database';
import { Model } from "./Model";

export class ManyToOneRelation<Key extends keyof any, M extends Model> {
    model: { new (): M } & typeof Model;

    /**
     * E.g. addressId
     */
    foreignKey: string;

    /**
     * E.g. address
     */
    modelKey: Key;

    constructor(model: { new (): M } & typeof Model, modelKey: Key) {
        this.model = model;
        this.modelKey = modelKey;
    }

    /// Whether this relation is loaded
    isLoaded(model: Model): boolean /*model is Model & Record<Key, M>*/ {
        return (model as any)[this.modelKey] !== undefined;
    }

    /// Whether this relation is set
    isSet(model: Model): boolean /*model is Model & Record<Key, M>*/ {
        return (model as any)[this.modelKey] !== undefined && (model as any)[this.modelKey] !== null;
    }

    /// Generate a join query
    joinQuery(namespaceA: string, namespaceB: string): string {
        return `LEFT JOIN ${this.model.table} as ${namespaceB} on ${namespaceB}.${this.model.primary.name} = ${namespaceA}.${this.foreignKey}\n`;
    }

    /// Load the relation of a list of models
    async load(modelsA: Model[]) {
        let str = `SELECT ${this.model.getDefaultSelect()} FROM ${this.model.table}\n`;
        str += `WHERE ${this.model.primary.name} IN (?)`;
       
        const [rows] = await Database.select(str, [modelsA.map(m => m[this.foreignKey])]);
        const modelsB = this.model.fromRows(rows, this.model.table) as M[];
       
        for (const model of modelsA) {
            model.setOptionalRelation(this, modelsB.find(m => m.getPrimaryKey() === model[this.foreignKey]) ?? null)
        }
        return modelsB;
    }
}
