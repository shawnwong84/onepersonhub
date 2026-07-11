-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "isUnscoped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 4 built-in roles with the exact permission set the
-- previously-hardcoded PERMISSIONS const in src/lib/rbac.ts held,
-- so behavior is unchanged immediately after this migration.

INSERT INTO "Role" ("id", "name", "label", "isBuiltIn", "isUnscoped", "createdAt", "updatedAt") VALUES ('ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'viewer', 'Viewer', true, false, NOW(), NOW());
INSERT INTO "Role" ("id", "name", "label", "isBuiltIn", "isUnscoped", "createdAt", "updatedAt") VALUES ('21b1ff73-4249-42df-8e31-a1148ba1e588', 'agent', 'Agent', true, false, NOW(), NOW());
INSERT INTO "Role" ("id", "name", "label", "isBuiltIn", "isUnscoped", "createdAt", "updatedAt") VALUES ('7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'supervisor', 'Supervisor', true, true, NOW(), NOW());
INSERT INTO "Role" ("id", "name", "label", "isBuiltIn", "isUnscoped", "createdAt", "updatedAt") VALUES ('5de860a9-ac68-4e34-801d-dab179f54ffd', 'admin', 'Admin', true, true, NOW(), NOW());

INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('0da27931-7fb6-4eff-9a81-9900953ccd97', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'conversations:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('e0ab76d9-a176-428e-be7b-4933403f64cf', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'conversations:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('af913d5c-95b8-4ab2-8e54-d66c7d3d49ed', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'conversations:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('b49fc932-27a0-4826-b883-db0cd9e910a4', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'conversations:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('8c9013e9-6002-4fea-99c5-e6e8c3724282', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'conversations:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ea7acf3d-46b3-4e36-b6c3-f8c44ca9defd', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'conversations:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('17c88a76-4950-45b2-943d-624b610ba795', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'conversations:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('9af90083-8918-4a0c-a1a2-e92f4a457fed', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'conversations:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('aa68ead1-5924-40d3-a2a7-64da5c20a698', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'conversations:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('2f3ac10e-57df-436c-bbf6-d045fd437b6e', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'conversations:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('3162c359-fc4b-43ca-b937-2b8039166f73', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'conversations:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('6e1a8b9a-665b-4510-a383-cf2bb856cbd4', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'conversations:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('fb4852ef-1188-443b-93b0-4419958eb619', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'conversations:assign', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('7b57e126-7f86-4997-a0ab-a802fcf95c54', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'conversations:assign', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('b79df6bb-15aa-410f-b24b-f1812fd8cdb7', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'conversations:transfer', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('876557f9-70d5-4041-8615-ac8267814712', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'conversations:transfer', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('54f74152-6935-446b-b374-28e4afc0291f', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'conversations:transfer', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('eb4de398-9459-4627-87c7-ea0dacf5538b', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'messages:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('2993877c-8a9d-4098-956b-4c4b31a7a32d', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'messages:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('a1efbdb8-fa27-4710-81af-064d87e46a68', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'messages:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ccdafd1a-3e38-4280-acee-250850f7367f', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'messages:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('4b48cc02-1bb3-4c92-b2c9-9965fd04cd1a', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'messages:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('0cf39f78-3363-4354-8bda-092dd37c19eb', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'messages:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('01aae162-276b-45c9-8aa6-2126ffc74125', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'messages:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('0eaa170f-972c-4999-b32a-e76eab516aaa', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'tickets:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('265b705e-fc49-4093-9baa-e60939513791', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'tickets:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('9ab2442a-7be1-41ea-862c-4095e87471e8', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'tickets:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('45f33e72-bfa2-4c75-a0d0-42529d0de0dd', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'tickets:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('67469032-590d-4350-b1da-90aa8c226bac', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'tickets:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('299a0c61-471e-4585-a50d-c64578cc2c4f', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'tickets:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('65168e0f-e979-420b-9329-eb08de208386', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'tickets:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('200c1468-af00-4cc6-8527-eb2fde8a9a1a', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'tickets:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('bc93c492-0963-422b-8a19-2891b2829301', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'tickets:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('158ac33e-183a-4700-a9fb-268f06155412', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'tickets:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('072d3c69-741c-41ad-a07c-9ad416941aa2', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'tickets:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('4acb9cb3-7e7a-4932-bea4-f6befdc12b76', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'tickets:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('c0f8a1b2-c6f9-4b4b-b0d0-24c79f70f172', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'customers:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ac14be77-030d-488e-bb30-accfd7c66d08', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'customers:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('f8e28e31-5545-4bd2-a1a3-555d45255dd0', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'customers:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('82dc43dd-1765-4203-bea1-b9b809379172', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'customers:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('52d517d1-ea6e-4d08-afb0-d1ee6caf56dd', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'customers:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('366f3143-33a9-4cea-99ab-e8c2c55bba16', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'customers:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('d11679fd-e1ff-4860-a7fc-b804ed0a49c0', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'customers:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('e287f4d2-b884-47e3-afc9-884325571046', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'customers:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('3fa187c7-138c-4646-8606-64058c10ff34', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'customers:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('8ad158be-2bb0-4217-877e-c4583e0976e8', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'customers:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('e4dc0bbd-7d1d-49df-ae70-f34340bf4577', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'customers:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('bbed5340-e41b-4517-82d3-08ce36142629', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'customers:export', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('82bc69da-e40d-4eef-bb60-b6c563fd790b', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'customers:export', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('183a433a-be7f-4284-af2b-dfd75db49693', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'knowledge:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('185f4f87-08b8-4d6a-bc86-5f85b2214d65', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'knowledge:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('5b9da187-03e8-4f12-9a39-8c1a3a74053c', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'knowledge:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('cddcc2b0-1321-4ea1-8ac0-affcb8481b1c', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'knowledge:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('d7885bef-b9d9-42fb-b941-f9b220414370', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'knowledge:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('305f56b7-8b33-49ab-bb04-a77db55081a3', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'knowledge:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('334ce0be-5f29-4671-a61f-00bc03097959', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'knowledge:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('139405d6-0847-4b37-ae6c-b497de6fc8d1', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'knowledge:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('d9deec82-e5f0-465b-994e-17448c645d10', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'knowledge:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('e1792277-644f-4506-9b86-990c926b0d72', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'team:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('7399eaa8-032c-48b1-90c6-45798e6818e8', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'team:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('36c3ab37-7de9-4041-9229-8bcceb29fc13', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'team:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('5dd8c0b4-db1c-4543-9a22-6c3d17bd6cdc', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'team:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('dce52842-9099-4ba8-9d45-e751ad3b95b3', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'team:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('e1a22039-6b0d-4397-a3b4-969afbeff97f', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'team:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('680f4bd6-fcba-4356-8fcd-3e6b8888aa03', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'team:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('2ea9362c-ce8e-49ce-8d76-d32c3f4e22aa', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'automation:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('081ca0b6-a925-4717-b5ea-0c1589cdda23', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'automation:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('1aeb8076-de82-4f4d-91c8-61ebc151e361', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'automation:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('09112d0b-c1a7-4ae5-b35b-49c141ca56d2', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'automation:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ba05dc2a-29ae-4935-a2b6-8bcd7fcd534a', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'automation:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('cc348aea-19e5-4c9b-bbc3-96678c61bc40', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'automation:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('488f9272-428a-44be-bfac-6d30f4e8ab86', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'automation:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('6da45cee-5748-4cee-a423-3a33c480b70e', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'automation:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('1ee56763-5b77-4e33-bc0c-4fb1ffb98411', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'automation:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('6678e569-444d-4ae8-b443-cc0167bdffb0', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'agents:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('a0229622-a541-44c9-8174-d0c6b66f67aa', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'agents:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('5d2b1023-fb42-4b7d-b256-d35e97c8c8e3', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'agents:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('08ca7e13-c236-4c84-a5c9-beec46a3740a', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'agents:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('47b2b393-ad7a-40f8-9eea-13fcd2536426', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'agents:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('2ebebc1e-c853-4d2c-9bf8-1b1139e5b096', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'agents:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('bec6db82-e3ac-4fe9-8ccd-2c702da5ceef', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'agents:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('42c081a8-9549-4957-bd55-753bd9c91f3e', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'agents:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('5fc957fb-3781-4f74-b31d-bc26efa4a890', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'agents:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('0ebe0fc5-881f-4cdc-9ce1-a7faabac29a1', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'webhooks:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('7484fe9c-6e75-4845-8a38-3a4ce4c596a3', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'webhooks:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('1892f4b3-caae-47c6-bece-8967a24150a0', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'webhooks:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('92ece686-1a51-481a-a98d-fe9379734936', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'webhooks:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('530e1a6b-fb59-419b-b42c-806c74effe43', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'webhooks:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('46adba14-fcd5-465e-9ec2-a608473f5644', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'settings:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('230afa8c-34d5-44c0-80e7-c6fe90d5af16', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'settings:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('2d4dbd85-04bc-40fc-a84a-c02113f01c45', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'admin:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('d30b023d-285c-4312-8f09-5b98506f97fb', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'admin:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ae6779b1-99cc-4cdd-9f2a-0c5a907ae2bb', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'admin:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('c6ebf03a-9a67-4c80-a68c-9a7fb76b2b66', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'admin:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('1cd74ef3-233e-45e0-b138-9a92f8c7f925', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'analytics:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('70842e6b-75d6-4650-bfc0-bba5e06d7c8e', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'analytics:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('1d6a6d7a-5274-44ef-8ef1-f99978ef6a40', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'analytics:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('691c6113-ea95-4c7c-86d0-16c5db16b309', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'analytics:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('9fe1a053-b376-4556-a96c-a7c1238fb55a', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'analytics:export', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('904faa9a-e416-466e-867f-722450e6e83a', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'analytics:export', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('2c488e11-bbf9-49c9-9207-6f342e567bb5', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'activity:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('a9f6a2dc-372a-4f37-b9e2-7915f26dfba7', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'activity:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('b30dfb72-18f8-47fc-b707-cfe064c27ae1', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'marketplace:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('59477bf2-59ba-40bf-abbc-21da5d12a2c9', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'marketplace:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('1f68c943-b2c3-4f47-9af3-5d7eea0a574b', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'marketplace:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('40cc062e-6dfb-46ca-99e3-57443620db53', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'marketplace:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('3a0413d3-d4dd-4c16-ad8e-c8db64e78301', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'marketplace:install', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('a814d2c9-232d-4c3c-9c4b-81138d56eccc', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'marketplace:manage', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('f9666c16-8f8c-47bb-aee9-16dcbe0a9f88', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'module:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ff76ff97-5706-4165-b9dd-fae4fe90fadf', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'module:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('13597e81-d3a7-47d0-94a7-531c39cfe82a', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'module:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('d87a3628-bb80-41b5-b40e-0165521f0850', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'module:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('7ebae29a-993f-47e8-99a1-e6eeb1961723', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'module:write', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('0785c033-c9ba-4e44-a718-ebfb1edec11b', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'module:write', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('cbdddc2d-e0d7-414c-8a9f-92716de9a2bd', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'module:write', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('56233402-76a9-4310-8b08-9406c5c4c8e0', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'channels:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('9e881e79-bff2-4ea0-bf75-240d4fc6dc8b', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'channels:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('b8068505-1a7b-49b0-b080-cb4192820122', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'channels:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('d9c685e2-59d4-4f70-be39-bff907844fa6', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'channel-accounts:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('7f4e6fda-a1a5-4524-9189-59eda4d121dc', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'channel-accounts:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('734764bb-d68b-4669-95ec-fa98166d0a44', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'channel-accounts:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('f180b406-46f8-4070-9442-74ce9d179b80', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'channel-accounts:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('4b0d8647-d8a2-4c5a-ac3c-084be26e8f8a', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'channel-accounts:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('50d384a1-edfd-41bd-8d5c-6b735c3a845f', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'channel-accounts:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('0adc848c-4c1f-4bb9-a2a0-188dcaec7d5a', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'channel-accounts:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ca25e117-e2ea-4aa2-a9ab-1cec3cf730d7', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'sla:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('3371cc9d-e82e-4a2e-a1c6-87ecc05767d5', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'sla:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('918754e5-f1a6-4381-b713-602e4455c2ce', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'sla:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('4c0cc039-0e32-42e9-b943-5d69620e6f67', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'sla:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('10428ffc-6b78-4b8d-b2f7-fa7a180dcc22', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'sla:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('9533158d-96d6-411a-9487-c46903459d18', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'sla:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('e5630cc9-2bff-491e-835a-59da6ac59228', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'sla:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('24cda8fd-e85b-4033-98bc-d0e412116c83', 'ce087881-c3b1-48b0-9540-1bf3bc7a655a', 'business-hours:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('ffe7a23d-0894-48a4-bbb7-2f45d7a6e834', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'business-hours:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('29139802-3034-4946-8329-09999d724995', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'business-hours:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('e2ff75b8-4824-4936-a54a-7cc9f4e99ba9', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'business-hours:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('7cc5e7e9-c713-4b39-b815-e4322ed28f75', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'business-hours:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('00828c1a-cbc9-4954-a926-b29e27eac217', '21b1ff73-4249-42df-8e31-a1148ba1e588', 'canned:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('66bb0121-bb9c-4aa9-a2dd-4310ddbf67b9', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'canned:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('90e47131-5270-485c-a275-4c3d3ba577cc', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'canned:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('cf5e009d-71dc-488d-b439-8d05c6c235aa', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'canned:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('007a8c93-c7e2-4863-8f20-0a031d55b8b9', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'canned:create', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('4a127b9a-dedf-4da9-8857-8fdea01e69a0', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'canned:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('dfd8b7d3-4a91-4107-b2ac-accee312b645', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'canned:update', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('f5569ede-02d5-4019-96c2-850ba82abeaf', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'canned:delete', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('5ac4bb47-1395-4fcd-8b47-57947384e972', '7d2e8c63-6d20-41c0-9792-90a86c730d8f', 'export:read', NOW());
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") VALUES ('758653be-a7ff-429e-886d-082c4f123923', '5de860a9-ac68-4e34-801d-dab179f54ffd', 'export:read', NOW());
