// First dotenv
import 'dotenv/config';

// Continue
import { Database } from '../src/classes/Database';

export default async () => {
    await Database.delete('DELETE FROM `_testModels_testModels`');
    await Database.delete('DELETE FROM `testModels`');
    await Database.end();
};
