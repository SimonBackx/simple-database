import { Database } from "../src/classes/Database";

console.log = jest.fn();
afterAll(async () => {
    await Database.end();
});
