module.exports = {
    roots: ['<rootDir>/dist'],
    testEnvironment: 'node',
    setupFiles: ['dotenv/config'],
    setupFilesAfterEnv: ['dotenv/config', 'jest-extended', './dist/tests/jest.setup.js'],
    moduleDirectories: [
        'node_modules',
    ],
    globalSetup: './dist/tests/jest.global.setup.js',
    // verbose: true,
};
