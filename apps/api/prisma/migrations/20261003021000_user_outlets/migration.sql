-- CreateTable
CREATE TABLE "user_outlets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,

    CONSTRAINT "user_outlets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_outlets_user_id_outlet_id_key" ON "user_outlets"("user_id", "outlet_id");

-- AddForeignKey
ALTER TABLE "user_outlets" ADD CONSTRAINT "user_outlets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlets" ADD CONSTRAINT "user_outlets_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
