import { Decoder, encodeObject, ObjectData } from "@simonbackx/simple-encoding";

import { ColumnType } from "../decorators/Column";

export class Column {
    type: ColumnType;
    name: string;
    nullable = false;
    primary = false;

    /**
     * Do not save the model if this is the only field that has changed
     */
    skipUpdate = false;
    decoder: Decoder<any> | undefined;
    beforeSave?: (value?: any) => any | Promise<any>;

    // Allow handling of new fields etc
    beforeLoad?: (value?: any) => any;

    static jsonVersion = 0;

    constructor(type: ColumnType, name: string) {
        this.type = type;
        this.name = name;
    }

    saveProperty(data: any): any {
        return this.to(data);
    }

    isChanged(old: any, now: any): boolean {
        return this.saveProperty(now) !== old;
    }

    /// Convert from database to javascript
    from(data: any): any {
        if (this.beforeLoad) {
            data = this.beforeLoad(data);
        }
        if (this.nullable && data === null) {
            return null;
        }
        if (!this.nullable && data === null) {
            throw new Error("Received null value from database. Expected a non-nullable value for " + this.name);
        }
        switch (this.type) {
            case "integer":
                // Mapped correctly by MySQL
                if (!Number.isInteger(data)) {
                    throw new Error("Expected integer");
                }
                return data;

            case "number":
                // Mapped correctly by MySQL
                if (Number.isNaN(data)) {
                    throw new Error("Expected number");
                }
                return data;

            case "string":
                return data;

            case "boolean":
                // Mapped correctly by MySQL
                if (data !== 1 && data !== 0) {
                    throw new Error("Expected boolean");
                }
                return data === 1;

            case "date":
                // Correctly mapped by node MySQL
                return data;

            case "datetime":
                // Mapped correctly by node MySQL
                return data;

            case "json": {
                // Mapped correctly by node MySQL
                let parsed: any;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    // Syntax error. Mark this in the future.
                    console.error(e);
                    parsed = {};
                }

                if (this.decoder) {
                    if (parsed.version === undefined && parsed.value === undefined) {
                        // Fallback decoding without version (since we don't know the saved version)
                        return this.decoder.decode(new ObjectData(parsed, { version: 0 }, this.name));
                    }
                    return this.decoder.decode(new ObjectData(parsed.value, { version: parsed.version }, this.name));
                } else {
                    console.warn("It is recommended to always use a decoder for JSON columns");
                }

                // If data comes from before version encoding, fall back to parsed
                return parsed.version !== undefined && parsed.value !== undefined ? parsed.value : parsed;
            }

            default: {
                // If we get a compile error heres, a type is missing in the switch
                const t: never = this.type;
                throw new Error("Type " + t + " not supported");
            }
        }
    }

    /// Convert to database from javascript
    to(data: any): any {
        if (this.nullable && data === null) {
            return null;
        }
        if (!this.nullable && data === null) {
            throw new Error("Tried to set null to non-nullable value. Expected a non-nullable value");
        }

        switch (this.type) {
            case "integer":
                // Mapped correctly by MySQL
                return data;

            case "number":
                // Mapped correctly by node MySQL
                return data;

            case "string":
                return data;

            case "boolean":
                return data ? 1 : 0;

            case "date":
                // Correctly mapped by node MySQL
                return data;

            case "datetime":
                // Mapped correctly by node MySQL
                return data;

            case "json": {
                const version = (this.constructor as typeof Column).jsonVersion;

                return JSON.stringify({
                    version: version,
                    value: encodeObject(data, { version }),
                });
            }

            default: {
                // If we get a compile error heres, a type is missing in the switch
                const t: never = this.type;
                throw new Error("Type " + t + " not supported");
            }
        }
    }
}
