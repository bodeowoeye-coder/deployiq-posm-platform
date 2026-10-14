import { seedE1CBuildFixture } from "./lib/e1c-build-uat.mjs";

const outputPath = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
if (!outputPath) throw new Error("e1c_output_path_required");
const manifest = await seedE1CBuildFixture({ outputPath });
console.log(`E1C synthetic fixture ready: ${manifest.fixture.projectCode}`);
console.log(`Manifest written with restricted permissions: ${outputPath}`);
