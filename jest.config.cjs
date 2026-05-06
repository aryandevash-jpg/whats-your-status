/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  testMatch: ["**/*.test.ts", "**/*.integration.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
