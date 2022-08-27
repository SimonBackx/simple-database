import { Database } from "./Database";
import { Model } from "./Model";
import { ModelWith, Relation } from "./relations/ToOne";

export type ModelConstructor<M extends Model> = { new (): M } & typeof Model;
export type ParseWhereArguments = [whereOrColumn: Where | Where[] | WhereEqualShort | ColumnSelector, signOrValue?: ColumnValue | WhereSign, value?: ColumnValue]

export class Query<M extends Model>{
    model: ModelConstructor<M>;
    _where: Where | null = null
    _join: Join<Model>[] = []

    constructor(model: ModelConstructor<M>) {
        this.model = model
    }

    get table(): string {
        return this.model.table;
    }

    clone(): this {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const c = (new (this.constructor as any)(this.model)) as this
        Object.assign(c, this);
        c._join = this._join.slice();
        return c;
    }

    static parseWhere(...[whereOrColumn, signOrValue, value]: ParseWhereArguments): Where {
        if (signOrValue !== undefined && isColumnSelector(whereOrColumn)) {
            const column = whereOrColumn;

            const w = new WhereEqual(column, signOrValue, value)
            return w
        }

        if (signOrValue === undefined && typeof whereOrColumn === 'string') {
            throw new Error(`Invalid where query: ${whereOrColumn} cannot be undefined`)
        }

        const where = whereOrColumn;

        if(Array.isArray(where)) {
            if (where.length == 0) {
                throw new Error('Empty where')
            }

            let c = where[0]
            for (const w of where.slice(1)) {
                c = c.and(w)
            }
            return c;
        }

        if (!(where instanceof Where)) {
             return this.parseWhere(
                Object.keys(where).map(key => {
                    const value = where[key];
                    const w = new WhereEqual(key, value);
                    return w;
                })
            );
        }

        return where;
    }

    where(...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        const c = this.clone();
        if (!c._where) {
            c._where = w;
            return c;
        }
        c._where = c._where.and(w);
        return c;
    }

    andWhere(...args: ParseWhereArguments): this {
        return this.where(...args)
    }

    orWhere(...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        const c = this.clone();
        if (!c._where) {
            c._where = w;
            return c;
        }
        c._where = c._where.or(w);
        return c;
    }

    whereNot(...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        return this.andWhere(new WhereNot(w))
    }

    andWhereNot(...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        return this.andWhere(new WhereNot(w))
    }

    orWhereNot(...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        return this.orWhere(new WhereNot(w))
    }

    join(model: ModelSelector<Model>, ...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        const c = this.clone();
        c._join.push(new Join(model, w))
        return c;
    }

    leftJoin(model: ModelSelector<Model>, ...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        const c = this.clone();
        c._join.push(new Join(model, w, JoinType.Left))
        return c;
    }

    rightJoin(model: ModelSelector<Model>, ...args: ParseWhereArguments): this {
        const w = Query.parseWhere(...args)
        const c = this.clone();
        c._join.push(new Join(model, w, JoinType.Right))
        return c;
    }
}

enum JoinType {
    'Inner' = 'Inner',
    'Left' = 'Left',
    'Right' = 'Right'
}

export class Join<M extends Model> {
    /**
     * Whether this join result should be selected
     */
    select = true;

    model: ModelConstructor<M>
    _namespace?: string
    type: JoinType
    _on: Where | null = null

    get table(): string {
        return this.model.table
    }

    get namespace() {
        return this._namespace ?? this.model.table
    }

    constructor(model: ModelSelector<M>, on: Where | null = null, type = JoinType.Inner) {
        if (isNamespacedModel(model)) {
            this._namespace = model.namespace
            this.model = model.model
        } else {
            this.model = model;
        }
        this._on = on;
        this.type = type
    }

    getSQL(options: WhereSQLOptions): [query: string, params: ColumnRawValue[]] {
        const namespace = this.namespace;
        let query = '';

        switch (this.type) {
            case JoinType.Left: query = 'LEFT JOIN'; break;
            case JoinType.Right: query = 'RIGHT JOIN'; break;
            case JoinType.Inner: query = 'JOIN'; break;
        }

        query += ` ${Database.escapeId(this.table)}`
        if (this.table !== namespace) {
            query += ` AS ${Database.escapeId(namespace)}`
        }

        const params: any[] = []
        
        if (this._on) {
            const [whereQuery, whereParams] = this._on.getSQL({
                ...options,
                defaultNamespace: namespace
            });
            query += ` ON ${whereQuery}`
            params.push(...whereParams)
        }

        return [query, params];
    }
}

/// Allows to set a namespace for a model
type ModelSelector<M extends Model> = NamespacedModel<M> | ModelConstructor<M>;
type NamespacedModel<M extends Model> = {
    namespace: string; model: ModelConstructor<M>
}
function isNamespacedModel<M extends Model>(a: any): a is NamespacedModel<M> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return typeof a === 'object' && a.namespace && typeof a.namespace === 'string' && a.model
}

type ColumnSelector = {
    column: string; namespace?: string; model?: typeof Model
} | string;
type ColumnValue = ColumnSelector | ColumnRawValue;
export type ColumnRawValue = string | Date | number | boolean | null | ColumnRawValue[];

type WhereEqualShort = { [key: string]: ColumnValue }
type WhereSQLOptions = {
    defaultNamespace?: string
};

function isColumnSelector(a: any): a is ColumnSelector {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return typeof a === 'string' || (typeof a === 'object' && a.column && typeof a.column === 'string' && (a.namespace === undefined || typeof a.namespace === 'string'))
}

export class Where {
    and(where: Where): Where {
        return new WhereAnd(this, where);
    }

    or(where: Where): Where {
        return new WhereOr(this, where);
    }

    get isSingle(): boolean {
        return false;
    }

    getSQL(options: WhereSQLOptions): [query: string, params: ColumnRawValue[]] {
        return ['', []]
    }
}

function columnToString(column: ColumnSelector, defaultNamespace?: string): string {
    if (typeof column === 'string') {
        if (defaultNamespace) {
            return `${Database.escapeId(defaultNamespace)}.${Database.escapeId(column)}`
        }
        return Database.escapeId(column)
    }
    return columnToString(column.column, column.namespace ?? column.model?.table ?? defaultNamespace);
}

export enum WhereSign {
    Equal = 'Equal',
    NotEqual = 'NotEqual'
}

export class WhereEqual extends Where {
    column: ColumnSelector;
    sign = WhereSign.Equal
    value: ColumnValue;
    
    constructor (column: ColumnSelector, sign: WhereSign, value: ColumnValue)
    constructor (column: ColumnSelector, value: ColumnValue)
    constructor (column: ColumnSelector, signOrValue: ColumnValue | WhereSign, value?: ColumnValue)
    constructor (column: ColumnSelector, signOrValue: ColumnValue | WhereSign, value?: ColumnValue) {
        super()
        this.column = column;

        if (value !== undefined) {
            this.value = value;
            this.sign = signOrValue as WhereSign;
        } else {
            this.value = signOrValue;
        }
    }

    clone(): this {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const c = (new (this.constructor as any)(this.column, this.sign, this.value)) as this
        Object.assign(c, this);
        return c;
    }

    get isSingle(): boolean {
        return true;
    }

    inverted(): this {
        return this.clone().invert()
    }

    invert(): this {
        if (this.sign === WhereSign.Equal) {
            this.sign = WhereSign.NotEqual
        } else {
            this.sign = WhereSign.Equal
        }
        return this;
    }

    getSQL(options: WhereSQLOptions): [query: string, params: ColumnRawValue[]] {
        if (Array.isArray(this.value)) {
            return [
                `${columnToString(this.column, options.defaultNamespace)} ${(this.sign === WhereSign.NotEqual) ? 'NOT IN' : 'IN'} (?)`, 
                [this.value]
            ]
        }

        if (typeof this.value === 'string' || typeof this.value === 'number' || typeof this.value === 'boolean' || this.value instanceof Date) {
            return [
                `${columnToString(this.column, options.defaultNamespace)} ${(this.sign === WhereSign.NotEqual) ? '!=' : '='} ?`, 
                [this.value]
            ]
        }

        if (this.value === null) {
            return [
                `${columnToString(this.column, options.defaultNamespace)} IS ${(this.sign === WhereSign.NotEqual) ? 'NOT ' : ''}NULL`, 
                []
            ]
        }

        return [
            `${columnToString(this.column, options.defaultNamespace)} ${(this.sign === WhereSign.NotEqual) ? '!=' : '='} ${columnToString(this.value, options.defaultNamespace)}`, 
            []
        ]
    }
}

export class WhereAnd extends Where {
    a: Where
    b: Where

    constructor (a: Where, b: Where) {
        super()
        this.a = a;
        this.b = b;
    }

    getSQL(options: WhereSQLOptions): [query: string, params: ColumnRawValue[]] {
        const sqlA = this.a.getSQL(options);
        const sqlB = this.b.getSQL(options);

        let [queryA] = sqlA;
        let [queryB] = sqlB;

        const [, paramsA] = sqlA;
        const [, paramsB] = sqlB;

        // Optimize brackets
        if (!this.a.isSingle) {
            queryA = `(${queryA})`
        }
        if (!this.b.isSingle) {
            queryB = `(${queryB})`
        }

        return [
            `${queryA} AND ${queryB}`, 
            [
                ...paramsA, 
                ...paramsB
            ]
        ]
    }
}

export class WhereOr extends Where {
    a: Where
    b: Where

    constructor (a: Where, b: Where) {
        super()
        this.a = a;
        this.b = b;
    }

    getSQL(options: WhereSQLOptions): [query: string, params: ColumnRawValue[]] {
        const sqlA = this.a.getSQL(options);
        const sqlB = this.b.getSQL(options);

        let [queryA] = sqlA;
        let [queryB] = sqlB;

        const [, paramsA] = sqlA;
        const [, paramsB] = sqlB;

        // Optimize brackets
        if (!this.a.isSingle) {
            queryA = `(${queryA})`
        }
        if (!this.b.isSingle) {
            queryB = `(${queryB})`
        }

        return [
            `${queryA} OR ${queryB}`, 
            [
                ...paramsA, 
                ...paramsB
            ]
        ]
    }
}

export class WhereNot extends Where {
    a: Where

    constructor (a: Where) {
        super()
        this.a = a;
    }

    get isSingle(): boolean {
        return this.a.isSingle;
    }

    getSQL(options: WhereSQLOptions): [query: string, params: ColumnRawValue[]] {
        // Optimize query
        if (this.a instanceof WhereEqual) {
            return this.a.inverted().getSQL(options);
        }

        const [queryA, paramsA] = this.a.getSQL(options);

        return [
            `NOT (${queryA})`, 
            [
                ...paramsA,
            ]
        ]
    }
}

export class SelectQuery<M extends Model> extends Query<M> {
    columns?: string[]
    _limit: {limit: number, offset?: number}

    constructor(model: ModelConstructor<M>, columns?: string[]) {
        super(model)
        this.columns = columns
    }

    clone(): this {
        const c = super.clone()
        c.postFetch = c.postFetch.slice();
        return c;
    }

    limit(limit: number, offset?: number): this {
        const c = this.clone();
        c._limit = {limit, offset}
        return c;
    }

    getSQL(): [query: string, params: any[]] {
        const namespace = this.model.table;
        let select = this.columns ? this.columns.join(', ') : this.model.getDefaultSelect(namespace)
        const joinSelects = this._join.filter(j => j.select).map(j => j.model.getDefaultSelect(j.namespace)).join(', ')
        if (joinSelects) {
            select += ', ' + joinSelects;
        }

        let query = `SELECT ${select} FROM ${Database.escapeId(this.table)}`
        const params: any[] = []

        if (this._join) {
            for (const join of this._join) {
                const [joinQuery, joinParams] = join.getSQL({
                    defaultNamespace: namespace
                });
                query += ` ${joinQuery}`
                params.push(...joinParams)
            }
        }
        
        if (this._where) {
            const [whereQuery, whereParams] = this._where.getSQL({
                defaultNamespace: namespace
            });
            query += ` WHERE ${whereQuery}`
            params.push(...whereParams)
        }

        if (this._limit !== undefined) {
            query += ` LIMIT ${this._limit.limit}`

            if (this._limit.offset) {
                query += ` OFFSET ${this._limit.offset}`
            }
        }

        return [query, params];
    }

    /*withEager<Key extends keyof any, B extends Model>(key: Key, query: ((ids: (string | number)[]) => SelectQuery<B>)): SelectQuery<M & Record<Key, B[]>> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this as any;
    }*/

    postFetch: ((models: M[], rows: any[]) => Promise<void>)[] = []

    with<R extends Relation<any, any>>(relation: R): SelectQuery<ModelWith<M, R>> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return

        return relation.apply(this);
    }

    async fetch(): Promise<M[]> {
        const [query, params] = this.getSQL()
        const [rows] = await Database.select(query, params);
        
        const models = this.model.fromRows(rows, this.table) ;

        /*for (const {relation, namespace} of this.loadRelations) {
            const modelsB = relation.model.fromRows(rows, namespace);

            for (const model of models) {
                const found = modelsB.find(m => m.getPrimaryKey() === model[relation.foreignKey])
                if (!found) {
                    throw new Error("Could not load many to one relation: no match found when loading")
                }
                model.setRelation(relation, found)
            }
        }*/

        for (const postFetch of this.postFetch) {
            await postFetch(models, rows)
        }

        return models;
    }

    async first(): Promise<M | undefined> {
        return (await this.limit(1).fetch())[0]
    }
}