import { test, expect } from "@playwright/test";
import { compileDeploymentLocationImport, normalizeRow } from "@/lib/deploymentLocationsImport";

test.describe("Deployment location import deduplication", () => {
  test("retains duplicate outlet_codes when name/address/state differ and skips exact duplicates", () => {
    const rows = [
      {
        state: "Lagos",
        outlet_name: "Alpha Salon",
        address: "12 Baker Street",
        owner_name: "Owner A",
        brand_type: "Beauty",
        outlet_code: "CODE-001"
      },
      {
        state: "Lagos",
        outlet_name: "Beta Salon",
        address: "34 Oxford Street",
        owner_name: "Owner B",
        brand_type: "Beauty",
        outlet_code: "CODE-001"
      },
      {
        state: "Lagos",
        outlet_name: "Alpha Salon",
        address: "12 Baker Street",
        owner_name: "Owner A",
        brand_type: "Beauty",
        outlet_code: "CODE-001"
      }
    ];

    const normalized = rows.map((row) => normalizeRow(row)).map((item) => {
      if ("error" in item) throw new Error(item.error);
      return item.data;
    });

    const existingRows = [
      {
        state: "Lagos",
        outlet_name: "Gamma Salon",
        address: "56 High Street",
        outlet_code: "CODE-002"
      }
    ];

    const result = compileDeploymentLocationImport(normalized, existingRows);

    expect(result.rowsToInsert.length).toBe(2);
    expect(result.skippedExactDuplicates).toBe(1);
    expect(result.outletCodeCollisionsRetained).toBe(1);
    expect(result.rowsToInsert[0].outlet_code).toBe("CODE-001");
    expect(result.rowsToInsert[1].outlet_code).toBe("CODE-001");
  });

  test("imports row with blank outlet_code and exact duplicate skip based on key only", () => {
    const rows = [
      {
        state: "Lagos",
        outlet_name: "Delta Salon",
        address: "78 Main Road",
        owner_name: "Owner D",
        brand_type: "Beauty",
        outlet_code: ""
      },
      {
        state: "Lagos",
        outlet_name: "Delta Salon",
        address: "78 Main Road",
        owner_name: "Owner D",
        brand_type: "Beauty",
        outlet_code: null
      }
    ];

    const normalized = rows.map((row) => normalizeRow(row)).map((item) => {
      if ("error" in item) throw new Error(item.error);
      return item.data;
    });

    const result = compileDeploymentLocationImport(normalized, []);

    expect(result.rowsToInsert.length).toBe(1);
    expect(result.skippedExactDuplicates).toBe(1);
    expect(result.outletCodeCollisionsRetained).toBe(0);
  });
});
