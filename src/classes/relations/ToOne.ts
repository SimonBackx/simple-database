import { Model } from "../Model"
import { ModelConstructor, SelectQuery } from "../Query"


export type ModelWith<B, R> = B & Record<RelationKey<R>, RelationValue<R>>
type OptionalRelation<R> = Relation<RelationKey<R>, RelationValue<R> | null>;

export interface Relation<Key extends string, B> {
    modelKey: Key

    /// We need this here to fix type interference in TypeScript not working otherwise
    _fixTypingB: B

    load<ModelA extends Model>(models: ModelA[]): Promise<(ModelA & Record<Key, B>)[]>
    apply<Before extends Model>(query: SelectQuery<Before>): SelectQuery<Before & Record<Key, B>>
}

export type RelationKey<R> = R extends Relation<infer K, any> ? K : never;
export type RelationValue<R> = R extends Relation<any, infer M> ? M : never;


function uniqueArray<T>(array: T[]): T[] {
    function onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }

    return array.filter(onlyUnique);
}

export abstract class RelationBase<Key extends string, B extends Model> {
    modelKey: Key
    model: ModelConstructor<B>;

    constructor(modelKey: Key) {
        this.modelKey = modelKey;
    }

    clone(): this {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const c = (new (this.constructor as any)(this.model)) as this
        Object.assign(c, this);
        c._withRelations = this._withRelations.slice();
        return c;
    }

    apply<T extends RelationBase<any, any>, Before extends Model>(this: T, query: SelectQuery<Before>): any {
        throw new Error('Not implemented')
    }

    _withRelations: Relation<string, any>[] = []

    /**
     * For proper type interference in TypeScript, we need to override this method for all subclasses 😬
     */
    with<R extends Relation<string, any>>(relation: R): unknown {
        const c = this.clone();
        c._withRelations.push(relation);
        return c
    }

    /**
     * For proper type interference in TypeScript, we need to override this method for all subclasses 😬
     */
    load<ModelA extends Model>(models: ModelA[]): unknown {
        throw new Error('Not implemented')
    }
}

export class ToOne<Key extends string, B extends Model> extends RelationBase<Key, B> implements Relation<Key, B>{
    foreignKey: string;
    model: ModelConstructor<B>;
    _fixTypingB: B;
    _optional = false

    constructor(model: ModelConstructor<B>, modelKey: Key, foreignKey: string) {
        super(modelKey);
        this.model = model;
        this.foreignKey = foreignKey;
    }

    with<R extends Relation<any, any>>(relation: R): ToOne<Key, ModelWith<B, R>> {
        return super.with(relation) as ToOne<Key, ModelWith<B, R>>
    }

    optional(): OptionalRelation<this> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        const c = this.clone() as any
        c._optional = true;
        return c;
    }

    async load<ModelA extends Model>(models: ModelA[]): Promise<(ModelA & Record<Key, B>)[]> {
        const ids = uniqueArray(models.map(m => m[this.foreignKey] as string))
        if (ids.length === 0) {
            this.setRelations([], models)
            return models;
        }

        let relationQuery = new SelectQuery(this.model)
            .where({
                [this.model.primary.name]: ids
            })

        for (const r of this._withRelations) {
            relationQuery = relationQuery.with(r)
        }

        const loadedRelations = await relationQuery.fetch()
        this.setRelations(loadedRelations, models)
        return models
    }

    private setRelations<ModelA extends Model>(loadedRelations: B[], models: ModelA[]): asserts models is (ModelA & Record<Key, B>)[] {
        for (const model of models) {
            if (this._optional && model[this.foreignKey] === null) {
                model.setRelation(this, null)
                continue;
            }

            const found = loadedRelations.find(m => m.getPrimaryKey() === model[this.foreignKey])
            if (!found) {
                throw new Error(`Could not load toOne relation: no match found when loading ${this.model.table} for ${model.static.table}.${model.getPrimaryKey().toString()}`)
            }

            model.setRelation(this, found)
        }
    }

    apply<Before extends Model>(query: SelectQuery<Before>): SelectQuery<Before & Record<Key, B>> {
        // todo: pass namespace to join
        const namespace = this.model.table

        const q = this._optional ? query.leftJoin(this.model, {
            [this.model.primary.name]: {
                column: this.foreignKey,
                model: query.model
            }
        }) : query.join(this.model, {
            [this.model.primary.name]: {
                column: this.foreignKey,
                model: query.model
            }
        });

        q.postFetch.push(async (models: Before[], rows) => {
            // Add relations
            const loadedRelations = this.model.fromRows(rows, namespace);
            
            // Load extra relations
            for (const r of this._withRelations) {
                await r.load(loadedRelations)
            }

            this.setRelations(loadedRelations, models)
            return Promise.resolve()
        });
        
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return q as any;
    }
}

export class ToMany<Key extends string, B extends Model> extends RelationBase<Key, B> implements Relation<Key, B[]> {
    foreignKey: string;
    model: ModelConstructor<B>;
    _fixTypingB: B[];

    constructor(model: ModelConstructor<B>, modelKey: Key, foreignKey: string) {
        super(modelKey);
        this.model = model;
        this.foreignKey = foreignKey;
    }

    with<R extends Relation<any, any>>(relation: R): ToMany<Key, ModelWith<B, R>> {
        return super.with(relation) as ToMany<Key, ModelWith<B, R>>
    }

    private setRelations<ModelA extends Model>(loadedRelations: B[], models: ModelA[]): asserts models is (ModelA & Record<Key, B[]>)[] {
        for (const model of models) {
            model.setRelation(this, loadedRelations.filter(r => r[this.foreignKey] === model.getPrimaryKey()))
        }
    }

    async load<ModelA extends Model>(models: ModelA[]): Promise<(ModelA & Record<Key, B[]>)[]> {
        const ids = uniqueArray(models.map(m => m.getPrimaryKey()))
        if (ids.length === 0) {
            this.setRelations([], models);
            return models;
        }

        let relationQuery = new SelectQuery(this.model)
            .where(this.foreignKey, ids)

        for (const r of this._withRelations) {
            relationQuery = relationQuery.with(r)
        }
        
        const loadedRelations = await relationQuery.fetch();
        this.setRelations(loadedRelations, models);
        return models;
    }

    apply<Before extends Model>(query: SelectQuery<Before>): any {
        const q = query.clone();

        q.postFetch.push(async (models: Before[], rows) => {
            await this.load(models)
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return q as any;
    }

    otherMethod() {
        // test
    }
}

export class ManyToMany <Key extends string, B extends Model> extends RelationBase<Key, B> {
    testmethod() {
        // test
    }
}

/*
class Toy extends Model {
    static colors = new ToMany<"colors", Color>()
}

class Color extends Model {
    static toys = new ToMany<"toys", Toy>()
}

class Dog extends Model {
    static toys = new ToMany<"toys", Toy>()
    static friends = new ManyToMany<"friends", Dog>()
    static bestFriend = new ToOne(Dog, 'bestFriend', 'best_friend_id')
}


const toysWithColors = Dog.toys.with(Toy.colors)

const query = new SelectQuery(Dog)
    .with(
        toysWithColors
    )
const dogs = await query.fetch();
const firstColor = dogs[0].toys[0].colors[0]

const dogsWithBestFriend = await Dog.bestFriend.load(dogs)
dogsWithBestFriend
dogs
*/