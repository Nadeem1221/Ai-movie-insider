/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  preset: "ts-jest",
  roots: ["<rootDir>/__tests__"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"]
};
