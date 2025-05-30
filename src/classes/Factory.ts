import BoyNames from './data/boys';
import FamilyNames from './data/family-names';
import GirlNames from './data/girls';

export abstract class Factory<Options, Model> {
    options: Options;
    constructor(options: Options) {
        this.options = options;
    }
    abstract create(): Promise<Model>;

    randomArray(arr: Array<any>): any {
        const int = Math.floor(Math.random() * arr.length);
        return arr[int];
    }

    randomEnum<E extends { [key: number]: string | number }>(e: E): E[keyof E] {
        return this.randomArray(Object.values(e));
    }

    randomString(length: number): string {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const charactersLength = characters.length;
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }

    randomFirstName(gender: 'Male' | 'Female' | 'Other'): string {
        let names: string[];
        switch (gender) {
            case 'Male':
                names = BoyNames;
                break;
            case 'Female':
                names = GirlNames;
                break;
            case 'Other':
                names = [...BoyNames, ...GirlNames];
                break;
        }
        return this.randomArray(names);
    }

    randomLastName(): string {
        return this.randomArray(FamilyNames);
    }

    async createMultiple(amount = 40): Promise<Model[]> {
        const arr: Model[] = [];
        for (let index = 0; index < amount; index++) {
            arr.push(await this.create());
        }
        return arr;
    }
}
