import { describe, expect, it } from "vitest";
import { parseApplicationImport, parseJobImport, recordsToText } from "@/lib/import-export";

const validJob = {
  job_id: "11111111-1111-4111-8111-111111111111",
  employer_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Backend API Engineer",
  company: "HelioHire",
  primary_stack: "Python / FastAPI",
  experience_level: "Mid",
  source: "Direct",
  required_skills: ["Python", "FastAPI"],
  nice_to_have_skills: [],
  experience_range: { min_years: 3, max_years: 6 },
  salary_offered: { currency: "USD", min_amount: 85000, max_amount: 120000 },
  job_description_text: "Build internal matching APIs and maintain backend reliability for hiring workflows.",
  portfolio_required: false,
};

const validApplication = {
  candidate_id: "3303fbcf-c50d-4c18-a7ad-b90fc77c48be",
  candidate_label: "Maya R. - Backend engineer",
  skills: ["Python", "FastAPI", "PostgreSQL"],
  years_of_experience: 5,
  salary_expectation: { currency: "USD", min_amount: 90000, max_amount: 118000 },
  portfolio_url: "https://profiles.example.com/maya",
  portfolio_projects: [],
  extracted_text:
    "Backend engineer with five years building FastAPI services, PostgreSQL schemas, Docker deployments, and reliable APIs.",
  video_transcript: "I focus on practical backend systems and maintainable API contracts for product teams.",
};

describe("job import and export", () => {
  it("previews valid and invalid JSON records per record", () => {
    const preview = parseJobImport(
      JSON.stringify([
        validJob,
        {
          ...validJob,
          job_id: "not-valid",
          required_skills: [],
          salary_offered: { currency: "US", min_amount: 120000, max_amount: 80000 },
        },
      ]),
      "json",
    );

    expect(preview.valid).toHaveLength(1);
    expect(preview.invalid).toHaveLength(1);
    expect(preview.invalid[0].issues.some((issue) => issue.field === "job_id")).toBe(true);
  });

  it("parses YAML and exports text in the selected format", () => {
    const yaml = recordsToText([validJob], "yaml");
    const preview = parseJobImport(yaml, "yaml");

    expect(preview.valid).toHaveLength(1);
    expect(recordsToText(preview.valid, "json")).toContain("Backend API Engineer");
  });

  it("reports syntax errors without throwing", () => {
    const preview = parseJobImport("[", "json");

    expect(preview.syntaxError).toBeTruthy();
    expect(preview.valid).toHaveLength(0);
  });
});

describe("application import and export", () => {
  it("previews valid and invalid JSON records per record", () => {
    const preview = parseApplicationImport(
      JSON.stringify([
        validApplication,
        {
          ...validApplication,
          candidate_id: "not-valid",
          skills: [],
          salary_expectation: { currency: "US", min_amount: 120000, max_amount: 80000 },
        },
      ]),
      "json",
    );

    expect(preview.valid).toHaveLength(1);
    expect(preview.invalid).toHaveLength(1);
    expect(preview.invalid[0].issues.some((issue) => issue.field === "candidate_id")).toBe(true);
  });

  it("parses YAML and exports text in the selected format", () => {
    const yaml = recordsToText([validApplication], "yaml");
    const preview = parseApplicationImport(yaml, "yaml");

    expect(preview.valid).toHaveLength(1);
    expect(recordsToText(preview.valid, "json")).toContain("Maya R.");
  });

  it("reports validation issues for incomplete YAML records", () => {
    const preview = parseApplicationImport("- candidate_id:", "yaml");

    expect(preview.syntaxError).toBeUndefined();
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid.length).toBeGreaterThan(0);
  });
});
