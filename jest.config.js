module.exports = {
    preset: "ts-jest",
    roots: ["<rootDir>"],
    testEnvironment: "node",
    setupFiles: ["dotenv/config"],
    setupFilesAfterEnv: ["dotenv/config", "jest-extended", "./tests/jest.setup.ts"],
    moduleDirectories: [
        "node_modules",
    ],
    globalSetup: "./tests/jest.global.setup.ts"
    //verbose: true,
};
