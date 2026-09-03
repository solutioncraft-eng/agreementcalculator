import assert from "node:assert/strict";
import test from "node:test";
import { FAQ, absoluteUrl, landingJsonLd, siteUrl, siteVerification } from "../src/lib/seo";

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("the canonical origin comes from the configured base URL, without a trailing slash", () => {
  withEnv({ APP_BASE_URL: "https://www.agreementcalculator.com/", APP_ROOT_DOMAIN: undefined }, () => {
    assert.equal(siteUrl(), "https://www.agreementcalculator.com");
    assert.equal(absoluteUrl("/signup"), "https://www.agreementcalculator.com/signup");
  });
});

test("the root domain is used when no base URL is configured", () => {
  withEnv({ APP_BASE_URL: undefined, APP_ROOT_DOMAIN: "agreementcalculator.com" }, () => {
    assert.equal(siteUrl(), "https://agreementcalculator.com");
  });
});

test("search console tokens are emitted only when configured, whether pasted bare or as the whole tag", () => {
  withEnv({ GOOGLE_SITE_VERIFICATION: undefined, BING_SITE_VERIFICATION: undefined }, () => {
    assert.deepEqual(siteVerification(), {});
  });
  withEnv({ GOOGLE_SITE_VERIFICATION: " abc123 ", BING_SITE_VERIFICATION: undefined }, () => {
    assert.deepEqual(siteVerification(), { google: "abc123" });
  });
  withEnv(
    {
      GOOGLE_SITE_VERIFICATION: '<meta name="google-site-verification" content="tok-en" />',
      BING_SITE_VERIFICATION: "B1NG",
    },
    () => {
      assert.deepEqual(siteVerification(), { google: "tok-en", other: { "msvalidate.01": "B1NG" } });
    },
  );
});

test("structured data is valid JSON describing the product, its price and the page's own FAQ", () => {
  withEnv({ APP_BASE_URL: "https://www.agreementcalculator.com", APP_ROOT_DOMAIN: undefined }, () => {
    const graph = JSON.parse(landingJsonLd()) as {
      "@graph": { "@type": string; offers?: { price: number; priceCurrency: string }; mainEntity?: unknown[] }[];
    };

    const software = graph["@graph"].find((node) => node["@type"] === "SoftwareApplication");
    assert.ok(software, "SoftwareApplication is described");
    assert.equal(software.offers?.price, 69);
    assert.equal(software.offers?.priceCurrency, "USD");

    const faq = graph["@graph"].find((node) => node["@type"] === "FAQPage");
    // Every question in the schema is rendered on the page, and vice versa.
    assert.equal(faq?.mainEntity?.length, FAQ.length);
  });
});
