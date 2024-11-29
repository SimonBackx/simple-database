// First dotenv
import 'dotenv/config';

// Continue
import { Migration } from './src/classes/Migration';

const start = async () => {
    await Migration.runAll(__dirname + '/src/migrations');
};

start()
    .catch((error) => {
        console.error('unhandledRejection', error);
        process.exit(1);
    })
    .finally(() => {
        process.exit();
    });
