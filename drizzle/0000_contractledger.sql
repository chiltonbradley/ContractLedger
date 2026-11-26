CREATE TABLE cl_companies (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, folder TEXT NOT NULL, policy_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX cl_company_owner ON cl_companies(owner_id);
--> statement-breakpoint
CREATE TABLE cl_reviews (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES cl_companies(id), fingerprint TEXT NOT NULL, state_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, lease_token TEXT, lease_until INTEGER, updated_at TEXT NOT NULL, UNIQUE(company_id,fingerprint));
--> statement-breakpoint
CREATE INDEX cl_review_company ON cl_reviews(company_id);
--> statement-breakpoint
CREATE TABLE cl_versions (review_id TEXT NOT NULL REFERENCES cl_reviews(id), version INTEGER NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY(review_id,version));
