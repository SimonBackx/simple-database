import { Decoder } from '@simonbackx/simple-encoding';

import { Column } from '../classes/Column';
import { ManyToOneRelation } from '../classes/ManyToOneRelation';
import { Model } from '../classes/Model';

export type ColumnType = 'integer' | 'number' | 'string' | 'date' | 'datetime' | 'boolean' | 'json';

export function column<Key extends keyof any, Value extends Model>(settings: {
    type: ColumnType;
    primary?: boolean;
    nullable?: boolean;
    decoder?: Decoder<any>;
    /**
     * Do not save the model if this is the only field that has changed
     */
    skipUpdate?: boolean;
    beforeSave?: (value?: any) => any;
    beforeLoad?: (value?: any) => any;
    foreignKey?: ManyToOneRelation<Key, Value>;
}) {
    return (target: any /* future typeof Model */, key: string) => {
        if (!target.constructor.columns) {
            target.constructor.columns = new Map<string, Column>();
        }

        if (settings.foreignKey) {
            settings.foreignKey.foreignKey = key;

            if (!target.constructor.relations) {
                target.constructor.relations = [];
            }

            target.constructor.relations.push(settings.foreignKey);
        }

        const column = new Column(settings.type, key);
        column.beforeSave = settings.beforeSave;
        column.beforeLoad = settings.beforeLoad;

        if (settings.decoder) {
            column.decoder = settings.decoder;
        }

        if (settings.nullable) {
            column.nullable = true;
        }

        if (settings.skipUpdate !== undefined) {
            column.skipUpdate = settings.skipUpdate;
        }
        if (settings.primary) {
            if (target.constructor.primary) {
                throw new Error('Duplicate primary column ' + key);
            }
            target.constructor.primary = column;
            column.primary = true;
        }

        target.constructor.columns.set(key, column);
    };
}
