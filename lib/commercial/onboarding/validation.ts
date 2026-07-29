export function validateOrganisationInput(data: Record<string, unknown>) {
  const errors: string[] = [];
  const organisationName = typeof data.organisationName === "string" ? data.organisationName.trim() : "";
  const contactPerson = typeof data.contactPerson === "string" ? data.contactPerson.trim() : "";
  const businessEmail = typeof data.businessEmail === "string" ? data.businessEmail.trim() : "";
  const phoneNumber = typeof data.phoneNumber === "string" ? data.phoneNumber.trim() : "";
  const country = typeof data.country === "string" ? data.country.trim() : "";
  const website = typeof data.companyWebsite === "string" ? data.companyWebsite.trim() : "";

  if (!organisationName) errors.push("Organisation name is required.");
  if (!contactPerson) errors.push("Contact person is required.");
  if (!businessEmail) errors.push("Business email is required.");
  if (!phoneNumber) errors.push("Phone number is required.");
  if (!country) errors.push("Country is required.");
  if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) errors.push("Business email must be a valid email address.");
  if (phoneNumber && !/^\+?[0-9\s().-]{7,15}$/.test(phoneNumber)) errors.push("Phone number format is not supported.");
  if (website && !/^https?:\/\//i.test(website)) errors.push("Company website must start with http:// or https://.");
  if (organisationName.length > 120) errors.push("Organisation name is too long.");
  if (contactPerson.length > 120) errors.push("Contact person name is too long.");
  if (businessEmail.length > 160) errors.push("Business email is too long.");

  return { errors, isValid: errors.length === 0 };
}

export function validateRetailSetup(data: Record<string, unknown>) {
  const errors: string[] = [];
  const campaignName = typeof data.campaignName === "string" ? data.campaignName.trim() : "";
  const projectName = typeof data.projectName === "string" ? data.projectName.trim() : "";
  const brandName = typeof data.brandName === "string" ? data.brandName.trim() : "";
  const startDate = typeof data.expectedStartDate === "string" ? data.expectedStartDate : "";
  const endDate = typeof data.expectedEndDate === "string" ? data.expectedEndDate : "";

  if (!campaignName) errors.push("Campaign name is required.");
  if (!projectName) errors.push("Project name is required.");
  if (!brandName) errors.push("Brand name is required.");
  if (!startDate) errors.push("Expected start date is required.");
  if (!endDate) errors.push("Expected end date is required.");
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) errors.push("End date must not be earlier than the start date.");

  return { errors, isValid: errors.length === 0 };
}

export function validateCapacityInput(value: unknown) {
  const errors: string[] = [];
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push("Capacity must be a whole number.");
    return { errors, isValid: false };
  }
  if (!Number.isInteger(value)) errors.push("Capacity must be a whole number.");
  if (value <= 0) errors.push("Capacity must be greater than zero.");
  if (value > 100000) errors.push("Capacity exceeds the configured maximum.");
  return { errors, isValid: errors.length === 0 };
}
