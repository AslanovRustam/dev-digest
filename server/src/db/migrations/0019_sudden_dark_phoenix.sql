CREATE TABLE "skill_context_docs" (
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "skill_context_docs_skill_id_path_pk" PRIMARY KEY("skill_id","path"),
	CONSTRAINT "skill_context_docs_path_chk" CHECK (char_length("skill_context_docs"."path") between 1 and 1024),
	CONSTRAINT "skill_context_docs_position_chk" CHECK ("skill_context_docs"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_context_docs" (
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "agent_context_docs_agent_id_path_pk" PRIMARY KEY("agent_id","path"),
	CONSTRAINT "agent_context_docs_path_chk" CHECK (char_length("agent_context_docs"."path") between 1 and 1024),
	CONSTRAINT "agent_context_docs_position_chk" CHECK ("agent_context_docs"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD CONSTRAINT "skill_context_docs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_context_docs" ADD CONSTRAINT "agent_context_docs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_context_docs_position_uq" ON "skill_context_docs" USING btree ("skill_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_context_docs_position_uq" ON "agent_context_docs" USING btree ("agent_id","position");