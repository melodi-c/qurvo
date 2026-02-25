ALTER TABLE "projects" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;
ALTER TABLE "projects" ADD COLUMN "demo_scenario" varchar(50);
