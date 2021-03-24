CREATE TABLE "system"."Configuration"("key" text NOT NULL, "value" jsonb NOT NULL, PRIMARY KEY ("key") , FOREIGN KEY ("key") REFERENCES "system"."ConfigurationKey"("name") ON UPDATE cascade ON DELETE restrict);
